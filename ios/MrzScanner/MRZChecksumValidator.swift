//
//  MRZChecksumValidator.swift
//  MRZ checksum validation and correction utilities
//  Extension for EnhancedMRZProcessor
//

import Foundation

// MARK: - MRZ Checksum Validation

extension EnhancedMRZProcessor {
    
    // MARK: - Process Candidates with Correction
    
    func processCandidate(_ candidate: MRZCandidate) -> CorrectedMRZ? {
      debug(message: "Processing \(candidate.format) candidate with confidence \(candidate.confidence)")
        
        switch candidate.format {
        case .TD3:
            return processTD3Candidate(candidate)
        case .TD1:
            return processTD1Candidate(candidate)
        }
    }
    
    // MARK: - TD3 (Passport) Processing
    
    private func processTD3Candidate(_ candidate: MRZCandidate) -> CorrectedMRZ? {
        guard candidate.lines.count >= 2 else { return nil }

        let line1 = candidate.lines[0]
        let line2 = candidate.lines[1]

        debug(message: "TD3 Line 1: \(line1)")
        debug(message: "TD3 Line 2: \(line2)")

        // Task 1: Detect swapped lines - check if first line contains date patterns at positions 13-18 and 21-26
        if line1.count == 44 {
            let startIndex13 = line1.index(line1.startIndex, offsetBy: 13)
            let endIndex19 = line1.index(line1.startIndex, offsetBy: 19)
            let startIndex21 = line1.index(line1.startIndex, offsetBy: 21)
            let endIndex27 = line1.index(line1.startIndex, offsetBy: 27)

            let dobPattern = String(line1[startIndex13..<endIndex19])
            let doePattern = String(line1[startIndex21..<endIndex27])

            let numericChars = CharacterSet.decimalDigits
            let dobNumericCount = dobPattern.unicodeScalars.filter { numericChars.contains($0) }.count
            let doeNumericCount = doePattern.unicodeScalars.filter { numericChars.contains($0) }.count

            if dobNumericCount >= 5 && doeNumericCount >= 5 {
                debug(message: "❌ Detected swapped TD3 lines - first line contains date patterns")
                return nil
            }
        }

        // Task 2: Validate document number - '<' can only appear at the end (padding)
        if line2.count >= 9 {
            let docNumber = String(line2.prefix(9))
            var foundFiller = false

            for char in docNumber {
                if char == "<" {
                    foundFiller = true
                } else if foundFiller {
                    // Found a non-'<' character after a '<' - invalid pattern
                    debug(message: "❌ Invalid document number: '<' character found in the middle: \(docNumber)")
                    return nil
                }
            }
        }
        
        // Extract and correct fields
        var correctedFields: [String: String] = [:]
        var fieldConfidences: [String: Float] = [:]
        
        // Line 1 fields
        correctedFields["document_type"] = "P"
        correctedFields["issuing_country"] = correctCountryCode(String(line1.dropFirst(2).prefix(3)))
        correctedFields["names"] = String(line1.dropFirst(5))
        
        // Preserve original lines
        correctedFields["original_line1"] = line1
        correctedFields["original_line2"] = line2
        
        // Line 2 fields with corrections
        let docNumber = String(line2.prefix(9))
        let docNumberCheck = line2.count > 9 ? line2[line2.index(line2.startIndex, offsetBy: 9)] : "0"
        correctedFields["document_number"] = correctWithCheckDigit(
            docNumber,
            checkChar: docNumberCheck,
            fieldType: .documentNumber
        )
        
        correctedFields["nationality"] = correctCountryCode(String(line2.dropFirst(10).prefix(3)))
        
        let dob = String(line2.dropFirst(13).prefix(6))
        let dobCheck = line2.count > 19 ? line2[line2.index(line2.startIndex, offsetBy: 19)] : "0"
        correctedFields["date_of_birth"] = correctWithCheckDigit(
            dob,
            checkChar: dobCheck,
            fieldType: .date
        )
        
        correctedFields["sex"] = correctGender(line2.count > 20 ? line2[line2.index(line2.startIndex, offsetBy: 20)] : "<")
        
        let expiry = String(line2.dropFirst(21).prefix(6))
        let expiryCheck = line2.count > 27 ? line2[line2.index(line2.startIndex, offsetBy: 27)] : "0"
        correctedFields["expiry_date"] = correctWithCheckDigit(
            expiry,
            checkChar: expiryCheck,
            fieldType: .date
        )
        
        let personalNumber = String(line2.dropFirst(28).prefix(14))
        let personalCheck = line2.count > 42 ? line2[line2.index(line2.startIndex, offsetBy: 42)] : "<"
        correctedFields["personal_number"] = personalCheck != "<" ?
            correctWithCheckDigit(personalNumber, checkChar: personalCheck, fieldType: .mixed) :
            personalNumber
        
        // Build corrected MRZ lines
        let correctedLine1 = buildTD3Line1(correctedFields)
        let correctedLine2 = buildTD3Line2(correctedFields)
        
        // Validate checksums
        let checksumValid = validateTD3Checksums(correctedLine1, line2: correctedLine2)
        debug(message: "TD3 checksum valid: \(checksumValid)")
        
        return CorrectedMRZ(
            lines: [correctedLine1, correctedLine2],
            confidence: calculateOverallConfidence(fieldConfidences),
            checksumValid: checksumValid,
            fieldConfidences: fieldConfidences
        )
    }
    
