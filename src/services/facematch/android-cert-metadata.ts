import { AsnParser, AsnSerializer } from "@peculiar/asn1-schema"
import { Certificate } from "@peculiar/asn1-x509"
import { fromBER } from "asn1js"
import { AndroidSecurityLevel, AndroidKeyOrigin, OID_ANDROID_KEY_ATTESTATION } from "./asn"
import { CURVE_OIDS } from "@zkpassport/utils"

/**
 * Represents metadata extracted from Android credential/leaf certificate
 */
export interface AndroidCredentialMetadata {
  // Key Description level info
  attestationSecurityLevel: {
    level: AndroidSecurityLevel
    name: string
  }

  // Certificate info
  tbsSize?: number // Size of the TBS (To Be Signed) portion in bytes

  // How this certificate was signed by its parent
  signedBy?: {
    algorithm: string // e.g., "sha256WithRSAEncryption", "ecdsa-with-SHA384"
    digestAlgorithm: string // e.g., "SHA-256", "SHA-384"
    signatureAlgorithm: string // e.g., "RSA", "ECDSA"
    oid: string
  }

  // Authorization List info
  attestationApplicationId?: {
    value: string // Base64 encoded
    enforcedBy: "software" | "tee"
  }

  creationDateTime?: {
    value: Date
    timestamp: number // Milliseconds since epoch
    enforcedBy: "software" | "tee"
  }

  origin?: {
    value: AndroidKeyOrigin
    name: string
    enforcedBy: "software" | "tee"
  }

  // Additional useful metadata
  osVersion?: {
    value: number
    formatted: string // e.g., "13" for Android 13
    enforcedBy: "software" | "tee"
  }

  osPatchLevel?: {
    value: number
    formatted: string // e.g., "2023-10"
    enforcedBy: "software" | "tee"
  }
}

/**
 * Represents signature algorithm information for certificates
 */
export interface CertificateSignatureInfo {
  // Certificate info
  tbsSize?: number // Size of the TBS (To Be Signed) portion in bytes

  // How this certificate was signed by its parent
  signedBy: {
    algorithm: string // e.g., "sha256WithRSAEncryption", "ecdsa-with-SHA384"
    digestAlgorithm: string // e.g., "SHA-256", "SHA-384"
    signatureAlgorithm: string // e.g., "RSA", "ECDSA"
    oid: string
  }

  // What algorithm this certificate uses (from subject public key info)
  publicKeyAlgorithm: {
    algorithm: string // e.g., "RSA", "EC"
    keySize?: number // For RSA
    curve?: string // For EC (e.g., "P-256", "P-384")
    oid: string
  }
}

// OID mappings for signature algorithms
const SIGNATURE_ALGORITHM_OIDS: Record<
  string,
  { name: string; digest: string; signature: string }
> = {
  "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", digest: "SHA-1", signature: "RSA" },
  "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", digest: "SHA-256", signature: "RSA" },
  "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", digest: "SHA-384", signature: "RSA" },
  "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", digest: "SHA-512", signature: "RSA" },
  "1.2.840.113549.1.1.14": { name: "sha224WithRSAEncryption", digest: "SHA-224", signature: "RSA" },
  "1.2.840.10045.4.1": { name: "ecdsa-with-SHA1", digest: "SHA-1", signature: "ECDSA" },
  "1.2.840.10045.4.3.1": { name: "ecdsa-with-SHA224", digest: "SHA-224", signature: "ECDSA" },
  "1.2.840.10045.4.3.2": { name: "ecdsa-with-SHA256", digest: "SHA-256", signature: "ECDSA" },
  "1.2.840.10045.4.3.3": { name: "ecdsa-with-SHA384", digest: "SHA-384", signature: "ECDSA" },
  "1.2.840.10045.4.3.4": { name: "ecdsa-with-SHA512", digest: "SHA-512", signature: "ECDSA" },
}

// OID mappings for public key algorithms
const PUBLIC_KEY_ALGORITHM_OIDS: Record<string, string> = {
  "1.2.840.113549.1.1.1": "RSA",
  "1.2.840.10045.2.1": "EC",
}

/**
 * Parse Android Key Attestation extension manually
 */
