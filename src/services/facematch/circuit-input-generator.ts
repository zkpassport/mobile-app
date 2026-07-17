import { AsnParser } from "@peculiar/asn1-schema"
import { Certificate } from "@peculiar/asn1-x509"
import { fromBER } from "asn1js"
import { AttestationContainer } from "./facematch"
import {
  APPLE_AA_ROOT_CA_PUBKEY_X,
  APPLE_AA_ROOT_CA_PUBKEY_Y,
  GOOGLE_PLAY_INTEGRITY_PUBKEY_X,
  GOOGLE_PLAY_INTEGRITY_PUBKEY_Y,
} from "./types"
import {
  getAppIdFromCertificate,
  getEnvironmentFromAuthData,
  packAndHashPoseidon2,
  parseAndroidIntegrityAttestation,
  parseAppleKeyAttestation,
  parseAttestationClientData,
} from "./utils"
import {
  getCurveParams,
  getFacematchCircuitInputs,
  getRSAInfo,
  IntegrityToDisclosureSalts,
  leftPadArrayWithZeros,
  PassportViewModel,
  processECDSASignature,
  Query,
  redcLimbsFromBytes,
  rightPadArrayWithZeros,
} from "@zkpassport/utils"
import { Platform } from "react-native"
// These imports are used in the debug code (commented out below)
import { extractCertificateSignatureInfo } from "./android-cert-metadata"

function zeroPad(data: Uint8Array, maxLen: number, name: string): Uint8Array {
  if (data.byteLength > maxLen)
    throw new Error(`${name} length ${data.byteLength} exceeds max ${maxLen}`)
  const padded = new Uint8Array(maxLen)
  padded.set(data, 0)
  // console.log(`✓ Extracted ${name} (${data.byteLength} bytes, padded to ${maxLen})`)
  return padded
}

// Circuit inputs for FaceMatch App Attest circuit
export interface CircuitInputs {
  root_key: number[] // 48+48 bytes for P-384 x+y coords (root cert)
  intermediate_key: number[] // 48+48 bytes for P-384 x+y coords (intermediate cert)
  intermediate_sig: number[] // r and s components of signature in intermediate cert, 48 + 48 = 96 bytes total for P-384
  intermediate_tbs: number[] // Intermediate TBS bytes, zero-padded to specified max length
  credential_sig: number[] // r and s components of signature in credential cert, 48 + 48 = 96 bytes total for P-384
  credential_tbs: number[] // Credential TBS bytes, zero-padded to specified max length
  auth_data: number[] // AuthData bytes
  client_data: number[] // Client data bytes, 0-padded to specified max length
  client_data_hash: number[] // Client data hash bytes
  environment: number // 0 for development, 1 for production
  app_id: number[] // App ID bytes, zero-padded to APP_ID_MAX_LEN (100 bytes)
  facematch_mode: number // 1 for regular, 2 for strict
}

// Config options for circuit input generation (max length values)
export interface CircuitInputConfig {
  maxIntermediateEcdsaTbsLen?: number
  maxIntermediateRsaTbsLen?: number
  maxCredentialTbsLen?: number
  maxAuthDataLen?: number
  maxDg2HashLen?: number
  maxClientDataLen?: number
  maxAppIdLen?: number
}

export interface CertificateInfo {
  type: "rsa" | "ecdsa"
  sig: Uint8Array
  tbs: Uint8Array
  key: Uint8Array
  sigHashAlgorithm: "sha1" | "sha224" | "sha256" | "sha384" | "sha512"
}

// Default circuit config
export const DEFAULT_CIRCUIT_CONFIG = {
  maxIntermediateEcdsaTbsLen: 700, // Maximum intermediate ECDSA TBS length used for padding
  maxIntermediateRsaTbsLen: 1000, // Maximum intermediate RSA TBS length used for padding
  maxCredentialTbsLen: 1000, // Maximum credential TBS length used for padding
  maxAuthDataLen: 180, // Maximum auth data length used for padding
  maxDg2HashLen: 64, // Maximum client data length used for padding
  maxClientDataLen: 169, // Maximum DG2 hash length used for padding
  maxAppIdLen: 100, // Maximum app ID length used for padding
} as const

