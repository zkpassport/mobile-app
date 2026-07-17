//
//  EnhancedMRZProcessor.swift
//  Enhanced MRZ processor that integrates multiple improvement strategies
//  Based on Android's EnhancedMRZProcessor.kt
//

import Foundation
import UIKit
import Vision

// MARK: - MRZ Processing Protocol

protocol MRZProcessingCallback: AnyObject {
    func onMRZExtracted(_ mrz: String, confidence: Float)
    func onMRZSeen()
    func onMRZNotFound()
    func onProcessingFrame()
    func onError(_ error: Error)
    func onMRZLinesDetected(_ lines: [String])
    func onValidChecksumFrame()
    func onProgressUpdate(currentFrames: Int, requiredFrames: Int)
    func onBestValidGroupMRZ(mrzLines: [String], mrz: String, confidence: Float)
}

// MARK: - Enhanced MRZ Processor

class EnhancedMRZProcessor {
    
    // MARK: - Types
    
    public struct LineWithConfidence {
        let text: String
        let confidence: Float
        let boundingBox: CGRect?
    }
    
    public struct MRZCandidate {
        let lines: [String]
        let confidence: Float
        let format: MRZFormat
    }
    
    public struct CorrectedMRZ {
        let lines: [String]
        let confidence: Float
        let checksumValid: Bool
        let fieldConfidences: [String: Float]
    }
    
    public enum MRZFormat {
        case TD1  // ID Card
        case TD3  // Passport
    }
    
    // MARK: - Properties
    
    private let documentType: String?
    private let imagePreprocessor: ImagePreprocessor
    private let multiFrameAggregator = MultiFrameAggregator()
    
    // OCR engines
    private var tesseractEngine: TesseractOCREngine?
    private var visionRequest: VNRecognizeTextRequest?
    
    // Frame sequencing
    private var frameSequence = 0
    private var lastProcessedSequence = 0
    private var frameCounter = 0
    
    // Prevent multiple extraction callbacks
    private var hasExtractedMRZ = false
    
    // Processing queue
    private let processingQueue = DispatchQueue(
        label: "app.zkpassport.zkpassport.mrz.processing",
        qos: .userInitiated
    )
    
    // MARK: - Initialization
    
    init(documentType: String? = nil) {
        self.documentType = documentType
        self.imagePreprocessor = ImagePreprocessor(documentType: documentType)
    }
    
    func initialize() {
        // Initialize Tesseract engine
        tesseractEngine = TesseractOCREngine(documentType: documentType)
        if let engine = tesseractEngine {
            if engine.initialize() {
                debug("Tesseract OCR engine initialized")
            } else {
                print("Failed to initialize Tesseract engine")
                tesseractEngine = nil
            }
        }
        
        // Initialize Vision request
        setupVisionRequest()
        
        // Initialize Tesseract pool if enabled
        if MRZScanConfig.enableParallelOCR {
            TesseractOCREngine.initializePool(size: MRZScanConfig.maxOcrPoolSize)
        }
        
        debug("Enhanced MRZ Processor initialized with Tesseract and Vision")
    }
    
    /// Reset the processor for a new scan
    func reset() {
        hasExtractedMRZ = false
        multiFrameAggregator.reset()
        frameSequence = 0
        lastProcessedSequence = 0
        frameCounter = 0
        debug("Processor reset for new scan")
    }
    
    private func setupVisionRequest() {
        visionRequest = VNRecognizeTextRequest { [weak self] request, error in
            guard let self = self else { return }
            
            if let error = error {
                print("Vision request error: \(error)")
                return
            }
            
            // Results are processed in processImage method
        }
        
        visionRequest?.recognitionLevel = .fast
        visionRequest?.usesLanguageCorrection = false
        visionRequest?.recognitionLanguages = ["en-US"]
        visionRequest?.customWords = ["MRZ", "PASSPORT"]
    }
    
    // MARK: - Image Processing
    