function parseAndroidKeyAttestationExtension(extData: Uint8Array): any {
  const asn1 = fromBER(extData.buffer as ArrayBuffer)
  if (asn1.offset === -1) {
    throw new Error("Failed to parse ASN.1 structure")
  }

  const result: any = {
    softwareEnforced: {},
    teeEnforced: {},
  }

  const sequence = asn1.result as any
  if (!sequence.valueBlock || !sequence.valueBlock.value) {
    throw new Error("Invalid key attestation structure")
  }

  const values = sequence.valueBlock.value

  // Parse fixed fields
  if (values[0])
    result.attestationVersion = parseInt(
      Buffer.from(values[0].valueBlock.valueHex).toString("hex"),
      16,
    )
  if (values[1]) result.attestationSecurityLevel = values[1].valueBlock.valueDec
  if (values[2])
    result.keymasterVersion = parseInt(
      Buffer.from(values[2].valueBlock.valueHex).toString("hex"),
      16,
    )
  if (values[3]) result.keymasterSecurityLevel = values[3].valueBlock.valueDec
  if (values[4]) result.attestationChallenge = new Uint8Array(values[4].valueBlock.valueHex)
  if (values[5]) result.uniqueId = new Uint8Array(values[5].valueBlock.valueHex)

  // Parse authorization lists
  if (values[6]) {
    result.softwareEnforced = parseAuthorizationList(values[6])
  }
  if (values[7]) {
    result.teeEnforced = parseAuthorizationList(values[7])
  }

  return result
}

/**
 * Parse an authorization list
 */
function parseAuthorizationList(authList: any): any {
  const parsed: any = {}

  if (!authList.valueBlock || !authList.valueBlock.value) {
    return parsed
  }

  authList.valueBlock.value.forEach((item: any) => {
    const tag = item.idBlock.tagNumber

    switch (tag) {
      case 1: // purpose
        parsed.purpose = parseIntegerSet(item)
        break
      case 2: // algorithm
        parsed.algorithm = parseInteger(item)
        break
      case 3: // keySize
        parsed.keySize = parseInteger(item)
        break
      case 5: // digest
        parsed.digest = parseIntegerSet(item)
        break
      case 10: // ecCurve
        parsed.ecCurve = parseInteger(item)
        break
      case 503: // noAuthRequired
        parsed.noAuthRequired = true
        break
      case 701: // creationDateTime
        parsed.creationDateTime = parseInteger(item)
        break
      case 702: // origin
        parsed.origin = parseInteger(item)
        break
      case 704: // rootOfTrust
        parsed.rootOfTrust = item.valueBlock.value[0] // Raw sequence
        break
      case 705: // osVersion
        parsed.osVersion = parseInteger(item)
        break
      case 706: // osPatchLevel
        parsed.osPatchLevel = parseInteger(item)
        break
      case 709: // attestationApplicationId
        // This is an OctetString containing the attestation app ID structure
        if (item.valueBlock && item.valueBlock.value && item.valueBlock.value[0]) {
          const octetString = item.valueBlock.value[0]
          if (octetString.valueBlock && octetString.valueBlock.valueHex) {
            parsed.attestationApplicationId = parseAttestationAppId(
              new Uint8Array(octetString.valueBlock.valueHex),
            )
          }
        }
        break
      case 718: // vendorPatchLevel
        parsed.vendorPatchLevel = parseInteger(item)
        break
      case 719: // bootPatchLevel
        parsed.bootPatchLevel = parseInteger(item)
        break
    }
  })

  return parsed
}

/**
 * Parse integer from ASN.1 context tag
 */
function parseInteger(item: any): number {
  if (item.valueBlock && item.valueBlock.value && item.valueBlock.value[0]) {
    const intValue = item.valueBlock.value[0]
    if (intValue.valueBlock) {
      if (intValue.valueBlock.valueDec !== undefined) {
        return intValue.valueBlock.valueDec
      } else if (intValue.valueBlock.valueHex) {
        const hex = Buffer.from(intValue.valueBlock.valueHex).toString("hex")
        return parseInt(hex, 16)
      }
    }
  }
  return 0
}

/**
 * Parse integer set from ASN.1 context tag
 */
function parseIntegerSet(item: any): number[] {
  const values: number[] = []
  if (item.valueBlock && item.valueBlock.value && item.valueBlock.value[0]) {
    const set = item.valueBlock.value[0]
    if (set.valueBlock && set.valueBlock.value) {
      set.valueBlock.value.forEach((intItem: any) => {
        if (intItem.valueBlock && intItem.valueBlock.valueDec !== undefined) {
          values.push(intItem.valueBlock.valueDec)
        }
      })
    }
  }
  return values
}