    // MARK: - TD1 (ID Card) Processing
    
    private func processTD1Candidate(_ candidate: MRZCandidate) -> CorrectedMRZ? {
        guard candidate.lines.count >= 2 else { return nil }
        
        let line1 = candidate.lines[0]
        let line2 = candidate.lines[1]
        let line3 = candidate.lines.count > 2 ? candidate.lines[2] : String(repeating: "<", count: 30)
        
        // Validate basic format
        guard let firstChar = line1.first,
              ["I", "C", "A", "X"].contains(firstChar) else {
            debug(message: "TD1 line 1 doesn't start with valid document type")
            return nil
        }
        
        // Extract and correct fields
        var correctedFields: [String: String] = [:]
        var fieldConfidences: [String: Float] = [:]
        
        // Line 1 fields
        correctedFields["document_type"] = String(line1.prefix(2))
        correctedFields["issuing_country"] = correctCountryCode(String(line1.dropFirst(2).prefix(3)))
        
        // Preserve original lines
        correctedFields["original_line1"] = line1
        correctedFields["original_line2"] = line2
        correctedFields["original_line3"] = line3
        
        // Document number handling
        let isExtended = line1.count > 14 && line1[line1.index(line1.startIndex, offsetBy: 14)] == "<"
        correctedFields["document_number"] = isExtended ?
            String(line1.dropFirst(5).prefix(9)) + String(line1.dropFirst(15).prefix(while: { $0 != "<" })) :
            correctWithCheckDigit(
                String(line1.dropFirst(5).prefix(9)),
                checkChar: line1[line1.index(line1.startIndex, offsetBy: 14)],
                fieldType: .documentNumber
            )
        
        // Line 2 fields
        let dob = String(line2.prefix(6))
        let dobCheck = line2.count > 6 ? line2[line2.index(line2.startIndex, offsetBy: 6)] : "0"
        correctedFields["date_of_birth"] = correctWithCheckDigit(
            dob,
            checkChar: dobCheck,
            fieldType: .date
        )
        
        correctedFields["sex"] = correctGender(line2.count > 7 ? line2[line2.index(line2.startIndex, offsetBy: 7)] : "<")
        
        let expiry = String(line2.dropFirst(8).prefix(6))
        let expiryCheck = line2.count > 14 ? line2[line2.index(line2.startIndex, offsetBy: 14)] : "0"
        correctedFields["expiry_date"] = correctWithCheckDigit(
            expiry,
            checkChar: expiryCheck,
            fieldType: .date
        )
        
        correctedFields["nationality"] = correctCountryCode(String(line2.dropFirst(15).prefix(3)))
        
        // Build corrected lines
        let correctedLine1 = buildTD1Line1(correctedFields)
        let correctedLine2 = buildTD1Line2(correctedFields)
        
        // Validate checksums
        let checksumValid = validateTD1Checksums(correctedLine1, line2: correctedLine2)
        
        return CorrectedMRZ(
            lines: [correctedLine1, correctedLine2, line3],
            confidence: calculateOverallConfidence(fieldConfidences),
            checksumValid: checksumValid,
            fieldConfidences: fieldConfidences
        )
    }
    
    // MARK: - Field Correction Methods
    
