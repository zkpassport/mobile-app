//
//  MRZScanConfig.swift
//  Configuration for MRZ scanning with enhanced processing options
//  Based on Android's MRZScanConfig.kt
//

import Foundation
import CoreGraphics

struct MRZScanConfig {
    // MARK: - Feature Flags
    static var useEnhancedProcessor = true
    static var enablePreprocessing = true
    static var enableMultiFrame = true
    static var enableAdvancedCorrection = true
    static var enableVisionAlternation = true  // Enable alternating between Tesseract and Vision
    static var enableVisionMRZDetection = true  // Use Vision to detect MRZ bounding box before OCR
    
    // MARK: - Processing Parameters
    static var maxProcessingFrames = 30
    static var minConsensusFrames = 8
    static var consensusThreshold: Float = 0.9
    static var minConfidence: Float = 0.1
    static var frameExpiryMs: TimeInterval = 5 * 60 // 5 minutes
    
    // MARK: - Image Preprocessing Configuration
    struct PreprocessingConfig {
        var convertToGrayscale = true
        var binarize = true  // Adaptive threshold
        var scaleToDPI = false
        var applyMorphology = true
        
        // Target dimensions for MRZ processing
        static let targetMRZHeightTD3 = 200  // Passports (2-line)
        static let targetMRZHeightTD1 = 160  // ID cards (3-line)
        static let maxMRZHeight = 240        // Prevent extreme upscaling
    }
    
    static var preprocessingConfig = PreprocessingConfig()
    
    // MARK: - Character Confusion Matrix Tuning
    static var maxCorrectionCandidates = 200
    static var enableContextAwareCorrection = true
    
    // MARK: - Performance Tuning
    static var frameSkipCount = 1  // Skip every other frame (process every 2nd frame)
    static var maxImageWidth = 1980
    static var maxImageHeight = 1080
    static var minProcessingIntervalMs: TimeInterval = 0.15  // 150ms = ~6-7 fps for Tesseract
    static var tesseractProcessingIntervalMs: TimeInterval = 0.2  // 200ms = 5 fps for Tesseract-only
    static var visionProcessingIntervalMs: TimeInterval = 0.05  // 50ms = 20 fps for Vision-only
    static var adaptiveFrameSkipping = true
    
    // MARK: - Parallel OCR Processing
    static var enableParallelOCR = true
    static var maxOcrPoolSize = 4
    static var minOcrPoolSize = 1
    static var adaptiveProcessingInterval = true
    
    // Base interval for adaptive calculation (used when pool size = 1)
    private static let baseProcessingIntervalMs: TimeInterval = 0.05  // 50ms
    
    // MARK: - UI/UX Settings
    static var showProcessingStatus = true
    static var hapticFeedbackEnabled = true
    
    // MARK: - Camera Settings
    static var cameraResolutionWidth = 1980
    static var cameraResolutionHeight = 1080
    static var useHighestAvailableResolution = false
    static var maxCameraResolutionWidth = 1920
    static var maxCameraResolutionHeight = 1080
    
    // MARK: - Debug Options
    static var enableDebugLogging: Bool = {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }()
    static var showDebugImageView: Bool = {
        #if DEBUG
        return true  // Show debug image view in debug builds
        #else
        return false
        #endif
    }()
    static var debugImageMaxSize: CGFloat = 200  // Max dimension for debug image
    static var debugImageScale: CGFloat = 0.25   // Max scale factor for debug image
    static var imageRotation: CGFloat = 90  // Rotation angle for camera image
    
    // MARK: - Screen Management
    static var keepScreenAwake = true
    
    // MARK: - Haptic Feedback
    static var enableHapticFeedback = true
    
    // MARK: - MRZ Text Overlay
    static var enableMRZOverlay = true
    static var overlayTextSize: CGFloat = 10.0
    static var overlayTextColor: UInt32 = 0x00FF00  // Green color (RGB hex)
    static var showPlaceholderMRZ = true
    
    /// Calculate optimal processing interval based on pool size
    static func calculateOptimalInterval(poolSize: Int) -> TimeInterval {
        guard adaptiveProcessingInterval, poolSize > 0 else {
            return baseProcessingIntervalMs
        }
        
        // Calculate interval inversely proportional to pool size
        let calculatedInterval = baseProcessingIntervalMs / Double(poolSize)
        
        // Ensure we don't go below a minimum threshold (50ms = 20 fps max)
        return max(calculatedInterval, 0.05)
    }
    
    /// Update processing interval based on actual pool size
    static func updateIntervalForPoolSize(_ poolSize: Int) {
        guard adaptiveProcessingInterval else { return }
        
        let oldInterval = minProcessingIntervalMs
        minProcessingIntervalMs = calculateOptimalInterval(poolSize: poolSize)
        
        if enableDebugLogging {
            print("MRZScanConfig: Adaptive interval: \(oldInterval)s -> \(minProcessingIntervalMs)s for \(poolSize) engines (~\(Int(1.0 / minProcessingIntervalMs)) frames/sec)")
        }
    }
}