/**
 * Parse attestation application ID
 */
function parseAttestationAppId(data: Uint8Array): string {
  try {
    const asn1 = fromBER(data.buffer as ArrayBuffer)
    if (asn1.offset === -1) return Buffer.from(data).toString("base64")

    const sequence = asn1.result as any
    if (!sequence.valueBlock || !sequence.valueBlock.value)
      return Buffer.from(data).toString("base64")

    // Look for a Set that contains package info (the first Set usually)
    const packageInfoSet = sequence.valueBlock.value.find(
      (item: any) => item.constructor.name === "Set" && item.valueBlock?.value?.length > 0,
    )

    if (packageInfoSet) {
      const result = parsePackageInfoSet(packageInfoSet)
      if (result) return result
    }

    // If we can't parse it properly, return the base64
    return Buffer.from(data).toString("base64")
  } catch (_error) {
    return Buffer.from(data).toString("base64")
  }
}

function parsePackageInfoSet(packageInfoSet: any): string {
  const results: string[] = []

  if (packageInfoSet.valueBlock && packageInfoSet.valueBlock.value) {
    packageInfoSet.valueBlock.value.forEach((packageInfo: any) => {
      // packageInfo should be a Sequence containing package name and version
      if (packageInfo.constructor.name === "Sequence" && packageInfo.valueBlock?.value) {
        let packageName = ""
        let version = ""

        packageInfo.valueBlock.value.forEach((item: any) => {
          // Look for OctetString items (package name is usually first, version second)
          if (item.constructor.name === "OctetString" && item.valueBlock?.valueHex) {
            const bytes = new Uint8Array(item.valueBlock.valueHex)
            const str = Buffer.from(bytes).toString("utf-8")

            // If it looks like a package name (contains dots), it's the package name
            if (str.includes(".") && str.match(/^[a-zA-Z][a-zA-Z0-9._]*$/)) {
              packageName = str
            }
          } else if (item.constructor.name === "Integer" && item.valueBlock) {
            // Version number
            if (item.valueBlock.valueDec !== undefined) {
              version = item.valueBlock.valueDec.toString()
            }
          }
        })

        if (packageName) {
          results.push(version ? `${packageName} (version: ${version})` : packageName)
        }
      }
    })
  }

  return results.join(", ") || ""
}

/**
 * Get TBS (To Be Signed) bytes from certificate
 */
function getTbsBytes(der: Uint8Array): Uint8Array {
  const cert = AsnParser.parse(der, Certificate)
  return new Uint8Array(AsnSerializer.serialize(cert.tbsCertificate))
}

/**
 * Extract metadata from Android credential/leaf certificate
 */
