/**
 * Signature verification utilities for brute-forcing the correct algorithm
 * when the detected algorithm doesn't work.
 *
 * Uses @noble/curves for ECDSA (NIST and Brainpool curves) and @noble/hashes
 * for all hash algorithms. RSA verification uses react-native-fast-rsa library.
 */

import { sha1 } from "@noble/hashes/legacy.js"
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import { p256, p384, p521 } from "@noble/curves/nist.js"
import { brainpoolP256r1, brainpoolP384r1, brainpoolP512r1 } from "@noble/curves/misc.js"
import RSA, { Hash as RSAHash, SaltLength } from "react-native-fast-rsa"
import { RSAPublicKey, rsaEncryption } from "@peculiar/asn1-rsa"
import { SubjectPublicKeyInfo } from "@peculiar/asn1-x509"
import { AsnSerializer, AsnIntegerBigIntConverter } from "@peculiar/asn1-schema"
import { PemConverter } from "@peculiar/x509"
import type { PassportViewModel } from "@zkpassport/utils"
import { extractTBS, getRSAInfo, getECDSAInfo } from "@zkpassport/utils"

// Hash algorithm types
export type HashAlgorithmName = "sha512" | "sha384" | "sha256" | "sha224" | "sha1"

// All hash algorithms to try during brute force
const HASH_ALGORITHMS: HashAlgorithmName[] = ["sha512", "sha384", "sha256", "sha224", "sha1"]

// Hash functions mapping
const HASH_FUNCTIONS: Record<HashAlgorithmName, (data: Uint8Array) => Uint8Array> = {
  sha512: (data) => sha512(data),
  sha384: (data) => sha384(data),
  sha256: (data) => sha256(data),
  sha224: (data) => sha224(data),
  sha1: (data) => sha1(data),
}

// Map hash algorithm names to react-native-fast-rsa Hash enum values
const HASH_TO_RSA_HASH: Record<HashAlgorithmName, RSAHash> = {
  sha512: RSAHash.SHA512,
  sha384: RSAHash.SHA384,
  sha256: RSAHash.SHA256,
  sha224: RSAHash.SHA224,
  sha1: RSAHash.SHA1,
}

// Signature size threshold to distinguish between ECDSA and RSA
// ECDSA P-521 max signature size is 66 + 66 = 132 bytes (r and s coordinates)
// RSA-1024 (highly unlikely) would be 128 bytes, so 132 is a safe threshold
const ECDSA_RSA_THRESHOLD = 132

// Result type for successful algorithm detection
export interface DetectedAlgorithm {
  type: "RSA" | "ECDSA"
  hashAlgorithm: HashAlgorithmName
  // RSA-specific fields
  rsaScheme?: "pkcs" | "pss"
  modulusBits?: number
  // ECDSA-specific fields
  curveFamily?: "nist" | "brainpool"
  curveName?: string
}

/**
 * Extract signature and message bytes from passport for verification
 */
function extractSignatureData(passport: PassportViewModel): {
  signature: Uint8Array
  message: Uint8Array
} {
  const signature = passport.sod.signerInfo.signature.toUInt8Array()
  // The message that was signed is the signedAttrs (signed attributes)
  const message = passport.sod.signerInfo.signedAttrs.bytes.toUInt8Array()
  return { signature, message }
}

/**
 * Convert BigInt to ArrayBuffer using peculiar's AsnIntegerBigIntConverter
 */
function bigIntToASN1IntegerBuffer(value: bigint): ArrayBuffer {
  const integer = AsnIntegerBigIntConverter.toASN(value)
  return integer.valueBlock.valueHexView.slice().buffer
}

/**
 * Create RSA public key in SPKI PEM format from modulus and exponent
 */
function createRSAPublicKeyPEM(modulus: bigint, exponent: bigint): string {
  // Create RSAPublicKey structure with properly encoded integers
  const rsaPublicKey = new RSAPublicKey({
    modulus: bigIntToASN1IntegerBuffer(modulus),
    publicExponent: bigIntToASN1IntegerBuffer(exponent),
  })

  // Serialize RSAPublicKey to DER
  const rsaPublicKeyDer = AsnSerializer.serialize(rsaPublicKey)

  // Create SubjectPublicKeyInfo wrapping the RSA public key
  const spki = new SubjectPublicKeyInfo({
    algorithm: rsaEncryption,
    subjectPublicKey: rsaPublicKeyDer,
  })

  // Serialize SubjectPublicKeyInfo to DER and convert to PEM
  const spkiDer = AsnSerializer.serialize(spki)
  return PemConverter.encode(spkiDer, PemConverter.PublicKeyTag)
}

