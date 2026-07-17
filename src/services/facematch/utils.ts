import { AsnParser, AsnSerializer } from "@peculiar/asn1-schema"
import { Certificate } from "@peculiar/asn1-x509"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { decode as cborDecode } from "cbor-x"
import {
  AppleDeviceAttestationKeyUsageProperties,
  AppleDeviceOSInformation,
  AttestationType,
  type CosineScore,
  FaceMatchMode,
  OID_APPLE_AA_KEY_USAGE,
  OID_APPLE_AA_OS_INFORMATION,
  ZKPassportAppAttest,
  OID_ANDROID_KEY_ATTESTATION,
  AndroidKeyDescription,
  AndroidSecurityLevel,
  AndroidKeyAlgorithm,
  AndroidEcCurve,
  AndroidKeyOrigin,
} from "./asn"
import {
  AAGUID_DEV,
  AAGUID_PROD,
  LivenessProgress,
  LivenessScheduleEntry,
  LivenessSegmentIndex,
  type AppleAttestationObject,
  AndroidIntegrityResponse,
  FacePose,
} from "./types"
import {
  LIVENESS_TARGET_ANGLES,
  RING_START_ANGLE,
  SEGMENT_STEP_DEGREES,
  TOTAL_SEGMENTS,
  LIVENESS_GAZE_TOLERANCE_DEG,
  MIN_GAZE_MAGNITUDE_THRESHOLD,
} from "@/components/facematch/constants"
import { FaceMatchMetrics } from "@/types/Error"

// Normalize vector to unit length
export function l2Norm(vec: number[]): number[] {
  const norm = Math.max(Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)), 1e-10)
  return vec.map((x) => x / norm)
}

// Dot product of a and b
export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < len; i++) sum += a[i] * b[i]
  return sum
}

/**
 * Serializes a ZKPassportAppAttest object to ASN.1 DER bytes
 */
export function serializeAttestation(attestation: ZKPassportAppAttest): Uint8Array {
  return new Uint8Array(AsnSerializer.serialize(attestation))
}

/**
 * Parses ASN.1 DER bytes back into a ZKPassportAppAttest object
 */
export function parseAttestationClientData(derBytes: Uint8Array): ZKPassportAppAttest {
  const parsed = AsnParser.parse(derBytes, ZKPassportAppAttest)
  return convertStringIntegersToNumbers(parsed)
}

/**
 * Converts string integers to numbers in parsed attestation
 */
function convertStringIntegersToNumbers(attestation: ZKPassportAppAttest): ZKPassportAppAttest {
  // Convert version if it's a string
  if (typeof attestation.version === "string") {
    attestation.version = parseInt(attestation.version, 10)
  }

  // Convert face match integers
  if (attestation.attestationData.faceMatch) {
    const fm = attestation.attestationData.faceMatch
    if (typeof fm.cosineAvgSimilarity === "string") {
      fm.cosineAvgSimilarity = parseInt(fm.cosineAvgSimilarity, 10) as CosineScore
    }
    if (typeof fm.cosineThreshold === "string") {
      fm.cosineThreshold = parseInt(fm.cosineThreshold, 10) as CosineScore
    }
  }

  // Convert geo location integers
  if (attestation.attestationData.geoLocation) {
    const geo = attestation.attestationData.geoLocation
    if (typeof geo.latMicroDegrees === "string") {
      geo.latMicroDegrees = parseInt(geo.latMicroDegrees, 10)
    }
    if (typeof geo.lonMicroDegrees === "string") {
      geo.lonMicroDegrees = parseInt(geo.lonMicroDegrees, 10)
    }
    if (typeof geo.accuracyMm === "string") {
      geo.accuracyMm = parseInt(geo.accuracyMm, 10)
    }
  }

  return attestation
}

