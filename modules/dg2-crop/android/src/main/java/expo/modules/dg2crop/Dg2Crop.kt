package expo.modules.dg2crop

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.util.Log

class Dg2Crop : Module() {
  companion object {
    private const val TAG = "Dg2Crop"
  }

  override fun definition() = ModuleDefinition {
    Name("Dg2Crop")

    // Trim white border from a base64-encoded image
    AsyncFunction("trimWhiteBorderBase64") { base64Input: String, tolerance: Int, promise: Promise ->
      try {
        Log.d(TAG, "trimWhiteBorderBase64: input length=${base64Input.length} tolerance=$tolerance")

        // Call the native method via JNI
        val result = Dg2CropJNI.trimWhiteBorderBase64(base64Input, tolerance)
        Log.d(TAG, "trimWhiteBorderBase64() returned result (truncated): ${result.take(100)}")

        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "Error in trimWhiteBorderBase64", e)
        promise.resolve("{\"error\":\"${escapeJson(e.message ?: "Unknown error")}\"}")
      }
    }
  }

  private fun escapeJson(s: String): String {
    return s.replace("\\", "\\\\").replace("\"", "\\\"")
  }
}