/**
 * Verify RSA PKCS#1 v1.5 signature using react-native-fast-rsa
 */
async function verifyRSAPKCS(
  signature: Uint8Array,
  message: Uint8Array,
  modulus: bigint,
  exponent: bigint,
  hashAlgorithm: HashAlgorithmName,
): Promise<boolean> {
  try {
    const publicKeyPEM = createRSAPublicKeyPEM(modulus, exponent)
    const rsaHash = HASH_TO_RSA_HASH[hashAlgorithm]
    return await RSA.verifyPKCS1v15Bytes(signature, message, rsaHash, publicKeyPEM)
  } catch (error) {
    console.log("[SigVerify] RSA PKCS verification error:", error)
    return false
  }
}

/**
 * Verify RSA-PSS signature using react-native-fast-rsa
 */
async function verifyRSAPSS(
  signature: Uint8Array,
  message: Uint8Array,
  modulus: bigint,
  exponent: bigint,
  hashAlgorithm: HashAlgorithmName,
): Promise<boolean> {
  try {
    const publicKeyPEM = createRSAPublicKeyPEM(modulus, exponent)
    const rsaHash = HASH_TO_RSA_HASH[hashAlgorithm]
    // Try with AUTO salt length first (most common)
    return await RSA.verifyPSSBytes(signature, message, rsaHash, SaltLength.AUTO, publicKeyPEM)
  } catch (error) {
    console.log("[SigVerify] RSA PSS verification error:", error)
    return false
  }
}

/**
 * Verify RSA signature with either PKCS or PSS scheme
 */
async function verifyRSASignature(
  signature: Uint8Array,
  message: Uint8Array,
  modulus: bigint,
  exponent: bigint,
  hashAlgorithm: HashAlgorithmName,
  scheme: "pkcs" | "pss",
): Promise<boolean> {
  if (scheme === "pkcs") {
    return verifyRSAPKCS(signature, message, modulus, exponent, hashAlgorithm)
  } else {
    return verifyRSAPSS(signature, message, modulus, exponent, hashAlgorithm)
  }
}

/**
 * Parse ECDSA signature from DER format to r,s values
 */
function parseECDSASignatureDER(signature: Uint8Array): { r: Uint8Array; s: Uint8Array } | null {
  try {
    let offset = 0

    // Check SEQUENCE tag
    if (signature[offset++] !== 0x30) {
      return null
    }

    // Read sequence length
    let seqLen = signature[offset++]
    if (seqLen & 0x80) {
      const lenBytes = seqLen & 0x7f
      seqLen = 0
      for (let i = 0; i < lenBytes; i++) {
        seqLen = (seqLen << 8) | signature[offset++]
      }
    }

    // Read r INTEGER
    if (signature[offset++] !== 0x02) {
      return null
    }

    let rLen = signature[offset++]
    if (rLen & 0x80) {
      const lenBytes = rLen & 0x7f
      rLen = 0
      for (let i = 0; i < lenBytes; i++) {
        rLen = (rLen << 8) | signature[offset++]
      }
    }

    let r = signature.slice(offset, offset + rLen)
    offset += rLen

    // Remove leading zero if present
    if (r[0] === 0x00 && r.length > 1) {
      r = r.slice(1)
    }

    // Read s INTEGER
    if (signature[offset++] !== 0x02) {
      return null
    }

    let sLen = signature[offset++]
    if (sLen & 0x80) {
      const lenBytes = sLen & 0x7f
      sLen = 0
      for (let i = 0; i < lenBytes; i++) {
        sLen = (sLen << 8) | signature[offset++]
      }
    }

    let s = signature.slice(offset, offset + sLen)

    // Remove leading zero if present
    if (s[0] === 0x00 && s.length > 1) {
      s = s.slice(1)
    }

    return { r, s }
  } catch {
    return null
  }
}

/**
 * Pad byte array to specified length with leading zeros
 */
function padToLength(arr: Uint8Array, length: number): Uint8Array {
  if (arr.length >= length) {
    return arr.slice(arr.length - length)
  }
  const result = new Uint8Array(length)
  result.set(arr, length - arr.length)
  return result
}

/**
 * Verify ECDSA signature using noble curves
 */