// Extract circuit inputs for Noir verification
export async function generateCircuitInputsiOS(
  attestationContainer: AttestationContainer,
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  serviceScope: bigint,
  serviceSubScope: bigint,
  timestamp: number,
  config: CircuitInputConfig = DEFAULT_CIRCUIT_CONFIG,
): Promise<CircuitInputs> {
  const {
    maxCredentialTbsLen = DEFAULT_CIRCUIT_CONFIG.maxCredentialTbsLen,
    maxAuthDataLen = DEFAULT_CIRCUIT_CONFIG.maxAuthDataLen,
    maxClientDataLen = DEFAULT_CIRCUIT_CONFIG.maxClientDataLen,
    maxAppIdLen = DEFAULT_CIRCUIT_CONFIG.maxAppIdLen,
  } = config

  // Load attestation object from attestation container
  const attestation = parseAppleKeyAttestation(attestationContainer.attestation)
  const clientData = attestationContainer.client_data

  // Apple root public key coordinates
  const root_key = new Uint8Array([...APPLE_AA_ROOT_CA_PUBKEY_X, ...APPLE_AA_ROOT_CA_PUBKEY_Y])
  // console.log(`  Apple Root Public Key: ${Buffer.from(root_key).toString("hex")}`)

  // Get certificates from attestation object
  const [credentialDer, intermediateDer] = attestation.attStmt.x5c
  if (!intermediateDer) throw new Error("Missing intermediate certificate in attestation")
  if (!credentialDer) throw new Error("Missing credential certificate in attestation")

  // Get signature from intermediate certificate (signed by root)
  const intermediate_sig = getSignatureBytesFromCertificate(intermediateDer)
  // console.log(`✓ Got intermediate signature (${intermediate_sig.length} bytes)`)

  // Get intermediate certificate TBS
  const intermediate_tbs = zeroPad(getTbsBytes(intermediateDer), 500, "intermediate tbs")

  // Get intermediate certificate public key coordinates (48 bytes each for P-384)
  const [intermediate_key_x, intermediate_key_y] = getPublicKeyCoordinates(intermediateDer)
  const intermediate_key = new Uint8Array([...intermediate_key_x, ...intermediate_key_y])
  // console.log(`✓ Got intermediate public key (${intermediate_key.length} bytes)`)

  // Get credential certificate TBS
  const credential_tbs = zeroPad(getTbsBytes(credentialDer), maxCredentialTbsLen, "credential tbs")

  // Get credential certificate signature
  const credential_sig = getSignatureBytesFromCertificate(credentialDer)
  // console.log(`✓ Got credential signature (${credential_sig.length} bytes)`)

  const auth_data = zeroPad(attestation.authData, maxAuthDataLen, "auth data")
  const client_data = zeroPad(clientData, maxClientDataLen, "client_data")
  const client_data_hash = await packAndHashPoseidon2(clientData)

  // Get environment from auth data
  const envStr = getEnvironmentFromAuthData(attestation.authData)
  const env = envStr === "development" ? 0 : 1
  // console.log(`✓ Got environment from auth data: ${envStr} (${env})`)

  // Get appId from credential certificate
  const appIdStr = getAppIdFromCertificate(attestation.attStmt.x5c[0])
  if (!appIdStr) throw new Error("Failed to extract appId from credential certificate")
  const appIdBytes = new TextEncoder().encode(appIdStr)
  const app_id = zeroPad(appIdBytes, maxAppIdLen, "app_id")

  // Extract facematch mode from client data
  const parsedClientData = parseAttestationClientData(attestationContainer.client_data)
  const faceMatchData = parsedClientData.attestationData?.faceMatch
  if (!faceMatchData) throw new Error("Failed to extract facematch mode from client data")
  const facematch_mode = faceMatchData.mode

  const baseInputs = await getFacematchCircuitInputs(
    passport,
    query,
    salts,
    BigInt(0),
    serviceScope,
    serviceSubScope,
    timestamp,
    true, // Only the hash of the inputs using the private salt will be passed to the prover
  )

  return {
    ...baseInputs,
    root_key: Array.from(root_key),
    intermediate_sig: Array.from(intermediate_sig),
    intermediate_tbs: Array.from(intermediate_tbs),
    intermediate_key: Array.from(intermediate_key),
    credential_sig: Array.from(credential_sig),
    credential_tbs: Array.from(credential_tbs),
    auth_data: Array.from(auth_data),
    client_data: Array.from(client_data),
    client_data_hash: Array.from(client_data_hash),
    environment: env,
    app_id: Array.from(app_id),
    facematch_mode,
  }
}