export function packLeBytesIntoFields(bytes: Uint8Array, maxChunkSize: number): string[] {
  if (bytes.length === 0) return []
  const totalFields = Math.ceil(bytes.length / maxChunkSize)
  const result = new Array(totalFields)
  let byteIndex = 0
  // Pack all fields in little-endian order
  for (let fieldIndex = 0; fieldIndex < totalFields; fieldIndex++) {
    const remainingBytes = bytes.length - byteIndex
    const chunkSize = Math.min(maxChunkSize, remainingBytes)
    // Pack bytes in little-endian order (reverse the chunk)
    let value = 0n
    for (let i = chunkSize - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(bytes[byteIndex + i]!)
    }
    byteIndex += chunkSize
    const hex = value.toString(16)
    result[fieldIndex] = "0x" + hex
  }
  return result
}

export async function hashFaceprintPoseidon2(arr: number[]): Promise<Uint8Array> {
  if (arr.length !== 512) throw new Error("expected 512 values")
  const buf = Buffer.allocUnsafe(arr.length * 4)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  for (let i = 0; i < arr.length; i++) {
    let x = arr[i]
    if (x === undefined || !Number.isFinite(x)) throw new Error("non‑finite")
    if (Object.is(x, -0)) x = 0 // normalize -0.0 → +0.0
    dv.setFloat32(i * 4, x, false) // big‑endian
  }
  const fields = packLeBytesIntoFields(new Uint8Array(buf), 31)
  const hex = (await poseidon2HashAsync(fields.map((f) => BigInt(f)))).toString(16)
  return new Uint8Array(Buffer.from((hex.length % 2 ? "0" : "") + hex, "hex"))
}

export async function packAndHashPoseidon2(input: Uint8Array): Promise<Uint8Array> {
  const fields = packLeBytesIntoFields(input, 31)
  const field_hash = await poseidon2HashAsync(fields.map((f) => BigInt(f)))
  const hex = field_hash.toString(16)
  return new Uint8Array(Buffer.from((hex.length % 2 ? "0" : "") + hex, "hex"))
}

/**
 * Utility function to display attestation client_data details
 */
export function displayAttestationClientData(client_data: ZKPassportAppAttest | Uint8Array): void {
  if (client_data instanceof Uint8Array) client_data = parseAttestationClientData(client_data)
  console.log("\n=== ZKPassport App Attestation ===")
  console.log(`Version: ${client_data.version}`)
  console.log(`App Version: ${client_data.appVersion}`)
  console.log(
    `Attestation Type: ${AttestationType[client_data.attestationType]} (${client_data.attestationType})`,
  )
  const serializedData = serializeAttestation(client_data)
  const totalSize = serializedData.byteLength
  console.log(`Total size of the attestation: ${totalSize} bytes`)

  if (client_data.attestationData.faceMatch) {
    const fm = client_data.attestationData.faceMatch
    console.log("\n--- Face Match Data ---")
    console.log(`Mode: ${FaceMatchMode[fm.mode]} (${fm.mode})`)
    console.log(`Cosine Average Similarity: ${fm.cosineAvgSimilarity / 1e8}`) // Convert back to decimal
    console.log(`Cosine Threshold: ${fm.cosineThreshold ? fm.cosineThreshold / 1e8 : "N/A"}`)
    console.log(`DG2 Hash Algorithm: ${fm.dg2Hash.algorithm.algorithm}`)
    console.log(`DG2 Hash Length: ${fm.dg2Hash.digest.byteLength} bytes`)
    console.log(`DG2 Faceprint Hash Length: ${fm.dg2FaceprintHash.byteLength} bytes`)
    console.log(`DG2 Faceprint Hash: ${Buffer.from(fm.dg2FaceprintHash).toString("hex")}`)
  }

  if (client_data.attestationData.geoLocation) {
    const geo = client_data.attestationData.geoLocation
    console.log("\n--- Geo Location Data ---")
    console.log(`Latitude: ${geo.latMicroDegrees / 1e6}°`)
    console.log(`Longitude: ${geo.lonMicroDegrees / 1e6}°`)
    console.log(`Accuracy: ${geo.accuracyMm ? geo.accuracyMm / 1000 : "N/A"} meters`)
    console.log(`Timestamp: ${geo.timestamp.toISOString()}`)
  }

  // Convert serialized data to hex string
  const uint8Array = new Uint8Array(serializedData)
  const hexString = Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  console.log("\n--- Serialized Data (Hex) ---")
  console.log(hexString)
  console.log("=====================================\n")
}