function verifyECDSASignature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKeyBytes: Uint8Array,
  hashAlgorithm: HashAlgorithmName,
  curveFamily: "nist" | "brainpool",
  keySize: number,
): boolean {
  try {
    // Get the curve based on family and key size
    const curve = getECDSACurve(curveFamily, keySize)
    if (!curve) {
      return false
    }

    // Hash the message
    const messageHash = HASH_FUNCTIONS[hashAlgorithm](message)

    // Parse signature
    const parsed = parseECDSASignatureDER(signature)
    if (!parsed) {
      // Try raw signature format (r || s)
      const coordSize = Math.ceil(keySize / 8)
      if (signature.length === coordSize * 2) {
        const r = signature.slice(0, coordSize)
        const s = signature.slice(coordSize)
        return verifyWithCurve(curve, messageHash, r, s, publicKeyBytes, coordSize)
      }
      return false
    }

    const coordSize = Math.ceil(keySize / 8)
    const r = padToLength(parsed.r, coordSize)
    const s = padToLength(parsed.s, coordSize)

    return verifyWithCurve(curve, messageHash, r, s, publicKeyBytes, coordSize)
  } catch {
    return false
  }
}

/**
 * Get the appropriate curve object based on family and key size
 * Supports both NIST curves (P-256, P-384, P-521) and Brainpool curves
 */
function getECDSACurve(
  family: "nist" | "brainpool",
  keySize: number,
):
  | typeof p256
  | typeof p384
  | typeof p521
  | typeof brainpoolP256r1
  | typeof brainpoolP384r1
  | typeof brainpoolP512r1
  | null {
  if (family === "nist") {
    switch (keySize) {
      case 256:
        return p256
      case 384:
        return p384
      case 521:
        return p521
      default:
        return null
    }
  } else {
    // Brainpool curves
    switch (keySize) {
      case 256:
        return brainpoolP256r1
      case 384:
        return brainpoolP384r1
      case 512:
        return brainpoolP512r1
      default:
        return null
    }
  }
}

/**
 * Verify signature with specific curve (NIST or Brainpool)
 */
function verifyWithCurve(
  curve:
    | typeof p256
    | typeof p384
    | typeof p521
    | typeof brainpoolP256r1
    | typeof brainpoolP384r1
    | typeof brainpoolP512r1,
  messageHash: Uint8Array,
  r: Uint8Array,
  s: Uint8Array,
  publicKeyBytes: Uint8Array,
  coordSize: number,
): boolean {
  try {
    // Concatenate r and s for noble signature format
    const sig = new Uint8Array(coordSize * 2)
    sig.set(padToLength(r, coordSize), 0)
    sig.set(padToLength(s, coordSize), coordSize)

    // Noble curves expect the public key in uncompressed format (04 || x || y)
    let pubKey = publicKeyBytes
    if (pubKey.length === coordSize * 2) {
      // Add 04 prefix for uncompressed format
      const fullPubKey = new Uint8Array(1 + coordSize * 2)
      fullPubKey[0] = 0x04
      fullPubKey.set(pubKey, 1)
      pubKey = fullPubKey
    }

    return curve.verify(sig, messageHash, pubKey, { prehash: false })
  } catch {
    return false
  }
}

/**
 * Get the key size in bits from public key bytes
 */
function getKeySizeFromPublicKey(publicKeyBytes: Uint8Array): number {
  // Public key is usually in format 04 || x || y (uncompressed)
  // or just x || y
  let coordSize: number
  if (publicKeyBytes[0] === 0x04) {
    coordSize = (publicKeyBytes.length - 1) / 2
  } else {
    coordSize = publicKeyBytes.length / 2
  }

  // Map coordinate size to standard key sizes
  if (coordSize >= 64 && coordSize <= 66) return 521
  if (coordSize >= 48 && coordSize <= 49) return 384
  if (coordSize >= 32 && coordSize <= 33) return 256
  return coordSize * 8 // Fallback to bits
}

/**
 * Brute force RSA algorithm parameters
 * Returns the detected algorithm if verification succeeds, null otherwise
 */
export async function bruteForceRSA(
  signature: Uint8Array,
  message: Uint8Array,
  modulus: bigint,
  exponent: bigint,
): Promise<DetectedAlgorithm | null> {
  const modulusBits = modulus.toString(2).length

  // Try both PKCS and PSS with all hash algorithms
  const schemes: ("pkcs" | "pss")[] = ["pkcs", "pss"]

  for (const scheme of schemes) {
    for (const hashAlgorithm of HASH_ALGORITHMS) {
      const verified = await verifyRSASignature(
        signature,
        message,
        modulus,
        exponent,
        hashAlgorithm,
        scheme,
      )
      if (verified) {
        console.log(
          `[SigVerify] RSA signature verified with ${scheme.toUpperCase()} and ${hashAlgorithm}`,
        )
        return {
          type: "RSA",
          hashAlgorithm,
          rsaScheme: scheme,
          modulusBits,
        }
      }
    }
  }

  return null
}

/**
 * Brute force ECDSA algorithm parameters
 * Returns the detected algorithm if verification succeeds, null otherwise
 */