export function extractAndroidCredentialMetadata(certDer: Uint8Array): AndroidCredentialMetadata {
  try {
    const cert = AsnParser.parse(certDer, Certificate)

    // Find the Android Key Attestation extension
    const extensions = cert.tbsCertificate.extensions
    if (!extensions) {
      throw new Error("No extensions found in certificate")
    }

    const attestationExt = extensions.find((ext) => ext.extnID === OID_ANDROID_KEY_ATTESTATION)
    if (!attestationExt) {
      throw new Error("Android Key Attestation extension not found")
    }

    // Parse the attestation extension manually
    const extData = new Uint8Array((attestationExt.extnValue as any).buffer)
    const parsed = parseAndroidKeyAttestationExtension(extData)

    // Extract how this certificate was signed (from signatureAlgorithm)
    const signatureAlgOid = cert.signatureAlgorithm.algorithm
    const signatureAlgInfo = SIGNATURE_ALGORITHM_OIDS[signatureAlgOid] || {
      name: signatureAlgOid,
      digest: "Unknown",
      signature: "Unknown",
    }

    const metadata: AndroidCredentialMetadata = {
      attestationSecurityLevel: {
        level: parsed.attestationSecurityLevel || AndroidSecurityLevel.Software,
        name: getSecurityLevelName(
          parsed.attestationSecurityLevel || AndroidSecurityLevel.Software,
        ),
      },
      tbsSize: getTbsBytes(certDer).length,
      signedBy: {
        algorithm: signatureAlgInfo.name,
        digestAlgorithm: signatureAlgInfo.digest,
        signatureAlgorithm: signatureAlgInfo.signature,
        oid: signatureAlgOid,
      },
    }

    // Extract attestationApplicationId
    if (parsed.teeEnforced.attestationApplicationId) {
      metadata.attestationApplicationId = {
        value: parsed.teeEnforced.attestationApplicationId,
        enforcedBy: "tee",
      }
    } else if (parsed.softwareEnforced.attestationApplicationId) {
      metadata.attestationApplicationId = {
        value: parsed.softwareEnforced.attestationApplicationId,
        enforcedBy: "software",
      }
    }

    // Extract creationDateTime
    if (parsed.teeEnforced.creationDateTime !== undefined) {
      metadata.creationDateTime = {
        value: new Date(parsed.teeEnforced.creationDateTime),
        timestamp: parsed.teeEnforced.creationDateTime,
        enforcedBy: "tee",
      }
    } else if (parsed.softwareEnforced.creationDateTime !== undefined) {
      metadata.creationDateTime = {
        value: new Date(parsed.softwareEnforced.creationDateTime),
        timestamp: parsed.softwareEnforced.creationDateTime,
        enforcedBy: "software",
      }
    }

    // Extract origin
    if (parsed.teeEnforced.origin !== undefined) {
      metadata.origin = {
        value: parsed.teeEnforced.origin,
        name: getKeyOriginName(parsed.teeEnforced.origin),
        enforcedBy: "tee",
      }
    } else if (parsed.softwareEnforced.origin !== undefined) {
      metadata.origin = {
        value: parsed.softwareEnforced.origin,
        name: getKeyOriginName(parsed.softwareEnforced.origin),
        enforcedBy: "software",
      }
    }

    // Extract OS version
    if (parsed.teeEnforced.osVersion !== undefined) {
      metadata.osVersion = {
        value: parsed.teeEnforced.osVersion,
        formatted: formatAndroidVersion(parsed.teeEnforced.osVersion),
        enforcedBy: "tee",
      }
    } else if (parsed.softwareEnforced.osVersion !== undefined) {
      metadata.osVersion = {
        value: parsed.softwareEnforced.osVersion,
        formatted: formatAndroidVersion(parsed.softwareEnforced.osVersion),
        enforcedBy: "software",
      }
    }

    // Extract OS patch level
    if (parsed.teeEnforced.osPatchLevel !== undefined) {
      metadata.osPatchLevel = {
        value: parsed.teeEnforced.osPatchLevel,
        formatted: formatPatchLevel(parsed.teeEnforced.osPatchLevel),
        enforcedBy: "tee",
      }
    } else if (parsed.softwareEnforced.osPatchLevel !== undefined) {
      metadata.osPatchLevel = {
        value: parsed.softwareEnforced.osPatchLevel,
        formatted: formatPatchLevel(parsed.softwareEnforced.osPatchLevel),
        enforcedBy: "software",
      }
    }

    return metadata
  } catch (error) {
    console.error("Error extracting Android credential metadata:", error)
    throw error
  }
}

/**
 * Extract signature algorithm information from any certificate
 */
