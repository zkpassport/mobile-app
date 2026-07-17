//
//  TesseractOCREngine.swift
//  Tesseract OCR wrapper for iOS using SwiftyTesseract
//  Based on Android's TesseractOcrEngine.kt
//  Reference: https://transloadit.com/devtips/ocr-in-ios-a-swift-developer-s-guide/
//

import Foundation
import UIKit
import SwiftyTesseract
import libtesseract

public typealias PageSegmentationMode = TessPageSegMode
public extension PageSegmentationMode {
  static let osdOnly = PSM_OSD_ONLY
  static let autoOsd = PSM_AUTO_OSD
  static let autoOnly = PSM_AUTO_ONLY
  static let auto = PSM_AUTO
  static let singleColumn = PSM_SINGLE_COLUMN
  static let singleBlockVerticalText = PSM_SINGLE_BLOCK_VERT_TEXT
  static let singleBlock = PSM_SINGLE_BLOCK
  static let singleLine = PSM_SINGLE_LINE
  static let singleWord = PSM_SINGLE_WORD
  static let circleWord = PSM_CIRCLE_WORD
  static let singleCharacter = PSM_SINGLE_CHAR
  static let sparseText = PSM_SPARSE_TEXT
  static let sparseTextOsd = PSM_SPARSE_TEXT_OSD
  static let count = PSM_COUNT
}

public extension Tesseract {
  var pageSegmentationMode: PageSegmentationMode {
    get {
      perform { tessPointer in
        TessBaseAPIGetPageSegMode(tessPointer)
      }
    }
    set {
      perform { tessPointer in
        TessBaseAPISetPageSegMode(tessPointer, newValue)
      }
    }
  }
}

class TesseractOCREngine {
    
    // MARK: - Types
    struct RecognizedLine {
        let text: String
        let confidence: Float
        let boundingBox: CGRect?
    }
    
    enum OCRError: Error {
        case initializationFailed
        case processingFailed
        case notInitialized
    }
    
    // MARK: - Properties
    private var tesseract: Tesseract?
    private var isInitialized = false
    private let documentType: String?
    
    // Thread pool for async operations
    private static let ocrQueue = DispatchQueue(
        label: "app.zkpassport.zkpassport.tesseract.queue",
        qos: .userInitiated,
        attributes: .concurrent
    )
    
    // Pool of Tesseract instances for parallel processing
    private static var enginePool: [TesseractOCREngine] = []
    private static let poolSemaphore = DispatchSemaphore(value: 1)
    
    // MARK: - Initialization
    init(documentType: String? = nil) {
        self.documentType = documentType
    }
    