export function getCertificateInfo(
  der: Uint8Array,
  maxRsaTbsLen: number = DEFAULT_CIRCUIT_CONFIG.maxIntermediateRsaTbsLen,
  maxEcdsaTbsLen: number = DEFAULT_CIRCUIT_CONFIG.maxIntermediateEcdsaTbsLen,
): CertificateInfo {
  const sig = getSignatureBytesFromCertificate(der)

  // Extract signature algorithm info from certificate metadata
  const certInfo = extractCertificateSignatureInfo(der)

  // Map digest algorithm to simplified hash algorithm name
  const sigHashAlgorithm = (() => {
    switch (certInfo.signedBy.digestAlgorithm) {
      case "SHA-1":
        return "sha1"
      case "SHA-224":
        return "sha224"
      case "SHA-256":
        return "sha256"
      case "SHA-384":
        return "sha384"
      case "SHA-512":
        return "sha512"
      default:
        // Default based on signature type if unknown
        if (certInfo.signedBy.signatureAlgorithm === "RSA") {
          return "sha256"
        } else if (certInfo.publicKeyAlgorithm.curve === "P-384") {
          return "sha384"
        } else {
          return "sha256"
        }
    }
  })()

  const keys = getPublicKeyCoordinates(der)
  let key: Uint8Array
  if (keys.length === 1) {
    // RSA certificate
    key = keys[0]
    const tbs = zeroPad(getTbsBytes(der), maxRsaTbsLen, "intermediate tbs")
    // console.log(`✓ Got intermediate rsa public key (${key.length} bytes)`)
    // console.log(`✓ Using hash algorithm: ${hashAlgorithm} (from ${certInfo.signedBy.digestAlgorithm})`)
    return { type: "rsa", sig, tbs, key, sigHashAlgorithm }
  } else if (keys.length === 2) {
    // ECDSA certificate
    const key_x = keys[0]
    const key_y = keys[1]
    key = new Uint8Array([...key_x, ...key_y])
    const tbs = zeroPad(getTbsBytes(der), maxEcdsaTbsLen, "intermediate tbs")
    // console.log(`✓ Got intermediate ecdsa public key (${key.length} bytes)`)
    // console.log(`✓ Using hash algorithm: ${hashAlgorithm} (from ${certInfo.signedBy.digestAlgorithm})`)
    return {
      type: "ecdsa",
      sig,
      tbs,
      key,
      sigHashAlgorithm,
    }
  } else {
    throw new Error("Invalid number of public keys")
  }
}

export async function getCredentialCertificateInfo(
  attestationContainer: AttestationContainer,
): Promise<CertificateInfo> {
  const attestation = parseAndroidIntegrityAttestation(
    Buffer.from(attestationContainer.attestation).toString("base64"),
  )
  const credentialDer = Buffer.from(attestation.keyAttestation?.certificates[0]!, "base64")
  if (!credentialDer) throw new Error("Missing credential certificate in attestation")
  return getCertificateInfo(
    credentialDer,
    DEFAULT_CIRCUIT_CONFIG.maxCredentialTbsLen,
    DEFAULT_CIRCUIT_CONFIG.maxCredentialTbsLen,
  )
}

