import { Platform } from "react-native"
import Dg2CropModule from "./src/Dg2CropModule"
export { default } from "./src/Dg2CropModule"

/**
 * Trim white borders from a base64-encoded DG2 image
 * Automatically handles data URI prefixes (e.g., "data:image/jpeg;base64,")
 * Supports standard image formats (JPEG, PNG, etc.) and JPEG2000
 * @param base64Input Base64-encoded image string (with or without data URI prefix)
 * @param tolerance Tolerance for white-ish pixels (0-255, default 15)
 * @returns Promise resolving to cropped base64 image with original prefix restored
 */
export async function trimWhiteBorderBase64(
  base64Input: string,
  tolerance: number = 20,
): Promise<string> {
  // Check if input has a data URI prefix (e.g., "data:image/jpeg;base64,")
  let dataUriPrefix = ""
  let base64Only = base64Input

  if (base64Input.startsWith("data:")) {
    // Extract the prefix up to and including "base64,"
    const base64Index = base64Input.indexOf("base64,")
    if (base64Index !== -1) {
      dataUriPrefix = base64Input.substring(0, base64Index + 7) // Include "base64,"
      base64Only = base64Input.substring(base64Index + 7)
    }
  }

  // Call native module with pure base64
  const result = await Dg2CropModule.trimWhiteBorderBase64(base64Only, tolerance)

  // Parse the JSON response
  try {
    const parsed = JSON.parse(result)
    if (parsed.error) {
      throw new Error(parsed.error)
    }

    // Add back the data URI prefix if it was present
    const croppedBase64 = parsed.result
    return dataUriPrefix ? dataUriPrefix + croppedBase64 : croppedBase64
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Failed to parse response from native module")
    }
    throw e
  }
}

/**
 * Remove background from a base64-encoded DG2 image (iOS only)
 * Automatically handles data URI prefixes (e.g., "data:image/jpeg;base64,")
 * @param base64Input Base64-encoded image string (with or without data URI prefix)
 * @returns Promise resolving to processed base64 image with original prefix restored
 */
export async function removeBackgroundBase64(base64Input: string): Promise<string> {
  // Only available on iOS
  if (Platform.OS !== "ios") {
    return base64Input // Return unchanged for non-iOS platforms
  }

  // Check if input has a data URI prefix (e.g., "data:image/jpeg;base64,")
  let dataUriPrefix = ""
  let base64Only = base64Input

  if (base64Input.startsWith("data:")) {
    // Extract the prefix up to and including "base64,"
    const base64Index = base64Input.indexOf("base64,")
    if (base64Index !== -1) {
      dataUriPrefix = base64Input.substring(0, base64Index + 7) // Include "base64,"
      base64Only = base64Input.substring(base64Index + 7)
    }
  }

  // Call native module with pure base64
  const result = await Dg2CropModule.removeBackgroundBase64(base64Only)

  // Parse the JSON response
  try {
    const parsed = JSON.parse(result)
    if (parsed.error) {
      throw new Error(parsed.error)
    }

    // Add back the data URI prefix if it was present
    const processedBase64 = parsed.result
    return dataUriPrefix ? dataUriPrefix + processedBase64 : processedBase64
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Failed to parse response from native module")
    }
    throw e
  }
}