    private func correctWithCheckDigit(_ value: String, checkChar: Character, fieldType: CharacterConfusionMatrix.FieldType) -> String {
        guard let checkDigit = parseCheckDigit(checkChar) else { return value }
        
        let calculatedCheckDigit = calculateCheckDigit(value)
        
        // If check digit is correct, return original
        if calculatedCheckDigit == checkDigit {
            debug(message: "Check digit valid for '\(value)': \(checkDigit)")
            return value
        }
        
        debug(message: "Check digit mismatch for '\(value)': calculated=\(calculatedCheckDigit), expected=\(checkDigit)")
        
        // Try to find valid correction
        let candidates = CharacterConfusionMatrix.generateCorrectionCandidates(
            text: value,
            fieldType: fieldType,
            maxCandidates: MRZScanConfig.maxCorrectionCandidates
        )
        
        for (candidate, _) in candidates {
            if calculateCheckDigit(candidate) == checkDigit {
                debug(message: "Found valid correction: '\(value)' -> '\(candidate)'")
                return candidate
            }
        }
        
        debug(message: "No valid correction found for '\(value)'")
        return value
    }
    
    private func correctCountryCode(_ code: String) -> String {
        // Simplified - could use a full country code list
        return code.uppercased()
    }
    
    private func correctGender(_ char: Character) -> String {
        switch char {
        case "M", "N", "H": return "M"
        case "F", "E", "P": return "F"
        default: return "<"
        }
    }
    
    // MARK: - MRZ Line Building
    
    private func buildTD3Line1(_ fields: [String: String]) -> String {
        let docType = fields["document_type"] ?? "P"
        let country = fields["issuing_country"] ?? "UTO"
        let names = fields["names"] ?? ""
        
        return "\(docType)<\(country)\(names)".padding(toLength: 44, withPad: "<", startingAt: 0)
    }
    
    private func buildTD3Line2(_ fields: [String: String]) -> String {
        let docNumber = (fields["document_number"] ?? "").padding(toLength: 9, withPad: "<", startingAt: 0)
        let docCheck = String(calculateCheckDigit(docNumber))
        let nationality = fields["nationality"] ?? "UTO"
        let dob = fields["date_of_birth"] ?? "000000"
        let dobCheck = String(calculateCheckDigit(dob))
        let sex = fields["sex"] ?? "<"
        let expiry = fields["expiry_date"] ?? "000000"
        let expiryCheck = String(calculateCheckDigit(expiry))
        let personal = (fields["personal_number"] ?? "").padding(toLength: 14, withPad: "<", startingAt: 0)
        let personalCheck = personal.allSatisfy({ $0 == "<" }) ? "<" : String(calculateCheckDigit(personal))
        
        let line2 = "\(docNumber)\(docCheck)\(nationality)\(dob)\(dobCheck)\(sex)\(expiry)\(expiryCheck)\(personal)\(personalCheck)"
        
        // Calculate overall check digit
        let overallData = "\(docNumber)\(docCheck)\(dob)\(dobCheck)\(expiry)\(expiryCheck)\(personal)\(personalCheck)"
        let overallCheck = String(calculateCheckDigit(overallData))
        
        return "\(line2)\(overallCheck)".padding(toLength: 44, withPad: "<", startingAt: 0)
    }
    
    private func buildTD1Line1(_ fields: [String: String]) -> String {
        let docType = fields["document_type"] ?? "I<"
        let country = fields["issuing_country"] ?? "UTO"
        let documentNumber = fields["document_number"] ?? ""
        
        let docNumber: String
        let docCheck: String
        
        if documentNumber.count > 9 {
            // Extended format
            docNumber = String(documentNumber.prefix(9)).padding(toLength: 9, withPad: "<", startingAt: 0) +
                       "<" +
                       String(documentNumber.dropFirst(9)).padding(toLength: 15, withPad: "<", startingAt: 0)
            docCheck = ""
        } else {
            docNumber = documentNumber.padding(toLength: 9, withPad: "<", startingAt: 0)
            docCheck = String(calculateCheckDigit(docNumber))
        }
        
        let optional = (fields["original_line1"]?.count ?? 0) >= 30 ?
            String(fields["original_line1"]!.dropFirst(15)) :
            String(repeating: "<", count: 15)
        
        return "\(docType)\(country)\(docNumber)\(docCheck)\(optional)".prefix(30).padding(toLength: 30, withPad: "<", startingAt: 0)
    }
    
