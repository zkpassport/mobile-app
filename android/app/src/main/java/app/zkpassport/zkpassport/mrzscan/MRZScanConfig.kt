package app.zkpassport.zkpassport.mrzscan

import app.zkpassport.zkpassport.BuildConfig
import app.zkpassport.zkpassport.mrzscan.OpenCVImagePreprocessor

import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Configuration for MRZ scanning with enhanced processing options
 */
object MRZScanConfig {
    
    // Feature flags
    var useEnhancedProcessor = true
    var enablePreprocessing = true
    var enableMultiFrame = true
    var enableAdvancedCorrection = true
    var enableMLKitAlternation = true  // Enable alternating between Tesseract and ML Kit
    var enableVisionMRZDetection = true  // Enable dynamic MRZ region detection using MLKit
    
    // Processing parameters
    var maxProcessingFrames = 30
    var minConsensusFrames = 1
    var consensusThreshold = 0.9f
    var minConfidence = 0.1f
    var frameExpiryMs = 5 * 60000L // 5 minutes
    
    // Image preprocessing - OPTIMIZED DEFAULTS (OpenCV)
    var preprocessingConfig = OpenCVImagePreprocessor.PreprocessingConfig(
        convertToGrayscale = true,
        binarize = true,                  // Adaptive threshold
        scaleToDPI = true,
        applyMorphology = true
    )
    
    // Character confusion matrix tuning
    var maxCorrectionCandidates = 200
    var enableContextAwareCorrection = true
    
    // Performance tuning
    var frameSkipCount = 1 
    var maxImageWidth = 1980  // Resize if larger (reduced from 1920 for better performance)
    var maxImageHeight = 1080   // Reduced from 1080 for better performance
    var minProcessingIntervalMs = 100L  // Minimum time between OCR operations (will be adjusted based on pool size if adaptive is enabled)
    var adaptiveFrameSkipping = true  // Dynamically adjust frame rate based on processing time
    
    // Parallel OCR processing (pool configuration)
    var enableParallelOCR = true  // Enable parallel OCR processing using multiple Tesseract instances
    var maxOcrPoolSize = 4  // Maximum number of Tesseract instances in the pool (limited by available memory)
    var minOcrPoolSize = 1  // Minimum number of Tesseract instances (even on low memory devices)
    var adaptiveProcessingInterval = true  // Automatically adjust minProcessingIntervalMs based on pool size
    
    // Base interval for adaptive calculation (used when pool size = 1)
    private const val BASE_PROCESSING_INTERVAL_MS = 50L
    
    // UI/UX settings
    var showProcessingStatus = true
    var hapticFeedbackEnabled = true
    
    // Camera settings
    var cameraResolutionWidth = 1980  // Camera resolution width (reduced from 1920 for better performance)
    var cameraResolutionHeight = 1080  // Camera resolution height (reduced from 1080 for better performance)
    var useHighestAvailableResolution = false // Disabled to prevent memory issues (was true)
    var maxCameraResolutionWidth = 1920  // Maximum camera resolution width (reduced from 4096)
    var maxCameraResolutionHeight = 1080 // Maximum camera resolution height (reduced from 3072)
    
    // Debug options
    var enableDebugLogging = BuildConfig.DEBUG
    var showDebugImageView = BuildConfig.DEBUG  // Show processed image in debug view
    var imageRotation = 90f  // Rotation angle for camera image (0, 90, 180, 270) - applied before OCR processing
    
    // Screen management
    var keepScreenAwake = true  // Keep screen awake during camera scanning to prevent sleep interruption
    
    // Haptic feedback
    var enableHapticFeedback = true  // Provide haptic feedback when valid MRZ frames are detected
    
    // MRZ text overlay
    var enableMRZOverlay = true      // Show real-time MRZ text overlay on camera preview
    var overlayTextSize = 10f        // Text size for MRZ overlay (in sp)
    var overlayTextColor = android.graphics.Color.GREEN  // Color for MRZ overlay text
    var showPlaceholderMRZ = true    // Show placeholder MRZ when no real MRZ is detected

    fun applyBinarizedHighConfidenceMode() {
        enableAdvancedCorrection = true
        frameSkipCount = 0
        useHighestAvailableResolution = false
        preprocessingConfig = OpenCVImagePreprocessor.PreprocessingConfig(
            convertToGrayscale = true,
            binarize = true,
            scaleToDPI = true,
            applyMorphology = true
        )

        // Only one frame is needed for high confidence
        maxProcessingFrames = 30
        minConsensusFrames = 1
        consensusThreshold = 0.9f
        minConfidence = 0.9f
    }

    fun applyBinarizedLowConfidenceMode() {
        enableAdvancedCorrection = true
        frameSkipCount = 0
        useHighestAvailableResolution = false
        preprocessingConfig = OpenCVImagePreprocessor.PreprocessingConfig(
            convertToGrayscale = true,
            binarize = true,
            scaleToDPI = true,
            applyMorphology = true
        )

        // Low confidence mode requires more frames to be processed
        maxProcessingFrames = 30
        minConsensusFrames = 8
        consensusThreshold = 0.1f
        minConfidence = 0.1f
    }
    
    /**
     * Calculate optimal processing interval based on pool size
     * More engines = shorter interval to keep them all busy
     */
    fun calculateOptimalInterval(poolSize: Int): Long {
        if (!adaptiveProcessingInterval || poolSize <= 0) {
            return BASE_PROCESSING_INTERVAL_MS
        }
        
        // Calculate interval inversely proportional to pool size
        val calculatedInterval = BASE_PROCESSING_INTERVAL_MS / poolSize
        
        // Ensure we don't go below a minimum threshold (50ms = 20 fps max)
        // to prevent overwhelming the system
        return calculatedInterval.coerceAtLeast(50L)
    }
    
    /**
     * Update processing interval based on actual pool size
     * Called after pool initialization
     */
    fun updateIntervalForPoolSize(poolSize: Int) {
        if (adaptiveProcessingInterval) {
            val oldInterval = minProcessingIntervalMs
            minProcessingIntervalMs = calculateOptimalInterval(poolSize)
            
            if (enableDebugLogging) {
                Log.i("MRZScanConfig", 
                    "Adaptive interval: ${oldInterval}ms -> ${minProcessingIntervalMs}ms for $poolSize engines " +
                    "(~${1000 / minProcessingIntervalMs} frames/sec)")
            }
        }
    }
}
