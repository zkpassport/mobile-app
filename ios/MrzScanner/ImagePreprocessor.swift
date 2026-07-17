//
//  ImagePreprocessor.swift
//  OpenCV-mobile based preprocessing pipeline for MRZ OCR
//  Equivalent to Android's OpenCVImagePreprocessor
//

import Foundation
import UIKit

class ImagePreprocessor {
    
    // MARK: - Properties
    private let documentType: String?
    
    // MARK: - Initialization
    init(documentType: String? = nil) {
        self.documentType = documentType
    }
    
    // MARK: - Static Methods
    
    /// Check if OpenCV is available
    static var isAvailable: Bool {
        return OpenCVWrapper.isAvailable()
    }
    
    // MARK: - Main preprocessing pipeline
    
    /// Main preprocessing pipeline using OpenCV-mobile
    /// Implements the same algorithm as Android's OpenCVImagePreprocessor
    func preprocessImage(
        _ image: UIImage,
        config: MRZScanConfig.PreprocessingConfig = MRZScanConfig.preprocessingConfig,
        frameNumber: Int = 0
    ) -> UIImage {
        
        // Convert Swift config to Objective-C config
        let ocvConfig = OpenCVPreprocessingConfig.default()
        ocvConfig.convertToGrayscale = config.convertToGrayscale
        ocvConfig.binarize = config.binarize
        ocvConfig.scaleToDPI = config.scaleToDPI
        ocvConfig.applyMorphology = config.applyMorphology
        
        // Use OpenCV wrapper for preprocessing
        let result = OpenCVWrapper.preprocessImage(
            image,
            config: ocvConfig,
            documentType: documentType,
            frameNumber: frameNumber,
            enableDebugLogging: MRZScanConfig.enableDebugLogging
        )
        
        return result
    }
    
    // MARK: - Individual Preprocessing Steps
    // These methods are provided for standalone use if needed
    
    /// Convert image to grayscale using OpenCV
    func convertToGrayscale(_ image: UIImage) -> UIImage {
      return OpenCVWrapper.convert(toGrayscale: image)
    }
    
    /// Apply adaptive threshold (binarization) using OpenCV
    /// Matches Android's adaptiveThreshold with ADAPTIVE_THRESH_MEAN_C
    func applyAdaptiveThreshold(
        _ image: UIImage,
        blockSize: Int32,
        constantC: Double
    ) -> UIImage {
        return OpenCVWrapper.applyAdaptiveThreshold(
            image,
            blockSize: blockSize,
            constantC: constantC
        )
    }
    
    /// Apply morphological close operation using OpenCV
    /// Matches Android's morphologyEx with MORPH_CLOSE
    func applyMorphologicalClose(
        _ image: UIImage,
        kernelSize: Int32 = 3
    ) -> UIImage {
        return OpenCVWrapper.applyMorphologicalClose(
            image,
            kernelSize: kernelSize
        )
    }
    
    /// Scale image to optimal size for OCR
    func scaleToOptimalSize(_ image: UIImage) -> UIImage {
        let targetHeight: Int32
        switch documentType?.uppercased() {
        case "TD1":
            targetHeight = Int32(MRZScanConfig.PreprocessingConfig.targetMRZHeightTD1)
        default:
            targetHeight = Int32(MRZScanConfig.PreprocessingConfig.targetMRZHeightTD3)
        }
        
      return OpenCVWrapper.scale(
            image,
            targetHeight: targetHeight,
            maxHeight: Int32(MRZScanConfig.PreprocessingConfig.maxMRZHeight)
        )
    }
    
    // MARK: - Helper Methods
    
    private func debug(_ message: String) {
        if MRZScanConfig.enableDebugLogging {
            print("ImagePreprocessor: \(message)")
        }
    }
}