export async function getIntermediateCertificates(
  attestationContainer: AttestationContainer,
): Promise<CertificateInfo[]> {
  const attestation = parseAndroidIntegrityAttestation(
    Buffer.from(attestationContainer.attestation).toString("base64"),
  )
  const certificates = attestation.keyAttestation?.certificates.map((der) =>
    Buffer.from(der, "base64"),
  )
  if (!certificates) throw new Error("Missing certificates in attestation")
  return (
    certificates
      // Remove root and credential certificates
      .slice(1, -1)
      // Reverse the order of the intermediate certificates so it goes from the root to the credential
      .reverse()
      .map((der) => getCertificateInfo(der))
  )
}

export async function getRootCertificate(
  attestationContainer: AttestationContainer,
): Promise<CertificateInfo> {
  const attestation = parseAndroidIntegrityAttestation(
    Buffer.from(attestationContainer.attestation).toString("base64"),
  )
  const certificates = attestation.keyAttestation?.certificates.map((der) =>
    Buffer.from(der, "base64"),
  )
  if (!certificates) throw new Error("Missing certificates in attestation")
  return getCertificateInfo(certificates[certificates.length - 1]!)
}

// Extract circuit inputs for Noir verification
export async function generateCircuitInputsAndroid(
  attestationContainer: AttestationContainer,
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  serviceScope: bigint,
  serviceSubScope: bigint,
  timestamp: number,
  config: CircuitInputConfig = DEFAULT_CIRCUIT_CONFIG,
): Promise<CircuitInputs> {
  const {
    maxCredentialTbsLen = DEFAULT_CIRCUIT_CONFIG.maxCredentialTbsLen,
    maxClientDataLen = DEFAULT_CIRCUIT_CONFIG.maxClientDataLen,
    maxAppIdLen = DEFAULT_CIRCUIT_CONFIG.maxAppIdLen,
  } = config

  // Load attestation object from attestation container
  const attestation = parseAndroidIntegrityAttestation(
    Buffer.from(attestationContainer.attestation).toString("base64"),
  )
  const clientData = attestationContainer.client_data

  // Get certificates from attestation object
  const certificates = attestation.keyAttestation?.certificates.map((der) =>
    Buffer.from(der, "base64"),
  )
  // console.log(`✓ Got ${certificates?.length} certificates`)

  // Google root public key coordinates
  const rootCert = certificates?.[certificates.length - 1]
  if (!rootCert) throw new Error("Missing root certificate in attestation")
  const raw_root_key = getPublicKeyCoordinates(rootCert)
  const root_key =
    raw_root_key.length === 1
      ? raw_root_key[0]
      : new Uint8Array([...raw_root_key[0]!, ...raw_root_key[1]!])
  // Only RSA needs redc param
  const root_key_redc_param =
    raw_root_key.length === 1 ? redcLimbsFromBytes(Array.from(root_key)) : undefined
  // console.log(`  Google Root Public Key: ${Buffer.from(root_key).toString("hex")}`)

  if (!certificates) throw new Error("Missing certificates in attestation")
  const credentialDer = certificates[0]
  // Remove root and credential certificates
  const intermediatesDer = certificates.slice(1, -1).reverse()
  // console.log(`✓ Got ${intermediatesDer.length} intermediate certificates`)
  if (intermediatesDer.length === 0)
    throw new Error("Missing intermediate certificates in attestation")
  if (!credentialDer) throw new Error("Missing credential certificate in attestation")

  // Extract metadata from the credential certificate (optional - for debugging)
  // Uncomment the following to extract and display Android certificate metadata:
  /*
  const credentialMetadata = extractAndroidCredentialMetadata(credentialDer)
  const intermediateCertsSignatureInfo = intermediatesDer.map((cert) =>
    extractCertificateSignatureInfo(cert),
  )
  displayAndroidCertificateMetadata(credentialMetadata, intermediateCertsSignatureInfo)
  */

  const intermediate_certs: CertificateInfo[] = intermediatesDer.map((der) =>
    getCertificateInfo(der),
  )

  // Get credential certificate TBS
  const credential_tbs = zeroPad(getTbsBytes(credentialDer), maxCredentialTbsLen, "credential tbs")
  const [credential_key_x, credential_key_y] = getPublicKeyCoordinates(credentialDer)
  const credential_key = new Uint8Array([...credential_key_x, ...credential_key_y])

  // Get credential certificate signature
  const credential_sig = getSignatureBytesFromCertificate(credentialDer)
  // console.log(`✓ Got credential signature (${credential_sig.length} bytes)`)

  const client_data = zeroPad(clientData, maxClientDataLen, "client_data")
  // const client_data_hash = await packAndHashPoseidon2(clientData)

  const client_data_sig = getSignatureBytes(Buffer.from(attestation.signature!, "base64"))
  // console.log(`✓ Got client data signature (${client_data_sig.length} bytes)`)

  // console.log(`✓ Got integrity token: ${attestation.integrityToken}`)
  const parsedIntegrityToken = JSON.parse(
    Buffer.from(attestation.integrityToken!, "base64").toString("utf-8"),
  )
  const integrity_token = rightPadArrayWithZeros(
    Array.from(Buffer.from(parsedIntegrityToken.decryptedTokenBase64, "base64")),
    1024,
  )
  const integrity_token_signature = parsedIntegrityToken.signature
  const play_integrity_public_key = new Uint8Array([
    ...GOOGLE_PLAY_INTEGRITY_PUBKEY_X,
    ...GOOGLE_PLAY_INTEGRITY_PUBKEY_Y,
  ])
  // console.log(`✓ Got integrity token signature: ${integrity_token_signature}`)

  // Get environment from attestation
  // Find a proper way to get the environment from the attestation
  const envStr = attestation.environment
  const env = envStr === "development" ? 0 : 1
  // console.log(`✓ Got environment from auth data: ${envStr} (${env})`)

  // Get appId from attestation
  const appIdBytes = new TextEncoder().encode(attestation.appId)
  const app_id = zeroPad(appIdBytes, maxAppIdLen, "app_id")

  // Extract facematch mode from client data
  const parsedClientData = parseAttestationClientData(attestationContainer.client_data)
  const faceMatchData = parsedClientData.attestationData?.faceMatch
  if (!faceMatchData) throw new Error("Failed to extract facematch mode from client data")
  const facematch_mode = faceMatchData.mode

  const baseInputs = await getFacematchCircuitInputs(
    passport,
    query,
    salts,
    BigInt(0),
    serviceScope,
    serviceSubScope,
    timestamp,
    true, // Only the hash of the inputs using the private salt will be passed to the prover
  )

  return {
    ...baseInputs,
    root_key: Array.from(root_key),
    // Assume RSA for now
    root_key_redc_param,
    ...Object.assign(
      {},
      ...intermediate_certs.map((cert, index) =>
        cert.type === "rsa"
          ? {
              [`intermediate_${index + 1}_sig`]: Array.from(cert.sig),
              [`intermediate_${index + 1}_tbs`]: Array.from(cert.tbs),
              [`intermediate_${index + 1}_key`]: Array.from(cert.key),
              [`intermediate_${index + 1}_key_redc_param`]: redcLimbsFromBytes(
                Array.from(cert.key),
              ),
            }
          : {
              [`intermediate_${index + 1}_sig`]: Array.from(cert.sig),
              [`intermediate_${index + 1}_tbs`]: Array.from(cert.tbs),
              [`intermediate_${index + 1}_key`]: Array.from(cert.key),
            },
      ),
    ),
    credential_key: Array.from(credential_key),
    credential_sig: Array.from(credential_sig),
    credential_tbs: Array.from(credential_tbs),
    client_data: Array.from(client_data),
    client_data_sig: Array.from(client_data_sig),
    environment: env,
    app_id: Array.from(app_id),
    facematch_mode,
    integrity_token: integrity_token,
    integrity_token_signature: integrity_token_signature,
    play_integrity_public_key: Array.from(play_integrity_public_key),
  }
}

