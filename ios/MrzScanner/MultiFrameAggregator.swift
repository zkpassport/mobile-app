//
//  MultiFrameAggregator.swift
//  Aggregates OCR results from multiple frames
//  Based on Android's MultiFrameAggregator.kt
//

import Foundation
import UIKit

class MultiFrameAggregator {
    
    // MARK: - Types
    
    struct FrameResult {
        let timestamp: Date
        let mrzLines: [String]
        let confidence: Float
        let checksumValid: Bool
        let fieldConfidences: [String: Float]
    }
    
    struct FieldConsensus {
        let value: String
        let confidence: Float
        let occurrences: Int
    }
    
    struct MRZResult {
        let mrz: String
        let confidence: Float
        let mrzLines: [String]
    }
    
    struct ConsensusStatus {
        let totalFrames: Int
        let validFrames: Int
        let hasCharacterConsensus: Bool
        let fieldConsensusCount: Int
        let averageConfidence: Float
    }
    
    // MARK: - Properties
    
    private var frameBuffer: [FrameResult] = []
    private var fieldVotes: [String: [String: Int]] = [:]
    private var characterVotes: [String: [[Character: Int]]] = [:]
    private let queue = DispatchQueue(label: "app.zkpassport.zkpassport.multiframe.queue")
    
    // MARK: - Public Methods
    
    /// Add a new frame result to the aggregator
    func addFrame(
        mrzLines: [String],
        confidence: Float = 1.0,
        checksumValid: Bool = false,
        fieldConfidences: [String: Float] = [:]
    ) -> MRZResult? {
        return queue.sync {
            let currentTime = Date()
            
            // Clean up old frames
            frameBuffer.removeAll { frame in
                currentTime.timeIntervalSince(frame.timestamp) > MRZScanConfig.frameExpiryMs
            }
            
            debug("Adding frame: \(mrzLines.joined(separator: " / "))")
            
            // Add new frame
            let frameResult = FrameResult(
                timestamp: currentTime,
                mrzLines: mrzLines,
                confidence: confidence,
                checksumValid: checksumValid,
                fieldConfidences: fieldConfidences
            )
            
            frameBuffer.append(frameResult)
            
            // Keep buffer size under control
            while frameBuffer.count > MRZScanConfig.maxProcessingFrames {
                frameBuffer.removeFirst()
            }
            
            debug("Added frame \(frameBuffer.count)/\(MRZScanConfig.maxProcessingFrames), checksum valid: \(checksumValid)")
            
            // Provide haptic feedback for valid checksum frames
            if checksumValid && MRZScanConfig.enableHapticFeedback {
                performHapticFeedback()
                debug("Haptic feedback triggered for valid checksum frame")
            }
            
            // Try to achieve consensus
            return tryConsensus()
        }
    }
    
    /// Reset the aggregator
    func reset() {
        queue.sync {
            frameBuffer.removeAll()
            fieldVotes.removeAll()
            characterVotes.removeAll()
            debug("Aggregator reset")
        }
    }
    
    /// Get current consensus status
    func getConsensusStatus() -> ConsensusStatus {
        return queue.sync {
            let validFrames = frameBuffer.filter { $0.checksumValid }.count
            let totalFrames = frameBuffer.count
            let consensusLines = buildConsensusLines()
            let fieldConsensus = buildFieldConsensus()
            
            let averageConfidence = frameBuffer.isEmpty ? 0 :
                frameBuffer.map { $0.confidence }.reduce(0, +) / Float(frameBuffer.count)
            
            return ConsensusStatus(
                totalFrames: totalFrames,
                validFrames: validFrames,
                hasCharacterConsensus: consensusLines != nil,
                fieldConsensusCount: fieldConsensus.count,
                averageConfidence: averageConfidence
            )
        }
    }
    
    /// Get current progress for valid frames
    func getValidFrameProgress() -> (current: Int, required: Int) {
        return queue.sync {
            let validGroups = groupValidFramesByKey()
            let bestGroup = validGroups.max { $0.value.count < $1.value.count }
            let current = bestGroup?.value.count ?? 0
            let required = MRZScanConfig.minConsensusFrames
            return (current, required)
        }
    }
    