    private func buildTD1Line2(_ fields: [String: String]) -> String {
        let dob = fields["date_of_birth"] ?? "000000"
        let dobCheck = String(calculateCheckDigit(dob))
        let sex = fields["sex"] ?? "<"
        let expiry = fields["expiry_date"] ?? "000000"
        let expiryCheck = String(calculateCheckDigit(expiry))
        let nationality = fields["nationality"] ?? "UTO"
        
        let optional = (fields["original_line2"]?.count ?? 0) >= 29 ?
            String(fields["original_line2"]!.dropFirst(18).prefix(11)) :
            String(repeating: "<", count: 11)
        
        // Composite check digit calculation
        let docNumberPart = (fields["document_number"] ?? "").prefix(9).padding(toLength: 9, withPad: "<", startingAt: 0) +
                           String(calculateCheckDigit(String((fields["document_number"] ?? "").prefix(9))))
        let compositeData = docNumberPart + dob + dobCheck + expiry + expiryCheck + optional
        let compositeCheck = String(calculateCheckDigit(compositeData))
        
        return "\(dob)\(dobCheck)\(sex)\(expiry)\(expiryCheck)\(nationality)\(optional)\(compositeCheck)".prefix(30).padding(toLength: 30, withPad: "<", startingAt: 0)
    }
    
    // MARK: - Checksum Validation
    
    private func validateTD3Checksums(_ line1: String, line2: String) -> Bool {
        guard line1.count == 44, line2.count == 44 else { return false }
        
        // Validate individual check digits
        let docNumber = String(line2.prefix(9))
        guard let docCheck = parseCheckDigit(line2[line2.index(line2.startIndex, offsetBy: 9)]),
              calculateCheckDigit(docNumber) == docCheck else { return false }
        
        let dob = String(line2.dropFirst(13).prefix(6))
        guard let dobCheck = parseCheckDigit(line2[line2.index(line2.startIndex, offsetBy: 19)]),
              calculateCheckDigit(dob) == dobCheck else { return false }
        
        let expiry = String(line2.dropFirst(21).prefix(6))
        guard let expiryCheck = parseCheckDigit(line2[line2.index(line2.startIndex, offsetBy: 27)]),
              calculateCheckDigit(expiry) == expiryCheck else { return false }
        
        return true
    }
    
    private func validateTD1Checksums(_ line1: String, line2: String) -> Bool {
        guard line1.count == 30, line2.count == 30 else { return false }
        
        // Check if extended document number
        let isExtended = line1[line1.index(line1.startIndex, offsetBy: 14)] == "<"
        
        if !isExtended {
            // Validate document number check digit
            let docNumber = String(line1.dropFirst(5).prefix(9))
            guard let docCheck = parseCheckDigit(line1[line1.index(line1.startIndex, offsetBy: 14)]),
                  calculateCheckDigit(docNumber) == docCheck else { return false }
        }
        
        // Validate date of birth
        let dob = String(line2.prefix(6))
        guard let dobCheck = parseCheckDigit(line2[line2.index(line2.startIndex, offsetBy: 6)]),
              calculateCheckDigit(dob) == dobCheck else { return false }
        
        // Validate expiry date
        let expiry = String(line2.dropFirst(8).prefix(6))
        guard let expiryCheck = parseCheckDigit(line2[line2.index(line2.startIndex, offsetBy: 14)]),
              calculateCheckDigit(expiry) == expiryCheck else { return false }
        
        return true
    }
    
    // MARK: - Utility Methods
    
    private func parseCheckDigit(_ char: Character) -> Int? {
        switch char {
        case "0"..."9": return Int(String(char))
        case "O": return 0
        case "<": return 0
        default: return nil
        }
    }
    
    private func calculateCheckDigit(_ value: String) -> Int {
        let weights = [7, 3, 1]
        let charValues: [Character: Int] = [
            "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
            "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
            "<": 0,
            "A": 10, "B": 11, "C": 12, "D": 13, "E": 14,
            "F": 15, "G": 16, "H": 17, "I": 18, "J": 19,
            "K": 20, "L": 21, "M": 22, "N": 23, "O": 24,
            "P": 25, "Q": 26, "R": 27, "S": 28, "T": 29,
            "U": 30, "V": 31, "W": 32, "X": 33, "Y": 34, "Z": 35
        ]
        
        var sum = 0
        for (index, char) in value.enumerated() {
            let charValue = charValues[char] ?? 0
            sum += charValue * weights[index % 3]
        }
        
        return sum % 10
    }
    
    private func calculateOverallConfidence(_ fieldConfidences: [String: Float]) -> Float {
        guard !fieldConfidences.isEmpty else { return 0.5 }
        let sum = fieldConfidences.values.reduce(0, +)
        return sum / Float(fieldConfidences.count)
    }
}
