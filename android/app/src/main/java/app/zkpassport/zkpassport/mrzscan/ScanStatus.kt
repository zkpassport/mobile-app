package app.zkpassport.zkpassport.mrzscan

/**
 * Mirrors the iOS ScanStatus enum so we can drive the Android overlay
 * with the same state machine semantics.
 */
enum class ScanStatus {
    INITIAL,        // Searching for MRZ
    DETECTING,      // MRZ detected, soft pulsing vibration
    HOLD_STILL,     // Position found, verifying
    CROPPED,        // Camera went out of frame
    ERROR,          // Couldn't read document
    TIMEOUT,        // Code not detected
    SUCCESS         // Scan successful
}