    // MARK: - Private Methods
    
    private func tryConsensus() -> MRZResult? {
        // Check minimum frame requirement
        if frameBuffer.count < MRZScanConfig.minConsensusFrames {
            let needed = MRZScanConfig.minConsensusFrames - frameBuffer.count
            debug("Not enough frames for consensus: \(frameBuffer.count)/\(MRZScanConfig.minConsensusFrames) (need \(needed) more)")
            return nil
        }
        
        // First, check if we have any frames with valid checksums
        let validFrames = frameBuffer.filter { $0.checksumValid }
        if !validFrames.isEmpty {
            debug("Found \(validFrames.count) frames with valid checksums")
            
            // Group valid frames by key fields (document number, DOB, expiry date) only
            // This allows frames with different names to be grouped together
            var validMrzGroups: [String: [FrameResult]] = [:]
            for frame in validFrames {
                let key = extractKeyFields(from: frame.mrzLines) ?? frame.mrzLines.joined(separator: "\n")
                validMrzGroups[key, default: []].append(frame)
            }
            
            let bestValidGroup = validMrzGroups.max { $0.value.count < $1.value.count }
            debug("Valid frames grouped by key fields (doc number, DOB, expiry): \(validMrzGroups.count) groups")
            debug("Best valid group key: \(bestValidGroup?.key ?? "none")")
            debug("Best valid group has \(bestValidGroup?.value.count ?? 0) frames")
            
            // Check if best group meets the threshold
            // Android uses: (MRZScanConfig.minConsensusFrames / 2).toInt()
            let minRequiredFrames = MRZScanConfig.minConsensusFrames / 2
            
            if let bestValidGroup = bestValidGroup,
               bestValidGroup.value.count >= minRequiredFrames {
                debug("Consensus achieved with \(bestValidGroup.value.count) valid frames")
                
                // Calculate average confidence of the best valid group
                let averageConfidence = bestValidGroup.value
                    .map { $0.confidence }
                    .reduce(0, +) / Float(bestValidGroup.value.count)
                debug("Best valid group average confidence: \(averageConfidence)")
                
                // Get the actual MRZ lines from the frame with highest confidence in the best group
                // We use the actual MRZ lines, not the key field grouping
                let bestFrame = bestValidGroup.value.max { $0.confidence < $1.confidence }
                let bestValidMrzLines = bestFrame?.mrzLines ?? bestValidGroup.value.first!.mrzLines
                debug("Best valid group MRZ lines: \(bestValidMrzLines.joined(separator: " | "))")
                
                let mrzString = parseMRZLines(bestValidMrzLines)
                if let mrzString = mrzString {
                    return MRZResult(
                        mrz: mrzString,
                        confidence: averageConfidence,
                        mrzLines: bestValidMrzLines
                    )
                } else {
                    return nil
                }
            }
        }
        
        // Character-level consensus and field-level consensus are commented out in Android
        // as simple checksum validation is sufficient
        
        debug("No consensus achieved yet")
        return nil
    }
    
    private func groupValidFramesByKey() -> [String: [FrameResult]] {
        let validFrames = frameBuffer.filter { $0.checksumValid }
        var groups: [String: [FrameResult]] = [:]
        
        for frame in validFrames {
            if let key = extractKeyFields(from: frame.mrzLines) {
                groups[key, default: []].append(frame)
            } else {
                // Fallback to full MRZ as key
                let fullKey = frame.mrzLines.joined(separator: "\n")
                groups[fullKey, default: []].append(frame)
            }
        }
        
        return groups
    }
    