export async function generateCircuitInputs(
  attestationContainer: AttestationContainer,
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  serviceScope: bigint,
  serviceSubScope: bigint,
  timestamp: number,
  config: CircuitInputConfig = DEFAULT_CIRCUIT_CONFIG,
): Promise<CircuitInputs> {
  if (Platform.OS === "ios") {
    return generateCircuitInputsiOS(
      attestationContainer,
      passport,
      query,
      salts,
      serviceScope,
      serviceSubScope,
      timestamp,
      config,
    )
  } else if (Platform.OS === "android") {
    return generateCircuitInputsAndroid(
      attestationContainer,
      passport,
      query,
      salts,
      serviceScope,
      serviceSubScope,
      timestamp,
      config,
    )
  } else {
    throw new Error("Unsupported platform")
  }
}

// Use this rather than peculiar utils as the serialisation/desialisation
// sometimes change bytes
export function getTbsBytes(certDer: Uint8Array): Uint8Array {
  // X.509 certificate structure:
  // SEQUENCE {
  //   tbsCertificate     TBSCertificate,
  //   signatureAlgorithm AlgorithmIdentifier,
  //   signature          BIT STRING
  // }

  let offset = 0

  // Skip outer SEQUENCE tag
  const outerTag = certDer[offset++]
  if (outerTag !== 0x30) {
    throw new Error("Invalid certificate format: expected SEQUENCE tag")
  }

  // Read outer SEQUENCE length
  const outerLength = certDer[offset++]
  if (outerLength & 0x80) {
    const lenBytes = outerLength & 0x7f
    offset += lenBytes // Skip length bytes
  }

  // Now we're at the start of TBSCertificate
  const tbsStart = offset

  // Read TBS SEQUENCE tag
  const tbsTag = certDer[offset++]
  if (tbsTag !== 0x30) {
    throw new Error("Invalid TBS certificate format: expected SEQUENCE tag")
  }

  // Read TBS length
  // If the short form is used, then we get the whole length here
  let tbsLength = certDer[offset++]
  let lengthOfLength = 0
  // If the long form is used, as indicated by the condition below,
  // then we need to read the extra length bytes to get the total length
  if (tbsLength & 0x80) {
    lengthOfLength = tbsLength & 0x7f
    tbsLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      tbsLength = (tbsLength << 8) | certDer[offset++]
    }
  }

  // Calculate total TBS size including tag and length
  const tbsTotalSize = 1 + 1 + lengthOfLength + tbsLength // tag + length byte + extra length bytes + content

  // Extract exact TBS bytes from the original DER
  return certDer.slice(tbsStart, tbsStart + tbsTotalSize)
}