export function bruteForceECDSA(
  signature: Uint8Array,
  message: Uint8Array,
  publicKeyBytes: Uint8Array,
): DetectedAlgorithm | null {
  const keySize = getKeySizeFromPublicKey(publicKeyBytes)
  const families: ("nist" | "brainpool")[] = ["nist", "brainpool"]

  // Map key size to potential curve key sizes
  let keySizesToTry: number[]
  if (keySize >= 512) {
    keySizesToTry = [521, 512] // P-521 or brainpoolP512
  } else if (keySize >= 380) {
    keySizesToTry = [384] // P-384 or brainpoolP384
  } else {
    keySizesToTry = [256] // P-256 or brainpoolP256
  }

  for (const family of families) {
    for (const kSize of keySizesToTry) {
      for (const hashAlgorithm of HASH_ALGORITHMS) {
        if (
          verifyECDSASignature(signature, message, publicKeyBytes, hashAlgorithm, family, kSize)
        ) {
          console.log(
            `[SigVerify] ECDSA signature verified with ${family} ${kSize} and ${hashAlgorithm}`,
          )
          return {
            type: "ECDSA",
            hashAlgorithm,
            curveFamily: family,
            curveName: getCurveName(family, kSize),
          }
        }
      }
    }
  }

  return null
}

/**
 * Get curve name string for circuit matching
 */
function getCurveName(family: "nist" | "brainpool", keySize: number): string {
  if (family === "nist") {
    return `p${keySize}`
  } else {
    return `${keySize}r1`
  }
}

/**
 * Try to verify the signature and detect the correct algorithm
 * This is the main entry point for brute-forcing algorithm detection
 */
export async function detectAndVerifySignatureAlgorithm(
  passport: PassportViewModel,
): Promise<DetectedAlgorithm | null> {
  const { signature, message } = extractSignatureData(passport)

  // First, determine if this is likely RSA or ECDSA based on signature size
  const isLikelyECDSA = signature.length <= ECDSA_RSA_THRESHOLD

  // Extract the TBS certificate to get public key info
  const tbsCertificate = extractTBS(passport)
  if (!tbsCertificate) {
    console.log("[SigVerify] Failed to extract TBS certificate")
    return null
  }

  if (isLikelyECDSA) {
    // Try ECDSA first
    try {
      const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const publicKeyBytes = new Uint8Array(ecdsaInfo.publicKey)

      const result = bruteForceECDSA(signature, message, publicKeyBytes)
      if (result) {
        return result
      }
    } catch (e) {
      console.log("[SigVerify] ECDSA extraction failed:", e)
    }

    // If ECDSA failed, try RSA as fallback
    try {
      const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const result = await bruteForceRSA(signature, message, rsaInfo.modulus, rsaInfo.exponent)
      if (result) {
        return result
      }
    } catch (e) {
      console.log("[SigVerify] RSA extraction failed:", e)
    }
  } else {
    // Try RSA first
    try {
      const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const result = await bruteForceRSA(signature, message, rsaInfo.modulus, rsaInfo.exponent)
      if (result) {
        return result
      }
    } catch (e) {
      console.log("[SigVerify] RSA extraction failed:", e)
    }

    // If RSA failed, try ECDSA as fallback
    try {
      const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const publicKeyBytes = new Uint8Array(ecdsaInfo.publicKey)

      const result = bruteForceECDSA(signature, message, publicKeyBytes)
      if (result) {
        return result
      }
    } catch (e) {
      console.log("[SigVerify] ECDSA extraction failed:", e)
    }
  }

  return null
}

/**
 * Verify signature with the detected algorithm parameters
 */
export async function verifyWithDetectedAlgorithm(
  passport: PassportViewModel,
  detectedAlgorithm: DetectedAlgorithm,
): Promise<boolean> {
  const { signature, message } = extractSignatureData(passport)
  const tbsCertificate = extractTBS(passport)

  if (!tbsCertificate) {
    return false
  }

  try {
    if (detectedAlgorithm.type === "RSA") {
      const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
      return await verifyRSASignature(
        signature,
        message,
        rsaInfo.modulus,
        rsaInfo.exponent,
        detectedAlgorithm.hashAlgorithm,
        detectedAlgorithm.rsaScheme!,
      )
    } else {
      const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const publicKeyBytes = new Uint8Array(ecdsaInfo.publicKey)
      const keySize = getKeySizeFromPublicKey(publicKeyBytes)

      return verifyECDSASignature(
        signature,
        message,
        publicKeyBytes,
        detectedAlgorithm.hashAlgorithm,
        detectedAlgorithm.curveFamily!,
        keySize,
      )
    }
  } catch {
    return false
  }
}