    func processImage(
        _ image: UIImage,
        callback: MRZProcessingCallback,
        onProcessedImage: ((UIImage) -> Void)? = nil
    ) {
        frameSequence += 1
        let currentSequence = frameSequence
        
        debug("Processing image: \(image.size), sequence: \(currentSequence)")
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Step 1: Preprocess image if enabled
            let processedImage: UIImage
            if MRZScanConfig.enablePreprocessing {
                processedImage = self.imagePreprocessor.preprocessImage(
                    image,
                    config: MRZScanConfig.preprocessingConfig,
                    frameNumber: currentSequence
                )
                
                // Callback with processed image for debug
                DispatchQueue.main.async {
                    onProcessedImage?(processedImage)
                }
            } else {
                processedImage = image
                DispatchQueue.main.async {
                    onProcessedImage?(image)
                }
            }
            
            // Step 2: Run OCR - alternate between Tesseract and Vision
            self.frameCounter += 1
            let useVision = MRZScanConfig.enableVisionAlternation &&
                           (self.frameCounter % 2 == 1)  // Odd frames use Vision
            
            self.debug("Frame \(self.frameCounter): Using \(useVision ? "Vision" : "Tesseract") for OCR")
            
            if useVision {
                self.processWithVision(processedImage, sequence: currentSequence, callback: callback)
            } else {
                self.processWithTesseract(processedImage, sequence: currentSequence, callback: callback)
            }
        }
    }
    
    // MARK: - OCR Processing
    
    private func processWithTesseract(_ image: UIImage, sequence: Int, callback: MRZProcessingCallback) {
        tesseractEngine?.recognizeAsync(image: image, documentType: documentType) { [weak self] lines in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                self.processOCRResult(lines: lines.map { line in
                    LineWithConfidence(
                        text: line.text,
                        confidence: line.confidence,
                        boundingBox: line.boundingBox
                    )
                }, sequence: sequence, engineName: "Tesseract", callback: callback)
            }
        }
    }
    
    private func processWithVision(_ image: UIImage, sequence: Int, callback: MRZProcessingCallback) {
        guard let cgImage = image.cgImage,
              let visionRequest = visionRequest else {
            debug("Failed to create CGImage or Vision request not initialized")
            callback.onMRZNotFound()
            return
        }
        
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        
        do {
            try handler.perform([visionRequest])
            
            // Extract results
            let observations = visionRequest.results as? [VNRecognizedTextObservation] ?? []
            let lines = extractLinesFromVision(observations)
            
            DispatchQueue.main.async { [weak self] in
                self?.processOCRResult(
                    lines: lines,
                    sequence: sequence,
                    engineName: "Vision",
                    callback: callback
                )
            }
        } catch {
            print("Vision recognition error: \(error)")
            DispatchQueue.main.async {
                callback.onError(error)
            }
        }
    }
    
    private func extractLinesFromVision(_ observations: [VNRecognizedTextObservation]) -> [LineWithConfidence] {
        var lines: [LineWithConfidence] = []
        
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            
            let text = candidate.string
                .replacingOccurrences(of: " ", with: "")
                .uppercased()
            
            // Filter MRZ-like lines
            guard text.count >= 10,
                  containsMRZCharacters(text) else { continue }
            
            // Convert Vision bounding box to UIKit coordinates
            let boundingBox = CGRect(
                x: observation.boundingBox.origin.x,
                y: 1.0 - observation.boundingBox.origin.y - observation.boundingBox.height,
                width: observation.boundingBox.width,
                height: observation.boundingBox.height
            )
            
            lines.append(LineWithConfidence(
                text: text,
                confidence: candidate.confidence,
                boundingBox: boundingBox
            ))
        }
        
        // Sort by vertical position
        lines.sort { ($0.boundingBox?.origin.y ?? 0) < ($1.boundingBox?.origin.y ?? 0) }
        
        return lines
    }
    
    // MARK: - OCR Result Processing
    
    private func processOCRResult(
        lines: [LineWithConfidence],
        sequence: Int,
        engineName: String,
        callback: MRZProcessingCallback
    ) {
        // Check for out-of-order results
        if sequence < lastProcessedSequence {
            debug("Out-of-order result: sequence \(sequence) < \(lastProcessedSequence)")
        }
        lastProcessedSequence = max(lastProcessedSequence, sequence)
        
        debug("[\(engineName)] Processing OCR result with \(lines.count) lines, sequence: \(sequence)")
        
        // Extract MRZ candidates
        let candidates = extractMRZCandidates(from: lines, callback: callback)
        
        guard !candidates.isEmpty else {
            debug("No MRZ candidates found")
            callback.onMRZNotFound()
            return
        }
        
        debug("Found \(candidates.count) MRZ candidates")
        
        // Process each candidate
        for candidate in candidates {
            debug("Processing candidate: \(candidate.lines.joined(separator: " / "))")
            
            if let correctedMRZ = processCandidate(candidate) {
                // Notify about detected lines
                if correctedMRZ.lines.count >= 2 {
                    callback.onMRZLinesDetected(correctedMRZ.lines)
                }
                
                // Try multi-frame aggregation
                if MRZScanConfig.enableMultiFrame {
                    if let aggregatedMRZ = multiFrameAggregator.addFrame(
                        mrzLines: correctedMRZ.lines,
                        confidence: candidate.confidence,
                        checksumValid: correctedMRZ.checksumValid,
                        fieldConfidences: correctedMRZ.fieldConfidences
                    ) {
                        // Only call onMRZExtracted once
                        guard !hasExtractedMRZ else {
                            debug("MRZ already extracted, skipping duplicate callback")
                            return
                        }
                        hasExtractedMRZ = true
                        
                        debug("MRZ consensus achieved through aggregation")
                        callback.onBestValidGroupMRZ(
                            mrzLines: aggregatedMRZ.mrzLines,
                            mrz: aggregatedMRZ.mrz,
                            confidence: aggregatedMRZ.confidence
                        )
                        callback.onMRZExtracted(aggregatedMRZ.mrz, confidence: aggregatedMRZ.confidence)
                        return
                    }
                    
                    // Update progress
                    let progress = multiFrameAggregator.getValidFrameProgress()
                    callback.onProgressUpdate(
                        currentFrames: progress.current,
                        requiredFrames: progress.required
                    )
                    
                    if correctedMRZ.checksumValid {
                        callback.onValidChecksumFrame()
                    }
                    
                    callback.onProcessingFrame()
                } else {
                    // Single frame processing
                    if correctedMRZ.checksumValid && correctedMRZ.confidence >= MRZScanConfig.minConfidence {
                        // Only call onMRZExtracted once
                        guard !hasExtractedMRZ else {
                            debug("MRZ already extracted, skipping duplicate callback")
                            return
                        }
                        hasExtractedMRZ = true
                        
                        let mrzString = correctedMRZ.lines.joined(separator: "\n")
                        callback.onMRZExtracted(mrzString, confidence: correctedMRZ.confidence)
                        return
                    }
                }
            }
        }
        
        callback.onProcessingFrame()
    }
    
    // MARK: - MRZ Extraction and Processing - Part 1
    
    private func extractMRZCandidates(from lines: [LineWithConfidence], callback: MRZProcessingCallback) -> [MRZCandidate] {
        var candidates: [MRZCandidate] = []
        var allLines: [LineWithConfidence] = []
        
        debug("Recognized lines: \(lines.count)")
        debug("Lines: \(lines.map { $0.text }.joined(separator: "\n"))")
        
        // Notify that MRZ-like text was seen
        if !lines.isEmpty {
            callback.onMRZSeen()
        }
        
        // Filter valid MRZ lines
        for line in lines {
            let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if text.count >= 10 && containsMRZCharacters(text) && line.confidence >= MRZScanConfig.minConfidence {
                // Remove non-MRZ characters and trim leading `<` (OCR sometimes adds them incorrectly)
                let cleanedText = trimLeadingFillers(removeNonMRZCharacters(text))
                allLines.append(LineWithConfidence(
                    text: cleanedText,
                    confidence: line.confidence,
                    boundingBox: line.boundingBox
                ))
            }
        }
        
        debug("Valid lines after filtering: \(allLines.count)")
        
        guard allLines.count >= 2 && allLines.count <= 3 else {
            debug("Invalid number of lines: \(allLines.count)")
            return candidates
        }
        
        // Try different permutations to find valid format
        let permutations = generatePermutations(allLines)
        
        for permutation in permutations {
            if checkTD3Format(permutation) {
                debug("Found TD3 format")
                candidates.append(createTD3Candidate(from: permutation))
            } else if checkTD1Format(permutation) {
                debug("Found TD1 format")
                candidates.append(createTD1Candidate(from: permutation))
            }
        }
        
        return candidates
    }
    
    // Continue in next part...
    // This file will be extended with remaining methods
    
    // MARK: - Helpers (Temporary)
    
    private func debug(_ message: String) {
        if MRZScanConfig.enableDebugLogging {
            print("EnhancedMRZProcessor: \(message)")
        }
    }
    
    private func containsMRZCharacters(_ text: String) -> Bool {
        let validChars = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<")
        let validCount = text.filter { validChars.contains($0) }.count
        return validCount > 10
    }
    
    private func removeNonMRZCharacters(_ text: String) -> String {
        let validChars = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<")
        return String(text.filter { validChars.contains($0) })
    }
    
    /// Trim leading `<` characters from MRZ lines
    /// MRZ lines should start with a letter or digit, not `<`
    private func trimLeadingFillers(_ text: String) -> String {
        var result = text
        while result.hasPrefix("<") {
            result.removeFirst()
        }
        return result
    }
    
    private func generatePermutations<T>(_ array: [T]) -> [[T]] {
        guard array.count > 1 else { return [array] }
        
        var result: [[T]] = []
        for i in 0..<array.count {
            let element = array[i]
            var remaining = array
            remaining.remove(at: i)
            
            for subPermutation in generatePermutations(remaining) {
                result.append([element] + subPermutation)
            }
        }
        return result
    }
    
    private func checkTD3Format(_ lines: [LineWithConfidence]) -> Bool {
        return lines.count == 2 &&
               lines[0].text.hasPrefix("P") &&
               lines[0].text.count == 44 &&
               lines[1].text.count == 44
    }
    
    private func checkTD1Format(_ lines: [LineWithConfidence]) -> Bool {
        guard lines.count >= 2 else { return false }
        let firstChar = lines[0].text.first
        return lines.allSatisfy { $0.text.count == 30 } &&
               (firstChar == "I" || firstChar == "C" || firstChar == "A" || firstChar == "X") &&
               lines[0].text.contains(where: { $0.isNumber }) &&
               lines[1].text.prefix(7).allSatisfy { $0.isNumber } &&
               lines[1].text.dropFirst(8).prefix(7).allSatisfy { $0.isNumber }
    }
    
    private func createTD3Candidate(from lines: [LineWithConfidence]) -> MRZCandidate {
        let mrzLines = lines.map { normalizeLineLength($0.text, targetLength: 44) }
        let confidence = lines.map { $0.confidence }.min() ?? 0
        return MRZCandidate(lines: mrzLines, confidence: confidence, format: .TD3)
    }
    
    private func createTD1Candidate(from lines: [LineWithConfidence]) -> MRZCandidate {
        var mrzLines = lines.map { normalizeLineLength($0.text, targetLength: 30) }
        // Add placeholder third line if needed
        if mrzLines.count == 2 {
            mrzLines.append(String(repeating: "<", count: 30))
        }
        let confidence = lines.map { $0.confidence }.min() ?? 0
        return MRZCandidate(lines: Array(mrzLines.prefix(3)), confidence: confidence, format: .TD1)
    }
    
    private func normalizeLineLength(_ text: String, targetLength: Int) -> String {
        if text.count > targetLength {
            return String(text.prefix(targetLength))
        } else if text.count < targetLength {
            return text.padding(toLength: targetLength, withPad: "<", startingAt: 0)
        }
        return text
    }
    
}