    private func extractKeyFields(from mrzLines: [String]) -> String? {
        guard mrzLines.count >= 2 else { return nil }
        
        do {
            // TD3 (Passport) format
            if mrzLines[0].hasPrefix("P") && mrzLines[0].count == 44 && mrzLines[1].count == 44 {
                // Android: mrzLines[1].substring(0, 9).trim('<')
                let documentNumber = String(mrzLines[1].prefix(9))
                    .trimmingCharacters(in: CharacterSet(charactersIn: "<"))
                // Android: mrzLines[1].substring(13, 19)
                let line1 = mrzLines[1]
                let startIndex13 = line1.index(line1.startIndex, offsetBy: 13)
                let endIndex19 = line1.index(line1.startIndex, offsetBy: 19)
                let dateOfBirth = String(line1[startIndex13..<endIndex19])
                // Android: mrzLines[1].substring(21, 27)
                let startIndex21 = line1.index(line1.startIndex, offsetBy: 21)
                let endIndex27 = line1.index(line1.startIndex, offsetBy: 27)
                let expiryDate = String(line1[startIndex21..<endIndex27])
                
                return "TD3:\(documentNumber):\(dateOfBirth):\(expiryDate)"
            }
            
            // TD1 (ID Card) format
            if mrzLines.allSatisfy({ $0.count == 30 }) {
                let line1 = mrzLines[0]
                
                // Check if it's an extended document number format
                // Android: line1.getOrNull(14) == '<'
                let index14 = line1.index(line1.startIndex, offsetBy: 14)
                let isExtended = line1[index14] == "<"
                
                let documentNumber: String
                if isExtended {
                    // Extended format: combine positions 5-13 with positions 15-29 (until '<')
                    // Android: line1.substring(5, 14) + line1.substring(15, 30).takeWhile { it != '<' }
                    let startIndex5 = line1.index(line1.startIndex, offsetBy: 5)
                    let endIndex14 = line1.index(line1.startIndex, offsetBy: 14)
                    let part1 = String(line1[startIndex5..<endIndex14])
                    
                    let startIndex15 = line1.index(line1.startIndex, offsetBy: 15)
                    let part2 = String(line1[startIndex15...].prefix(while: { $0 != "<" }))
                    
                    documentNumber = part1 + part2
                } else {
                    // Standard format: positions 5-14 (9 chars + check digit)
                    // Android: line1.substring(5, 15)
                    let startIndex5 = line1.index(line1.startIndex, offsetBy: 5)
                    let endIndex15 = line1.index(line1.startIndex, offsetBy: 15)
                    documentNumber = String(line1[startIndex5..<endIndex15])
                }
                
                let line2 = mrzLines[1]
                // Android: mrzLines[1].substring(0, 6)
                let dateOfBirth = String(line2.prefix(6))
                // Android: mrzLines[1].substring(8, 14)
                let startIndex8 = line2.index(line2.startIndex, offsetBy: 8)
                let endIndex14 = line2.index(line2.startIndex, offsetBy: 14)
                let expiryDate = String(line2[startIndex8..<endIndex14])
                
                return "TD1:\(documentNumber):\(dateOfBirth):\(expiryDate)"
            }
            
            return nil
        } catch {
            debug("Failed to extract key fields: \(error)")
            return nil
        }
    }
    
    private func parseMRZLines(_ lines: [String]) -> String? {
        debug("Parsing MRZ lines: \(lines.joined(separator: " / "))")
        
        if lines.count >= 2 && lines[0].hasPrefix("P") && lines[0].count == 44 {
            // TD3 format
            return lines.prefix(2).joined(separator: "\n")
        } else if lines.count >= 2 && lines.allSatisfy({ $0.count == 30 }) {
            // TD1 format - add third line if missing
            let mrzLines = lines.count == 2 ?
                lines + [String(repeating: "<", count: 30)] :
                Array(lines.prefix(3))
            return mrzLines.joined(separator: "\n")
        }
        
        return nil
    }
    
    private func buildConsensusLines() -> [String]? {
        // Not implemented as simple checksum validation is sufficient
        // Could be implemented for additional accuracy if needed
        return nil
    }
    
    private func buildFieldConsensus() -> [String: FieldConsensus] {
        // Not implemented as simple checksum validation is sufficient
        // Could be implemented for additional accuracy if needed
        return [:]
    }
    
    private func performHapticFeedback() {
        let impactFeedback = UIImpactFeedbackGenerator(style: .light)
        impactFeedback.prepare()
        impactFeedback.impactOccurred()
    }
    
    private func debug(_ message: String) {
        if MRZScanConfig.enableDebugLogging {
            print("MultiFrameAggregator: \(message)")
        }
    }
}