export function getECDSASignatureBytes(signatureDer: Uint8Array): Uint8Array {
  const signatureBytes = new Uint8Array(signatureDer)
  // console.log(`✓ Got signature bytes ${signatureBytes}`)
  // Parse ASN.1 SEQUENCE containing r and s values
  const signatureAsn1 = fromBER(signatureBytes.buffer.slice(0))
  // console.log(`✓ Got signature ASN.1 (${signatureAsn1.result.constructor.name})`)
  if (signatureAsn1.offset === -1 || signatureAsn1.result.constructor.name !== "Sequence") {
    throw new Error("Invalid signature format")
  }
  const sequence = signatureAsn1.result as any
  // console.log(`✓ Got signature sequence (${sequence.valueBlock.value.length} elements)`)
  if (sequence.valueBlock.value.length !== 2) {
    throw new Error("Invalid element length")
  }
  const BYTE_SIZE = (() => {
    if (
      sequence.valueBlock.value[0].valueBlock.valueHexView.length >= 46 &&
      sequence.valueBlock.value[0].valueBlock.valueHexView.length <= 50
    ) {
      // P-384
      return 48
    } else if (
      sequence.valueBlock.value[0].valueBlock.valueHexView.length >= 30 &&
      sequence.valueBlock.value[0].valueBlock.valueHexView.length <= 34
    ) {
      // P-256
      return 32
    } else {
      throw new Error("Invalid signature length")
    }
  })()
  let rBytes = new Uint8Array(sequence.valueBlock.value[0].valueBlock.valueHexView)
  let sBytes = new Uint8Array(sequence.valueBlock.value[1].valueBlock.valueHexView)
  // Remove leading zeros and pad to BYTE_SIZE bytes
  rBytes = rBytes[0] === 0 ? rBytes.slice(1) : rBytes
  sBytes = sBytes[0] === 0 ? sBytes.slice(1) : sBytes
  const curveName = BYTE_SIZE === 48 ? "P-384" : "P-256"
  // Canonicalize s value: if s > n/2, then s = n - s
  const sig = processECDSASignature(
    [
      ...leftPadArrayWithZeros(Array.from(rBytes), BYTE_SIZE),
      ...leftPadArrayWithZeros(Array.from(sBytes), BYTE_SIZE),
    ],
    BYTE_SIZE,
    getCurveParams(curveName),
  )
  // console.log(`✓ Extracted certificate signature (${sig.length} bytes)`)
  return new Uint8Array(sig)
}

