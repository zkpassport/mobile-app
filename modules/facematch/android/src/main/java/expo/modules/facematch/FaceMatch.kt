package expo.modules.facematch

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.content.res.AssetManager
import java.io.File
import java.io.FileOutputStream
import android.util.Log

class FaceMatch : Module() {
  companion object {
    private const val TAG = "FaceMatch"
  }

  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('FaceMatch')` in JavaScript.
    Name("FaceMatch")

    // Initialize both detection and recognition sessions
    AsyncFunction("initSessions") { detectorPath: String, recognitionPath: String, promise: Promise ->
      try {
        Log.d(TAG, "initSessions: detector='$detectorPath' recognition='$recognitionPath'")

        // Resolve model paths
        val resolvedDetector = resolveModelPath(detectorPath)
        val resolvedRecognition = resolveModelPath(recognitionPath)
        Log.d(TAG, "Resolved detector='$resolvedDetector' recognition='$resolvedRecognition'")

        // Validate inputs
        if (!File(resolvedDetector).exists()) {
          val error = "{\"error\":\"detector_not_found\",\"path\":\"$resolvedDetector\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }
        if (!File(resolvedRecognition).exists()) {
          val error = "{\"error\":\"recognition_not_found\",\"path\":\"$resolvedRecognition\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }

        // Call the native method via JNI
        Log.d(TAG, "Calling initSessions()")
        val result = FaceMatchJNI.initSessions(resolvedDetector, resolvedRecognition)
        Log.d(TAG, "initSessions() returned $result")

        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "Error in initSessions", e)
        promise.resolve("{\"error\":\"${escapeJson(e.message ?: "Unknown error")}\"}")
      }
    }

    // Cleanup sessions and free memory
    AsyncFunction("cleanupSessions") { promise: Promise ->
      try {
        Log.d(TAG, "Calling cleanupSessions()")
        val result = FaceMatchJNI.cleanupSessions()
        Log.d(TAG, "cleanupSessions() returned $result")
        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "Error in cleanupSessions", e)
        promise.resolve("{\"error\":\"${escapeJson(e.message ?: "Unknown error")}\"}")
      }
    }

    // Analyze face detection only (fast path) - returns landmarks, pose, gaze
    AsyncFunction("analyzeFaceDetection") { bytes: List<Int>, scrfdModelPath: String, promise: Promise ->
      try {
        // Convert List<Int> to ByteArray
        val byteArray = ByteArray(bytes.size)
        for (i in bytes.indices) {
          byteArray[i] = bytes[i].toByte()
        }

        Log.d(TAG, "analyzeFaceDetection: bytes=${byteArray.size} scrfd='$scrfdModelPath'")

        // Resolve model path
        val resolvedScrfd = resolveModelPath(scrfdModelPath)
        Log.d(TAG, "Resolved scrfd='$resolvedScrfd'")

        // Validate inputs
        if (byteArray.isEmpty()) {
          val error = "{\"error\":\"empty_image_bytes\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }
        if (!File(resolvedScrfd).exists()) {
          val error = "{\"error\":\"scrfd_not_found\",\"path\":\"$resolvedScrfd\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }

        // Call the native method via JNI
        Log.d(TAG, "Calling analyzeFaceDetection()")
        val result = FaceMatchJNI.analyzeFaceDetection(byteArray, resolvedScrfd)
        Log.d(TAG, "analyzeFaceDetection() returned ${result.take(200)}")

        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "Error in analyzeFaceDetection", e)
        promise.resolve("{\"error\":\"${escapeJson(e.message ?: "Unknown error")}\"}")
      }
    }

    // Generate face embedding only - requires pre-detected landmarks
    AsyncFunction("analyzeFaceEmbedding") { bytes: List<Int>, arcfaceModelPath: String, landmarksJson: String, promise: Promise ->
      try {
        // Convert List<Int> to ByteArray
        val byteArray = ByteArray(bytes.size)
        for (i in bytes.indices) {
          byteArray[i] = bytes[i].toByte()
        }

        Log.d(TAG, "analyzeFaceEmbedding: bytes=${byteArray.size} arc='$arcfaceModelPath'")

        // Resolve model path
        val resolvedArc = resolveModelPath(arcfaceModelPath)
        Log.d(TAG, "Resolved arc='$resolvedArc'")

        // Validate inputs
        if (byteArray.isEmpty()) {
          val error = "{\"error\":\"empty_image_bytes\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }
        if (!File(resolvedArc).exists()) {
          val error = "{\"error\":\"arcface_not_found\",\"path\":\"$resolvedArc\"}"
          Log.e(TAG, "Error: $error")
          promise.resolve(error)
          return@AsyncFunction
        }

        // Call the native method via JNI
        Log.d(TAG, "Calling analyzeFaceEmbedding()")
        val result = FaceMatchJNI.analyzeFaceEmbedding(byteArray, resolvedArc, landmarksJson)
        Log.d(TAG, "analyzeFaceEmbedding() returned ${result.take(200)}")

        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "Error in analyzeFaceEmbedding", e)
        promise.resolve("{\"error\":\"${escapeJson(e.message ?: "Unknown error")}\"}")
      }
    }
  }

  private fun resolveModelPath(provided: String): String {
    // If the provided path exists as-is, use it
    if (File(provided).exists()) {
      Log.d(TAG, "Using provided path: $provided")
      return provided
    }

    // Get the React Native context properly
    val context = appContext.reactContext
    if (context == null) {
      Log.e(TAG, "React context is null")
      return provided
    }

    val filename = File(provided).name

    // Try to find in app's files directory (for development/testing)
    val filesDir = context.filesDir
    val appFile = File(filesDir, filename)
    
    if (appFile.exists()) {
      Log.d(TAG, "Model already extracted: ${appFile.absolutePath}")
      return appFile.absolutePath
    }

    // Try to extract from bundled assets if it exists there or Play Asset Delivery
    try {
      val assetManager = context.assets
      assetManager.open("models/$filename").use { input ->
        appFile.outputStream().use { output ->
          input.copyTo(output)
        }
      }
      Log.d(TAG, "Extracted model from bundled assets (development mode): ${appFile.absolutePath}")
      return appFile.absolutePath
    } catch (e: Exception) {
      Log.d(TAG, "Model not found in bundled assets: $filename")
    }

    // Return the original path if we couldn't resolve it
    Log.w(TAG, "Could not resolve model path, returning original: $provided")
    return provided
  }

  private fun escapeJson(s: String): String {
    return s.replace("\\", "\\\\").replace("\"", "\\\"")
  }
}