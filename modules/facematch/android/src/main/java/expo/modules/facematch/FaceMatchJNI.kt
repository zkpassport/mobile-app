package expo.modules.facematch

/**
 * JNI bridge for calling the Rust facematch library
 */
object FaceMatchJNI {
    init {
        System.loadLibrary("facematch")
    }

    /**
     * Initialize both detection and recognition sessions
     * Must be called once before using analyzeFaceDetection or analyzeFaceEmbedding
     * @param detectorPath Path to SCRFD detector model file
     * @param recognitionPath Path to ArcFace recognition model file
     * @return JSON string with success/error status
     */
    external fun initSessions(
        detectorPath: String,
        recognitionPath: String
    ): String

    /**
     * Cleanup both sessions and free memory
     * Call when done with face analysis or when app goes to background
     * @return JSON string with success status
     */
    external fun cleanupSessions(): String

    /**
     * Analyze face detection only (fast path) - returns landmarks, pose, gaze
     * @param imageBytes The image bytes (JPEG/PNG)
     * @param scrfdPath Path to SCRFD model file
     * @return JSON string with detection results (no embedding)
     */
    external fun analyzeFaceDetection(
        imageBytes: ByteArray,
        scrfdPath: String
    ): String

    /**
     * Generate face embedding only - requires pre-detected landmarks
     * @param imageBytes The image bytes (JPEG/PNG)
     * @param arcfacePath Path to ArcFace model file
     * @param landmarksJson JSON string with landmarks array
     * @return JSON string with embedding results
     */
    external fun analyzeFaceEmbedding(
        imageBytes: ByteArray,
        arcfacePath: String,
        landmarksJson: String
    ): String
}