export function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]
    const bVal = b[i]
    if (aVal === undefined || bVal === undefined) {
      return false
    }
    diff |= aVal ^ bVal
  }
  return diff === 0
}

export function parseAppleKeyAttestation(attestation: Uint8Array): AppleAttestationObject {
  const obj = cborDecode(attestation) as AppleAttestationObject
  return obj
}

export function msgFromError(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : String(error)
}

/**
 * Get app ID from Apple App Attest extension in credential cert (OID: 1.2.840.113635.100.8.5)
 */
export function getAppIdFromCertificate(der: Uint8Array): string | null {
  try {
    // Parse the certificate
    const cert = AsnParser.parse(der, Certificate)
    // Find the Apple App Attest extension
    const extensions = cert.tbsCertificate.extensions
    if (!extensions) throw new Error("Credential cert has no extensions")
    const ext = extensions.find((ext) => ext.extnID === OID_APPLE_AA_KEY_USAGE)
    if (!ext)
      throw new Error(
        `Apple App Attest extension (${OID_APPLE_AA_KEY_USAGE}) not found in credential cert`,
      )
    const extData = new Uint8Array((ext.extnValue as any).buffer)
    const parsed = AsnParser.parse(extData, AppleDeviceAttestationKeyUsageProperties)
    const appId = parsed.appId ? new TextDecoder().decode(parsed.appId) : null
    return appId
  } catch (error) {
    console.error("Error parsing Apple Device Attestation Key Usage Properties:", error)
    return null
  }
}

/**
 * Get device OS information from credential cert (OID: 1.2.840.113635.100.8.7)
 */
export function getDeviceOSInformationFromCertificate(
  der: Uint8Array,
): AppleDeviceOSInformation | null {
  try {
    // Parse the certificate
    const cert = AsnParser.parse(der, Certificate)
    // Find the Apple App Attest extension
    const extensions = cert.tbsCertificate.extensions
    if (!extensions) throw new Error("Credential cert has no extensions")
    const ext = extensions.find((ext) => ext.extnID === OID_APPLE_AA_OS_INFORMATION)
    if (!ext)
      throw new Error(
        `Apple App Attest extension (${OID_APPLE_AA_OS_INFORMATION}) not found in credential cert`,
      )
    const extData = new Uint8Array((ext.extnValue as any).buffer)
    const parsed = AsnParser.parse(extData, AppleDeviceOSInformation)
    return parsed
  } catch (error) {
    console.error("Error parsing Apple Device Attestation Key Usage Properties:", error)
    return null
  }
}

/**
 * Get environment from App Attest Auth Data
 */
export function getEnvironmentFromAuthData(authData: Uint8Array): "development" | "production" {
  const aaguid = authData.slice(37, 53)
  if (eqBytes(aaguid, AAGUID_DEV)) {
    return "development"
  } else if (eqBytes(aaguid, AAGUID_PROD)) {
    return "production"
  } else {
    throw new Error("Invalid AAGUID")
  }
}

// Helper functions for signature canonicalization
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (let i = 0; i < bytes.length; i++) {
    result = result * 256n + BigInt(bytes[i]!)
  }
  return result
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn)
    value = value >> 8n
  }
  return bytes
}

// P-384 curve order for signature canonicalization
export const P384_N = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973",
)
export const P384_N_HALF = P384_N / 2n

