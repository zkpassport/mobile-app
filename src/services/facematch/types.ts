export declare class AppAttestModule {
  isSupported(): Promise<boolean>
  generateKey(): Promise<string>
  attestKey(keyId: string, clientDataHash: string): Promise<string>
  generateAssertion(keyId: string, clientDataHash: string): Promise<string>
}

// Apple App Attestation Object Type
export type AppleAttestationObject = {
  fmt: string // "apple-appattest"
  attStmt: {
    x5c: [Uint8Array, Uint8Array] // Array of DER-encoded X.509 certificates
    receipt: Uint8Array // App Store receipt data (CMS)
  }
  authData: Uint8Array // Authenticator data
}
// Example data structure:
// fmt: "apple-appattest" (15 bytes)
// attStmt:
//   x5c:
//     x5c[0]: [Uint8Array] (965 bytes)
//     x5c[1]: [Uint8Array] (583 bytes)
//   receipt: [Uint8Array] (3905 bytes)
// authData: [Uint8Array] (164 bytes)

// AAGUID constants for Apple App Attest
// appattestdevelop (development environment)
export const AAGUID_DEV = new Uint8Array([
  97, 112, 112, 97, 116, 116, 101, 115, 116, 100, 101, 118, 101, 108, 111, 112,
])
// appattest (production environment)
export const AAGUID_PROD = new Uint8Array([
  97, 112, 112, 97, 116, 116, 101, 115, 116, 0, 0, 0, 0, 0, 0, 0,
])

// 0x4531e198b5b4ec04da1502045704ed4f877272d76135b26116cfc88b615d0a000719ba69858dfe77caa3b839e020ddd6n
export const APPLE_AA_ROOT_CA_PUBKEY_X = new Uint8Array([
  69, 49, 225, 152, 181, 180, 236, 4, 218, 21, 2, 4, 87, 4, 237, 79, 135, 114, 114, 215, 97, 53,
  178, 97, 22, 207, 200, 139, 97, 93, 10, 0, 7, 25, 186, 105, 133, 141, 254, 119, 202, 163, 184, 57,
  224, 32, 221, 214,
])
// 0x56141404702831e43f70b88fd6c394b608ea2bd6ae61e9f598c12f46af52937266e57f14eb61fec530f7144f53812e35n
export const APPLE_AA_ROOT_CA_PUBKEY_Y = new Uint8Array([
  86, 20, 20, 4, 112, 40, 49, 228, 63, 112, 184, 143, 214, 195, 148, 182, 8, 234, 43, 214, 174, 97,
  233, 245, 152, 193, 47, 70, 175, 82, 147, 114, 102, 229, 127, 20, 235, 97, 254, 197, 48, 247, 20,
  79, 83, 129, 46, 53,
])

export type GazeDirection2D = {
  magnitude: number // -1 to 1, cosine
  angleDeg: number // -180 to 180, angle in degrees
}

export type LivenessSegmentIndex = number

export type LivenessScheduleEntry = {
  order: number
  segmentIndex: LivenessSegmentIndex
  angleDeg: number
  magnitude: number
}

export type LivenessTargetState = {
  activeSegmentIndex: number
  activeAngleDeg: number
  target: LivenessScheduleEntry
  schedule: readonly LivenessScheduleEntry[]
}

export type FacePose = {
  pitch: number
  yaw: number
  roll: number
}

export type FaceLandmarks = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  // [left_eye, right_eye, nose, mouth_left, mouth_right]
]

export type FaceAnalysisResponse = {
  embedding: number[]
  pitch: number
  yaw: number
  roll: number
  gaze_magnitude: number
  gaze_angle_deg: number
  landmarks?: FaceLandmarks
}

export type LivenessProgress = {
  matchesPerTarget: Map<LivenessSegmentIndex, number>
  currentIndex: number
  lastAcceptedAt: number | null
  poseSamples: FacePose[]
}

export type FaceDetectionResponse = {
  landmarks: FaceLandmarks
  pitch: number
  yaw: number
  roll: number
  gaze_magnitude: number
  gaze_angle_deg: number
  bbox: [number, number, number, number] // x1, y1, x2, y2
  score: number
}

// NEW: Embedding-only response
export type FaceEmbeddingResponse = {
  embedding: number[]
}