export function getRSASignatureBytes(signatureDer: Uint8Array): Uint8Array {
  return new Uint8Array(signatureDer)
}

export function getSignatureBytes(signatureDer: Uint8Array): Uint8Array {
  const signatureBytes = new Uint8Array(signatureDer)
  // Assume RSA signature for pubkey greater than 129 bytes
  if (signatureBytes.length > 129) {
    return getRSASignatureBytes(signatureBytes)
  } else {
    return getECDSASignatureBytes(signatureBytes)
  }
}

export function getSignatureBytesFromCertificate(der: Uint8Array): Uint8Array {
  const cert = AsnParser.parse(der, Certificate)
  // Extract signature from certificate
  return getSignatureBytes(new Uint8Array(cert.signatureValue))
}

export function getPublicKeyCoordinates(der: Uint8Array): Uint8Array[] {
  const cert = AsnParser.parse(der, Certificate)
  const pubKeyBytes = new Uint8Array(cert.tbsCertificate.subjectPublicKeyInfo.subjectPublicKey)
  if (pubKeyBytes.length === 0) {
    throw new Error("Certificate public key is empty")
  }
  // console.log(`✓ Got public key (${pubKeyBytes.length} bytes)`)
  // Asssume RSA signature for pubkey greater than 129 bytes
  if (pubKeyBytes.length > 129) {
    const rsaPubKeyBytes = getRSAInfo(cert.tbsCertificate.subjectPublicKeyInfo)
    // console.log(`✓ Got RSA public key (${rsaPubKeyBytes.modulus.toString(16)})`)
    return [new Uint8Array(Buffer.from(rsaPubKeyBytes.modulus.toString(16), "hex"))]
  }
  if (pubKeyBytes[0] !== 0x04) {
    throw new Error("Certificate public key is not in uncompressed format")
  }
  if (pubKeyBytes.length === 97) {
    // P-384 public key (48 bytes each for x and y coordinates)
    const key_x = pubKeyBytes.slice(1, 49)
    const key_y = pubKeyBytes.slice(49, 97)
    return [key_x, key_y]
  } else if (pubKeyBytes.length === 65) {
    // P-256 public key (32 bytes each for x and y coordinates)
    const key_x = pubKeyBytes.slice(1, 33)
    const key_y = pubKeyBytes.slice(33, 65)
    return [key_x, key_y]
  } else {
    throw new Error(
      `Expected P-256 (65 bytes) or P-384 (97 bytes) public key, got ${pubKeyBytes.length} bytes`,
    )
  }
}