export function createInitialLivenessProgress(): LivenessProgress {
  const matchesPerTarget = new Map<LivenessSegmentIndex, number>()
  for (const segment of LIVENESS_SEGMENT_INDICES) {
    matchesPerTarget.set(segment, 0)
  }
  return {
    matchesPerTarget,
    currentIndex: 0,
    lastAcceptedAt: null,
    poseSamples: [],
  }
}

export function normalizeDegrees(angle: number): number {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function segmentIndexToAngle(segmentIndex: number): number {
  return normalizeDegrees(RING_START_ANGLE + segmentIndex * SEGMENT_STEP_DEGREES)
}

/**
 * Converts a target angle (in degrees) to the nearest segment index on the ring.
 * This allows liveness targets to be defined by angle and automatically
 * adapt when TOTAL_SEGMENTS changes. Before this was static and hardcoded.
 */
export function angleToSegmentIndex(angleDeg: number): number {
  const normalizedAngle = normalizeDegrees(angleDeg)
  const normalizedStart = normalizeDegrees(RING_START_ANGLE)

  // Calculate angular distance from ring start
  let delta = normalizedAngle - normalizedStart
  if (delta < 0) delta += 360

  // Convert to segment index, wrapping within valid range (normalized)
  const segmentIndex = Math.round(delta / SEGMENT_STEP_DEGREES) % TOTAL_SEGMENTS
  return segmentIndex
}

/**
 * Dynamically generated segment indices based on LIVENESS_TARGET_ANGLES.
 * These will automatically update when TOTAL_SEGMENTS changes.
 */
export const LIVENESS_SEGMENT_INDICES: readonly number[] =
  LIVENESS_TARGET_ANGLES.map(angleToSegmentIndex)

/**
 * Build the liveness schedule from target angles.
 */
export const LIVENESS_SCHEDULE: readonly LivenessScheduleEntry[] = LIVENESS_TARGET_ANGLES.map(
  (targetAngle, order) => {
    const segmentIndex = angleToSegmentIndex(targetAngle)
    return {
      order,
      segmentIndex,
      angleDeg: targetAngle, // Use the canonical angle directly for accurate validation
      magnitude: 1.0, // Target magnitude for full-strength gaze (not currently used)
    }
  },
)

export function angleDeltaDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b))
  return diff > 180 ? 360 - diff : diff
}

// Validates gaze magnitude and direction for liveness detection
// Uses circular validation: magnitude threshold + angle tolerance
export function validatePoseForLiveness(
  gazeMagnitude: number,
  gazeAngleDeg: number,
  targetAngleDeg: number,
): {
  isValid: boolean
  reason?: string
  magnitudeValid: boolean
  angleValid: boolean
  magnitudeValue: number
  angleValue: number
  angleDelta: number
} {
  // Check if gaze magnitude meets minimum threshold
  const magnitudeValid = gazeMagnitude >= MIN_GAZE_MAGNITUDE_THRESHOLD

  // Check if gaze angle is within tolerance of target angle
  const delta = angleDeltaDeg(gazeAngleDeg, targetAngleDeg)
  const angleValid = delta <= LIVENESS_GAZE_TOLERANCE_DEG

  const isValid = magnitudeValid && angleValid

  let reason: string | undefined
  if (!isValid) {
    if (!magnitudeValid) {
      reason = `Gaze magnitude ${gazeMagnitude.toFixed(3)} below threshold ${MIN_GAZE_MAGNITUDE_THRESHOLD.toFixed(3)}`
    } else if (!angleValid) {
      reason = `Gaze angle ${gazeAngleDeg.toFixed(1)}° differs from target ${targetAngleDeg.toFixed(1)}° by ${delta.toFixed(1)}° (tolerance: ${LIVENESS_GAZE_TOLERANCE_DEG}°)`
    }
  }

  return {
    isValid,
    reason: isValid ? undefined : reason,
    magnitudeValid,
    angleValid,
    magnitudeValue: gazeMagnitude,
    angleValue: gazeAngleDeg,
    angleDelta: delta,
  }
}
/**
 * Parse Android Play Integrity attestation response
 */
