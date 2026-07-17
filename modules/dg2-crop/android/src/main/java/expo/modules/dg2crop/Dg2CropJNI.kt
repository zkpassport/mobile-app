package expo.modules.dg2crop

/**
 * JNI bridge for calling the Rust dg2crop library
 */
object Dg2CropJNI {
    init {
        System.loadLibrary("dg2crop")
    }

    /**
     * Trim white border from a base64-encoded image
     * @param base64Input Base64-encoded image string
     * @param tolerance Tolerance for white-ish pixels (0-255, default 15)
     * @return JSON string with result or error
     */
    external fun trimWhiteBorderBase64(
        base64Input: String,
        tolerance: Int
    ): String
}