export const GOOGLE_AA_ROOT_CA_RSA_PUBKEY = new Uint8Array([
  175, 182, 199, 130, 43, 177, 167, 1, 236, 43, 180, 46, 139, 204, 84, 22, 99, 171, 239, 152, 47,
  50, 199, 127, 117, 49, 3, 12, 151, 82, 75, 27, 95, 232, 9, 251, 199, 42, 169, 69, 31, 116, 60,
  189, 154, 111, 19, 53, 116, 74, 165, 94, 119, 246, 182, 172, 53, 53, 238, 23, 194, 94, 99, 149,
  23, 221, 156, 146, 230, 55, 74, 83, 203, 254, 37, 143, 143, 251, 182, 253, 18, 147, 120, 162, 42,
  76, 169, 156, 69, 45, 71, 165, 159, 50, 1, 244, 65, 151, 202, 28, 205, 126, 118, 47, 178, 245, 49,
  81, 182, 254, 178, 255, 253, 43, 111, 228, 254, 91, 198, 189, 158, 195, 75, 254, 8, 35, 157, 170,
  252, 235, 142, 181, 168, 237, 43, 58, 205, 156, 94, 58, 119, 144, 225, 181, 20, 66, 121, 49, 89,
  133, 152, 17, 173, 158, 178, 169, 107, 189, 215, 165, 124, 147, 169, 28, 65, 252, 205, 39, 214,
  127, 214, 246, 113, 170, 11, 129, 82, 97, 173, 56, 79, 163, 121, 68, 134, 70, 4, 221, 179, 216,
  196, 249, 32, 161, 155, 22, 86, 194, 241, 74, 214, 208, 60, 86, 236, 6, 8, 153, 4, 28, 30, 209,
  165, 254, 109, 52, 64, 181, 86, 186, 209, 208, 161, 82, 88, 156, 83, 229, 93, 55, 7, 98, 240, 18,
  46, 239, 145, 134, 27, 27, 14, 108, 76, 128, 146, 116, 153, 192, 233, 190, 192, 184, 62, 59, 193,
  249, 60, 114, 192, 73, 96, 75, 189, 47, 19, 69, 230, 44, 63, 142, 38, 219, 236, 6, 201, 71, 102,
  243, 193, 40, 35, 157, 79, 67, 18, 250, 216, 18, 56, 135, 224, 107, 236, 245, 103, 88, 59, 248,
  53, 90, 129, 254, 234, 186, 249, 154, 131, 200, 223, 62, 42, 50, 42, 252, 103, 43, 241, 32, 177,
  53, 21, 139, 104, 33, 206, 175, 48, 155, 110, 238, 119, 249, 136, 51, 176, 24, 218, 161, 14, 69,
  31, 6, 163, 116, 213, 7, 129, 243, 89, 8, 41, 102, 187, 119, 139, 147, 8, 148, 38, 152, 231, 78,
  11, 205, 36, 98, 138, 1, 194, 204, 3, 229, 31, 11, 62, 91, 74, 193, 228, 223, 158, 175, 159, 246,
  164, 146, 167, 124, 20, 131, 136, 40, 133, 1, 91, 66, 44, 230, 123, 128, 184, 140, 155, 72, 225,
  59, 96, 122, 181, 69, 199, 35, 255, 140, 68, 248, 242, 211, 104, 185, 246, 82, 13, 49, 20, 94,
  191, 158, 134, 42, 215, 29, 246, 163, 191, 210, 69, 9, 89, 214, 83, 116, 13, 151, 161, 47, 54,
  139, 19, 239, 102, 213, 208, 165, 74, 110, 47, 93, 154, 111, 239, 68, 104, 50, 188, 103, 132, 71,
  37, 134, 31, 9, 61, 208, 230, 243, 64, 93, 168, 150, 67, 239, 15, 77, 105, 182, 66, 0, 81, 253,
  185, 48, 73, 103, 62, 54, 149, 5, 128, 211, 205, 244, 251, 208, 139, 197, 132, 131, 149, 38, 0,
  99,
])

export const GOOGLE_AA_ROOT_CA_ECDSA_PUBKEY_X = new Uint8Array([
  35, 218, 35, 113, 78, 223, 62, 91, 5, 10, 60, 114, 232, 132, 106, 206, 7, 142, 160, 173, 27, 249,
  139, 21, 244, 83, 208, 203, 8, 178, 195, 193, 16, 69, 57, 9, 246, 237, 234, 193, 249, 200, 224,
  49, 168, 72, 185, 65,
])
export const GOOGLE_AA_ROOT_CA_ECDSA_PUBKEY_Y = new Uint8Array([
  168, 41, 83, 92, 151, 224, 124, 39, 25, 190, 206, 180, 22, 41, 13, 48, 121, 238, 225, 249, 17,
  204, 230, 223, 128, 57, 20, 216, 163, 87, 123, 52, 253, 253, 20, 62, 94, 243, 108, 151, 19, 199,
  172, 112, 168, 194, 17, 171,
])

export const GOOGLE_PLAY_INTEGRITY_PUBKEY_X = new Uint8Array([
  107, 48, 114, 237, 199, 76, 241, 189, 65, 24, 76, 66, 69, 105, 215, 118, 99, 120, 95, 228, 115,
  59, 132, 26, 127, 164, 243, 248, 131, 236, 116, 92,
])
export const GOOGLE_PLAY_INTEGRITY_PUBKEY_Y = new Uint8Array([
  128, 65, 122, 29, 121, 206, 219, 126, 163, 96, 28, 35, 13, 89, 99, 254, 38, 211, 6, 124, 148, 77,
  5, 49, 23, 104, 193, 198, 191, 90, 73, 156,
])

/**
 * Android Play Integrity attestation response interface
 */
export interface AndroidIntegrityResponse {
  format: string
  integrityToken?: string
  keyId: string
  clientDataHash: string
  appId: string
  environment: string
  signature?: string
  keyAttestation?: {
    publicKey: string
    certificates: string[]
  }
}

/**
 * Android Play Integrity assertion response interface
 */
export interface AndroidAssertionResponse {
  format: string
  assertionToken?: string
  assertion?: string // Legacy field for backward compatibility
  keyId: string
  signature?: string
}