export function parseAndroidIntegrityAttestation(attestationB64: string): AndroidIntegrityResponse {
  try {
    const jsonStr = Buffer.from(attestationB64, "base64").toString()
    const response = JSON.parse(jsonStr) as AndroidIntegrityResponse

    const validFormats = ["android-play-integrity", "android-play-integrity-keystore"]
    if (!response.format || !validFormats.includes(response.format)) {
      throw new Error(`Invalid Android attestation format: ${response.format}`)
    }

    return response
  } catch (error) {
    throw new Error(`Failed to parse Android attestation: ${msgFromError(error)}`)
  }
}

/**
 * Verify if the attestation is from Android or iOS
 */
export function isAndroidAttestation(attestationBytes: Uint8Array): boolean {
  try {
    // Try to parse as JSON first (Android format)
    const jsonStr = new TextDecoder().decode(attestationBytes)
    const json = JSON.parse(jsonStr)
    const androidFormats = ["android-play-integrity", "android-play-integrity-keystore"]
    return json.format && androidFormats.includes(json.format)
  } catch {
    // If JSON parsing fails, it's likely iOS CBOR format
    return false
  }
}

/**
 * Verify Android Key Attestation certificate chain
 * @param certificates Base64 encoded certificates from Android Keystore
 * @returns Object with verification status and extracted properties
 */
