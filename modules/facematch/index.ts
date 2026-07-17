import { FaceLandmarks } from "@/services/facematch/types"
import FaceMatchModule from "./src/FaceMatchModule"
export { default } from "./src/FaceMatchModule"

/**
 * Initialize both detection and recognition sessions
 * Must be called once before using analyzeFaceDetection or analyzeFaceEmbedding
 * Call when component mounts or app starts
 */
export async function initSessions(detectorPath: string, recognitionPath: string) {
  return await FaceMatchModule.initSessions(detectorPath, recognitionPath)
}

/**
 * Cleanup both sessions and free memory
 * Call when component unmounts or app goes to background
 */
export async function cleanupSessions() {
  return await FaceMatchModule.cleanupSessions()
}

// Base64 decode function that works in React Native
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const lookup = new Map<string, number>()
  for (let i = 0; i < chars.length; i++) {
    lookup.set(chars[i], i)
  }

  // Remove padding
  base64 = base64.replace(/=/g, "")

  const bytes: number[] = []
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup.get(base64[i]) || 0
    const encoded2 = lookup.get(base64[i + 1]) || 0
    const encoded3 = lookup.get(base64[i + 2]) || 0
    const encoded4 = lookup.get(base64[i + 3]) || 0

    bytes.push((encoded1 << 2) | (encoded2 >> 4))
    if (base64[i + 2] !== undefined && base64[i + 2] !== "=") {
      bytes.push(((encoded2 & 15) << 4) | (encoded3 >> 2))
    }
    if (base64[i + 3] !== undefined && base64[i + 3] !== "=") {
      bytes.push(((encoded3 & 3) << 6) | encoded4)
    }
  }

  return new Uint8Array(bytes)
}

/**
 * NEW: Fast face detection only - returns landmarks, pose, gaze
 * Runs only SCRFD model for quick UI updates
 */
export async function analyzeFaceDetection(bytes: Uint8Array | number[], scrfdModelPath: string) {
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes
  return await FaceMatchModule.analyzeFaceDetection(arr, scrfdModelPath)
}

/**
 * NEW: Convenience helper to analyze face detection from an image URI
 * - Fetches bytes from the given `photoUri`
 * - Uses default SCRFD model: `scrfd_2.5g_bnkps.ort`
 * - Returns: { landmarks, pose, gaze, bbox, score }
 */
export async function analyzeFaceDetectionFromUri(photoUri: string) {
  if (!photoUri) {
    throw new Error("photoUri is required")
  }

  let bytes: Uint8Array

  // Check if it's a base64 string (with or without data URI prefix)
  if (
    photoUri.includes("base64,") ||
    (!photoUri.startsWith("http") && !photoUri.startsWith("file") && !photoUri.startsWith("/"))
  ) {
    // Handle base64 encoded images
    let base64String = photoUri

    // Remove data URI prefix if present
    if (photoUri.includes("base64,")) {
      const base64Index = photoUri.indexOf("base64,")
      base64String = photoUri.substring(base64Index + 7)
    }

    // Convert base64 to byte array using our custom decoder
    try {
      bytes = new Uint8Array(Buffer.from(base64String, "base64"))
    } catch (error: any) {
      throw new Error(`Failed to decode base64 image: ${error.message}`)
    }
  } else {
    // Handle regular URLs or file URIs
    try {
      const res = await fetch(photoUri)
      let arrayBuffer: ArrayBuffer
      // Some RN/Expo environments expose arrayBuffer on Response; others require going through Blob first
      if (typeof (res as any).arrayBuffer === "function") {
        arrayBuffer = await (res as any).arrayBuffer()
      } else {
        const blob = await res.blob()
        if (blob && typeof (blob as any).arrayBuffer === "function") {
          arrayBuffer = await (blob as any).arrayBuffer()
        } else {
          throw new Error("arrayBuffer not supported by Blob/Response")
        }
      }
      bytes = new Uint8Array(arrayBuffer)
    } catch (error: any) {
      throw new Error(`Failed to fetch image: ${error.message}`)
    }
  }

  const DEFAULT_SCRFD_MODEL = "scrfd_2.5g_bnkps.ort"
  return await analyzeFaceDetection(bytes, DEFAULT_SCRFD_MODEL)
}

/**
 * NEW: Generate face embedding only - requires pre-detected landmarks
 * Runs only ArcFace model with provided landmarks
 */
export async function analyzeFaceEmbedding(
  bytes: Uint8Array | number[],
  arcfaceModelPath: string,
  landmarks: FaceLandmarks,
) {
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes
  const landmarksJson = JSON.stringify(landmarks)
  return await FaceMatchModule.analyzeFaceEmbedding(arr, arcfaceModelPath, landmarksJson)
}

/**
 * NEW: Convenience helper to analyze face embedding from an image URI
 * - Fetches bytes from the given `photoUri`
 * - Uses default ArcFace model: `arcface.ort`
 * - Requires landmarks from a previous detection call
 * - Returns: { embedding }
 */
export async function analyzeFaceEmbeddingFromUri(photoUri: string, landmarks: FaceLandmarks) {
  if (!photoUri) {
    throw new Error("photoUri is required")
  }

  let bytes: Uint8Array

  // Check if it's a base64 string (with or without data URI prefix)
  if (
    photoUri.includes("base64,") ||
    (!photoUri.startsWith("http") && !photoUri.startsWith("file") && !photoUri.startsWith("/"))
  ) {
    // Handle base64 encoded images
    let base64String = photoUri

    // Remove data URI prefix if present
    if (photoUri.includes("base64,")) {
      const base64Index = photoUri.indexOf("base64,")
      base64String = photoUri.substring(base64Index + 7)
    }

    // Convert base64 to byte array using our custom decoder
    try {
      bytes = new Uint8Array(Buffer.from(base64String, "base64"))
    } catch (error: any) {
      throw new Error(`Failed to decode base64 image: ${error.message}`)
    }
  } else {
    // Handle regular URLs or file URIs
    try {
      const res = await fetch(photoUri)
      let arrayBuffer: ArrayBuffer
      // Some RN/Expo environments expose arrayBuffer on Response; others require going through Blob first
      if (typeof (res as any).arrayBuffer === "function") {
        arrayBuffer = await (res as any).arrayBuffer()
      } else {
        const blob = await res.blob()
        if (blob && typeof (blob as any).arrayBuffer === "function") {
          arrayBuffer = await (blob as any).arrayBuffer()
        } else {
          throw new Error("arrayBuffer not supported by Blob/Response")
        }
      }
      bytes = new Uint8Array(arrayBuffer)
    } catch (error: any) {
      throw new Error(`Failed to fetch image: ${error.message}`)
    }
  }

  const DEFAULT_ARCFACE_MODEL = "arcface.ort"
  return await analyzeFaceEmbedding(bytes, DEFAULT_ARCFACE_MODEL, landmarks)
}