    func initialize() -> Bool {
        guard !isInitialized else {
            debug("Tesseract already initialized")
            return true
        }
        
        let tess = Tesseract(language: .custom("mrz"), engineMode: .lstmOnly) {
            // Whitelist only MRZ-valid characters for better accuracy
            set(.allowlist, value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ<0123456789")
        }

        // tess.pageSegmentationMode = .autoOsd
        
        tesseract = tess
        isInitialized = true
        debug("Tesseract successfully initialized with English language")
        return true
    }
    
    // MARK: - Recognition
    
    func recognize(image: UIImage, documentType: String? = nil) -> [RecognizedLine] {
        guard let tesseract = tesseract, isInitialized else {
            debug("Tesseract not initialized")
            return []
        }
        
        // Preprocess image for better OCR results
        let processedImage = preprocessImage(image)
        
        // Perform OCR synchronously using a semaphore to wait for async result
        var recognizedText = ""
        let semaphore = DispatchSemaphore(value: 0)
        
        Task {
            let result = tesseract.performOCR(on: processedImage)
            switch result {
            case .success(let text):
                recognizedText = text
            case .failure(let error):
                self.debug("OCR failed: \(error)")
            }
            semaphore.signal()
        }
        
        // Wait for OCR to complete (with timeout)
        let timeout = DispatchTime.now() + .seconds(5)
        if semaphore.wait(timeout: timeout) == .timedOut {
            debug("OCR timed out")
            return []
        }
        
        debug("Raw OCR text: '\(recognizedText.prefix(200))'")
        
        // Extract lines from recognized text
        return extractLines(from: recognizedText)
    }
    
    func recognizeAsync(
        image: UIImage,
        documentType: String? = nil,
        completion: @escaping ([RecognizedLine]) -> Void
    ) {
        // Try to get engine from pool
        if let pooledEngine = TesseractOCREngine.acquireFromPool() {
            Task {
                let results = await pooledEngine.performOCRAsync(image: image)
                
                // Return engine to pool
                TesseractOCREngine.returnToPool(pooledEngine)
                
                // Call completion on main thread
                DispatchQueue.main.async {
                    completion(results)
                }
            }
        } else {
            // Fallback: use this instance
            Task { [weak self] in
                guard let self = self else {
                    DispatchQueue.main.async {
                        completion([])
                    }
                    return
                }
                
                let results = await self.performOCRAsync(image: image)
                
                DispatchQueue.main.async {
                    completion(results)
                }
            }
        }
    }
    
    // MARK: - Async OCR
    
    private func performOCRAsync(image: UIImage) async -> [RecognizedLine] {
        guard let tesseract = tesseract, isInitialized else {
            debug("Tesseract not initialized")
            return []
        }
        
        // Preprocess image for better OCR results
        let processedImage = preprocessImage(image)
        
        // Perform OCR
        let result = tesseract.performOCR(on: processedImage)
        
        switch result {
        case .success(let recognizedText):
            debug("Raw OCR text: '\(recognizedText.prefix(200))'")
            return extractLines(from: recognizedText)
            
        case .failure(let error):
            debug("OCR error: \(error)")
            return []
        }
    }
    
    // MARK: - Image Preprocessing
    
    /// Preprocess image for better OCR accuracy
    /// Based on: https://transloadit.com/devtips/ocr-in-ios-a-swift-developer-s-guide/
    private func preprocessImage(_ image: UIImage) -> UIImage {
        guard let cgImage = image.cgImage else {
            return image
        }
        
        let ciImage = CIImage(cgImage: cgImage)
        let context = CIContext()
        
        // Apply color controls filter for better contrast
        guard let filter = CIFilter(name: "CIColorControls") else {
            return image
        }
        
        filter.setValue(ciImage, forKey: kCIInputImageKey)
        filter.setValue(1.1, forKey: kCIInputContrastKey)     // Slightly increase contrast
        filter.setValue(0.0, forKey: kCIInputBrightnessKey)   // Neutral brightness
        filter.setValue(0.0, forKey: kCIInputSaturationKey)   // Convert to grayscale
        
        guard let outputImage = filter.outputImage,
              let processedCgImage = context.createCGImage(outputImage, from: outputImage.extent)
        else {
            return image
        }
        
        return UIImage(cgImage: processedCgImage)
    }
    
    // MARK: - Line Extraction
    
    private func extractLines(from text: String) -> [RecognizedLine] {
        var results: [RecognizedLine] = []
        
        // Split text into lines
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        
        // Process each line
        for line in lines {
            // Clean and uppercase the line
            let cleanedLine = line.uppercased()
                .replacingOccurrences(of: " ", with: "")  // Remove spaces
            
            // Filter lines that are too short or don't contain MRZ characters
            guard cleanedLine.count >= 10,
                  containsMRZCharacters(cleanedLine) else { continue }
            
            // SwiftyTesseract doesn't provide per-line confidence
            // Use a default high confidence since we're preprocessing
            let lineConfidence: Float = 0.8
            
            // Add to results if confidence is above threshold
            if lineConfidence >= MRZScanConfig.minConfidence {
                results.append(RecognizedLine(
                    text: cleanedLine,
                    confidence: lineConfidence,
                    boundingBox: nil  // SwiftyTesseract doesn't provide bounding boxes
                ))
            }
        }
        
        debug("Extracted \(results.count) MRZ candidate lines")
        return results
    }
    
    private func containsMRZCharacters(_ text: String) -> Bool {
        let validChars = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<")
        let validCount = text.filter { validChars.contains($0) }.count
        return validCount > 10
    }
    
    // MARK: - Cleanup
    
    func close() {
        tesseract = nil
        isInitialized = false
        debug("Tesseract closed")
    }
    
    deinit {
        close()
    }
    
    // MARK: - Engine Pool Management
    
    static func initializePool(size: Int = 2) {
        poolSemaphore.wait()
        defer { poolSemaphore.signal() }
        
        // Clear existing pool
        enginePool.forEach { $0.close() }
        enginePool.removeAll()
        
        // Create new engines
        for _ in 0..<size {
            let engine = TesseractOCREngine()
            if engine.initialize() {
                enginePool.append(engine)
            }
        }
        
        print("TesseractOCREngine: Initialized pool with \(enginePool.count) engines")
    }
    
    static func acquireFromPool() -> TesseractOCREngine? {
        poolSemaphore.wait()
        defer { poolSemaphore.signal() }
        
        guard !enginePool.isEmpty else { return nil }
        return enginePool.removeFirst()
    }
    
    static func returnToPool(_ engine: TesseractOCREngine) {
        poolSemaphore.wait()
        defer { poolSemaphore.signal() }
        
        if enginePool.count < MRZScanConfig.maxOcrPoolSize {
            enginePool.append(engine)
        } else {
            engine.close()  // Close excess engines
        }
    }
    
    static func shutdownPool() {
        poolSemaphore.wait()
        defer { poolSemaphore.signal() }
        
        enginePool.forEach { $0.close() }
        enginePool.removeAll()
        
        print("TesseractOCREngine: Pool shutdown completed")
    }
    
    // MARK: - Helpers
    
    private func debug(_ message: String) {
        if MRZScanConfig.enableDebugLogging {
            print("TesseractOCREngine: \(message)")
        }
    }
}