export function extractCertificateSignatureInfo(certDer: Uint8Array): CertificateSignatureInfo {
  try {
    const cert = AsnParser.parse(certDer, Certificate)

    // Extract how this certificate was signed (from signatureAlgorithm)
    const signatureAlgOid = cert.signatureAlgorithm.algorithm
    const signatureAlgInfo = SIGNATURE_ALGORITHM_OIDS[signatureAlgOid] || {
      name: signatureAlgOid,
      digest: "Unknown",
      signature: "Unknown",
    }

    // Extract public key algorithm info
    const pubKeyInfo = cert.tbsCertificate.subjectPublicKeyInfo
    const pubKeyAlgOid = pubKeyInfo.algorithm.algorithm
    const pubKeyAlgName = PUBLIC_KEY_ALGORITHM_OIDS[pubKeyAlgOid] || pubKeyAlgOid

    const result: CertificateSignatureInfo = {
      tbsSize: getTbsBytes(certDer).length,
      signedBy: {
        algorithm: signatureAlgInfo.name,
        digestAlgorithm: signatureAlgInfo.digest,
        signatureAlgorithm: signatureAlgInfo.signature,
        oid: signatureAlgOid,
      },
      publicKeyAlgorithm: {
        algorithm: pubKeyAlgName,
        oid: pubKeyAlgOid,
      },
    }

    // Extract additional public key details
    if (pubKeyAlgName === "RSA") {
      // For RSA, we can get the key size from the actual public key
      const pubKeyBytes = new Uint8Array(pubKeyInfo.subjectPublicKey)
      if (pubKeyBytes.length > 0) {
        // RSA public key size estimation (very rough)
        // The actual parsing would require ASN.1 RSAPublicKey structure parsing
        result.publicKeyAlgorithm.keySize = pubKeyBytes.length * 8
      }
    } else if (pubKeyAlgName === "EC") {
      // For EC, check the parameters for curve OID
      if (pubKeyInfo.algorithm.parameters) {
        try {
          // The parameters should contain the curve OID
          const paramsAny = pubKeyInfo.algorithm.parameters as any
          if (paramsAny && typeof paramsAny === "object" && "valueBlock" in paramsAny) {
            const curveOid = paramsAny.valueBlock.toString()
            result.publicKeyAlgorithm.curve =
              CURVE_OIDS[curveOid as keyof typeof CURVE_OIDS] || curveOid
          }
        } catch {
          // If we can't parse the parameters, estimate from public key size
          const pubKeyBytes = new Uint8Array(pubKeyInfo.subjectPublicKey)
          if (pubKeyBytes.length === 65) {
            result.publicKeyAlgorithm.curve = "P-256"
          } else if (pubKeyBytes.length === 97) {
            result.publicKeyAlgorithm.curve = "P-384"
          } else if (pubKeyBytes.length === 133) {
            result.publicKeyAlgorithm.curve = "P-521"
          }
        }
      }
    }

    return result
  } catch (error) {
    console.error("Error extracting certificate signature info:", error)
    throw error
  }
}

/**
 * Helper function to get security level name
 */
function getSecurityLevelName(level: AndroidSecurityLevel): string {
  switch (level) {
    case AndroidSecurityLevel.Software:
      return "Software"
    case AndroidSecurityLevel.TrustedEnvironment:
      return "TrustedEnvironment (TEE)"
    case AndroidSecurityLevel.StrongBox:
      return "StrongBox"
    default:
      return `Unknown (${level})`
  }
}

/**
 * Helper function to get key origin name
 */
function getKeyOriginName(origin: AndroidKeyOrigin): string {
  switch (origin) {
    case AndroidKeyOrigin.GENERATED:
      return "Generated"
    case AndroidKeyOrigin.DERIVED:
      return "Derived"
    case AndroidKeyOrigin.IMPORTED:
      return "Imported"
    case AndroidKeyOrigin.UNKNOWN:
      return "Unknown"
    case AndroidKeyOrigin.SECURELY_IMPORTED:
      return "Securely Imported"
    default:
      return `Unknown (${origin})`
  }
}

/**
 * Format Android version from API level
 */
function formatAndroidVersion(apiLevel: number): string {
  // Common Android version mappings
  const versionMap: Record<number, string> = {
    21: "5.0 (Lollipop)",
    22: "5.1 (Lollipop)",
    23: "6.0 (Marshmallow)",
    24: "7.0 (Nougat)",
    25: "7.1 (Nougat)",
    26: "8.0 (Oreo)",
    27: "8.1 (Oreo)",
    28: "9 (Pie)",
    29: "10",
    30: "11",
    31: "12",
    32: "12L",
    33: "13",
    34: "14",
  }

  return versionMap[apiLevel] || `API ${apiLevel}`
}

/**
 * Format patch level from YYYYMM or YYYYMMDD format
 */
function formatPatchLevel(patchLevel: number): string {
  const patchStr = patchLevel.toString()
  if (patchStr.length >= 6) {
    const year = patchStr.substring(0, 4)
    const month = patchStr.substring(4, 6)
    const day = patchStr.length >= 8 ? patchStr.substring(6, 8) : ""

    return day ? `${year}-${month}-${day}` : `${year}-${month}`
  }
  return patchStr
}

/**
 * Display extracted metadata in a readable format
 */