export function verifyAndroidKeyAttestation(certificates: string[]): {
  isValid: boolean
  keyProperties?: {
    algorithm: string
    keySize: number
    securityLevel: string
    attestationChallenge?: string
    origin?: string
    purposes?: string[]
  }
  attestationInfo?: {
    attestationVersion: number
    keymasterVersion: number
    osVersion?: number
    osPatchLevel?: number
  }
  error?: string
} {
  try {
    if (!certificates || certificates.length === 0) {
      return { isValid: false, error: "No certificates provided" }
    }

    // Parse the leaf certificate (contains key attestation extension)
    const leafCertDer = Buffer.from(certificates[0], "base64")
    const cert = AsnParser.parse(leafCertDer, Certificate)

    const extensions = cert.tbsCertificate.extensions
    if (!extensions) {
      return { isValid: false, error: "No extensions found in certificate" }
    }

    const attestationExt = extensions.find((ext) => ext.extnID === OID_ANDROID_KEY_ATTESTATION)
    if (!attestationExt) {
      return { isValid: false, error: "Key attestation extension not found" }
    }

    try {
      // Parse the attestation extension value as AndroidKeyDescription
      const extData = new Uint8Array((attestationExt.extnValue as any).buffer)
      const keyDesc = AsnParser.parse(extData, AndroidKeyDescription)

      // Extract challenge
      const attestationChallenge =
        keyDesc.attestationChallenge.byteLength > 0
          ? Buffer.from(keyDesc.attestationChallenge).toString("base64")
          : undefined

      // Determine security level string
      const securityLevelStr = (level: AndroidSecurityLevel) => {
        switch (level) {
          case AndroidSecurityLevel.Software:
            return "Software"
          case AndroidSecurityLevel.TrustedEnvironment:
            return "TrustedEnvironment"
          case AndroidSecurityLevel.StrongBox:
            return "StrongBox"
          default:
            return "Unknown"
        }
      }

      // Extract key properties from TEE enforced list (hardware-backed properties)
      const teeEnforced = keyDesc.teeEnforced
      let algorithm = "Unknown"
      let keySize = 0
      // let ecCurve = undefined
      let origin = "Unknown"
      let purposes: string[] = []

      if (teeEnforced.algorithm === AndroidKeyAlgorithm.EC) {
        algorithm = "EC"
        if (teeEnforced.ecCurve === AndroidEcCurve.P256) {
          // ecCurve = "P-256"
          keySize = 256
        } else if (teeEnforced.ecCurve === AndroidEcCurve.P384) {
          // ecCurve = "P-384"
          keySize = 384
        } else if (teeEnforced.ecCurve === AndroidEcCurve.P521) {
          // ecCurve = "P-521"
          keySize = 521
        }
      } else if (teeEnforced.algorithm === AndroidKeyAlgorithm.RSA) {
        algorithm = "RSA"
        keySize = teeEnforced.keySize || 0
      }

      if (teeEnforced.keySize) {
        keySize = teeEnforced.keySize
      }

      if (teeEnforced.origin !== undefined) {
        switch (teeEnforced.origin) {
          case AndroidKeyOrigin.GENERATED:
            origin = "Generated"
            break
          case AndroidKeyOrigin.IMPORTED:
            origin = "Imported"
            break
          case AndroidKeyOrigin.SECURELY_IMPORTED:
            origin = "SecurelyImported"
            break
          default:
            origin = "Unknown"
        }
      }

      if (teeEnforced.purpose) {
        const purposeMap: Record<number, string> = {
          0: "ENCRYPT",
          1: "DECRYPT",
          2: "SIGN",
          3: "VERIFY",
          4: "DERIVE_KEY",
          5: "WRAP_KEY",
          6: "AGREE_KEY",
          7: "ATTEST_KEY",
        }
        purposes = teeEnforced.purpose.map((p) => purposeMap[p] || `UNKNOWN_${p}`)
      }

      return {
        isValid: true,
        keyProperties: {
          algorithm,
          keySize,
          securityLevel: securityLevelStr(keyDesc.keymasterSecurityLevel),
          attestationChallenge,
          origin,
          purposes,
        },
        attestationInfo: {
          attestationVersion: keyDesc.attestationVersion,
          keymasterVersion: keyDesc.keymasterVersion,
          osVersion: teeEnforced.osVersion,
          osPatchLevel: teeEnforced.osPatchLevel,
        },
      }
    } catch (parseError) {
      return {
        isValid: false,
        error: `Failed to parse key attestation extension: ${msgFromError(parseError)}`,
      }
    }
  } catch (error) {
    return { isValid: false, error: `Certificate parsing failed: ${msgFromError(error)}` }
  }
}

export function calculateMetrics(cosineScores: number[], facePoses: FacePose[]): FaceMatchMetrics {
  const calculateStats = (values: number[]) => {
    if (values.length === 0) return { avg: 0, stdDev: 0, min: 0, max: 0 }

    const avg = values.reduce((sum, val) => sum + val, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    const min = Math.min(...values)
    const max = Math.max(...values)

    return { avg, stdDev, min, max }
  }

  const cosineStats = calculateStats(cosineScores)
  const pitchStats = calculateStats(facePoses.map((p) => p.pitch))
  const yawStats = calculateStats(facePoses.map((p) => p.yaw))
  const rollStats = calculateStats(facePoses.map((p) => p.roll))

  return {
    cosine_avg_similarity: cosineStats.avg,
    cosine_std_dev: cosineStats.stdDev,
    cosine_min: cosineStats.min,
    cosine_max: cosineStats.max,
    pitch_avg: pitchStats.avg,
    pitch_std_dev: pitchStats.stdDev,
    pitch_min: pitchStats.min,
    pitch_max: pitchStats.max,
    yaw_avg: yawStats.avg,
    yaw_std_dev: yawStats.stdDev,
    yaw_min: yawStats.min,
    yaw_max: yawStats.max,
    roll_avg: rollStats.avg,
    roll_std_dev: rollStats.stdDev,
    roll_min: rollStats.min,
    roll_max: rollStats.max,
    sample_count: cosineScores.length,
  }
}