export function displayAndroidCertificateMetadata(
  credentialMetadata: AndroidCredentialMetadata | undefined,
  intermediateCertsInfo: CertificateSignatureInfo[],
): void {
  if (credentialMetadata) {
    console.log("\n=== Android Credential Certificate Metadata ===")
    console.log(`Attestation Security Level: ${credentialMetadata.attestationSecurityLevel.name}`)
    if (credentialMetadata.tbsSize !== undefined) {
      console.log(`TBS Size: ${credentialMetadata.tbsSize} bytes`)
    }
    if (credentialMetadata.signedBy) {
      console.log(`Signed by parent using:`)
      console.log(`  Algorithm: ${credentialMetadata.signedBy.algorithm}`)
      console.log(`  Digest: ${credentialMetadata.signedBy.digestAlgorithm}`)
      console.log(`  Signature: ${credentialMetadata.signedBy.signatureAlgorithm}`)
    }

    if (credentialMetadata.attestationApplicationId) {
      console.log(`\nAttestation Application ID:`)
      console.log(`  Value: ${credentialMetadata.attestationApplicationId.value}`)
      console.log(`  Enforced by: ${credentialMetadata.attestationApplicationId.enforcedBy}`)
    }

    if (credentialMetadata.creationDateTime) {
      console.log(`\nCreation Date/Time:`)
      console.log(`  Value: ${credentialMetadata.creationDateTime.value.toISOString()}`)
      console.log(`  Timestamp: ${credentialMetadata.creationDateTime.timestamp}`)
      console.log(`  Enforced by: ${credentialMetadata.creationDateTime.enforcedBy}`)
    }

    if (credentialMetadata.origin) {
      console.log(`\nKey Origin:`)
      console.log(`  Value: ${credentialMetadata.origin.name}`)
      console.log(`  Enforced by: ${credentialMetadata.origin.enforcedBy}`)
    }

    if (credentialMetadata.osVersion) {
      console.log(`\nOS Version:`)
      console.log(`  Value: ${credentialMetadata.osVersion.formatted}`)
      console.log(`  Enforced by: ${credentialMetadata.osVersion.enforcedBy}`)
    }

    if (credentialMetadata.osPatchLevel) {
      console.log(`\nOS Patch Level:`)
      console.log(`  Value: ${credentialMetadata.osPatchLevel.formatted}`)
      console.log(`  Enforced by: ${credentialMetadata.osPatchLevel.enforcedBy}`)
    }
  }

  console.log("\n=== Intermediate Certificates Signature Info ===")
  intermediateCertsInfo.forEach((info, index) => {
    console.log(`\nIntermediate Certificate ${index + 1}:`)
    if (info.tbsSize !== undefined) {
      console.log(`  TBS Size: ${info.tbsSize} bytes`)
    }
    console.log(`  Signed by parent using:`)
    console.log(`    Algorithm: ${info.signedBy.algorithm}`)
    console.log(`    Digest: ${info.signedBy.digestAlgorithm}`)
    console.log(`    Signature: ${info.signedBy.signatureAlgorithm}`)
    console.log(`  This certificate's public key:`)
    console.log(`    Algorithm: ${info.publicKeyAlgorithm.algorithm}`)
    if (info.publicKeyAlgorithm.keySize) {
      console.log(`    Key Size: ${info.publicKeyAlgorithm.keySize} bits`)
    }
    if (info.publicKeyAlgorithm.curve) {
      console.log(`    Curve: ${info.publicKeyAlgorithm.curve}`)
    }
  })
}

/**
 * Example usage with AttestationContainer from facematch
 */
export async function extractAndroidAttestationMetadata(attestationContainer: {
  attestation: Uint8Array
  client_data: Uint8Array
}): Promise<{
  credentialMetadata: AndroidCredentialMetadata
  intermediateCertsInfo: CertificateSignatureInfo[]
}> {
  // Parse the attestation (assuming it's Android format)
  const attestationStr = Buffer.from(attestationContainer.attestation).toString("utf-8")
  const attestationData = JSON.parse(attestationStr)

  if (!attestationData.keyAttestation?.certificates) {
    throw new Error("No certificates found in Android attestation")
  }

  const certificates = attestationData.keyAttestation.certificates.map((certB64: string) =>
    Buffer.from(certB64, "base64"),
  )

  // Extract metadata from credential certificate (first certificate)
  const credentialCert = certificates[0]
  const credentialMetadata = extractAndroidCredentialMetadata(credentialCert)

  // Extract signature info from intermediate certificates
  // Skip first (credential) and last (root) certificates
  const intermediateCerts = certificates.slice(1, -1)
  const intermediateCertsInfo = intermediateCerts.map((cert: Uint8Array) =>
    extractCertificateSignatureInfo(cert),
  )

  return {
    credentialMetadata,
    intermediateCertsInfo,
  }
}
