/*
 Utilities for dealing with recognized strings
 */

import Foundation
import MRZParser

var captureFirst = ""
var captureSecond = ""
var captureThird = ""
var mrz = ""
var temp_mrz = ""

let parser = MRZParser(isOCRCorrectionEnabled: true)

let debug = false

func debug(message: String) {
    if debug {
        print(message)
    }
}

extension String {

    // Get check digit using the same algorithm as in TypeScript version
    func getCheckDigit(for value: String) -> Int {
        let multipliers = [7, 3, 1]
        let charMap: [Character: Int] = [
            "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
            "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
            "<": 0, " ": 0,
            "A": 10, "B": 11, "C": 12, "D": 13, "E": 14,
            "F": 15, "G": 16, "H": 17, "I": 18, "J": 19,
            "K": 20, "L": 21, "M": 22, "N": 23, "O": 24,
            "P": 25, "Q": 26, "R": 27, "S": 28, "T": 29,
            "U": 30, "V": 31, "W": 32, "X": 33, "Y": 34, "Z": 35
        ]
        
        var sum = 0
        for (i, char) in value.enumerated() {
            if let value = charMap[char] {
                sum += value * multipliers[i % 3]
            }
        }
        return sum % 10
    }
    
    // Verify checksum matches expected value
    func verifyChecksum(value: String, checkDigit: Int) -> Bool {
        return getCheckDigit(for: value) == checkDigit
    }
    
    // Attempt to correct O/0 confusion in a TD3 passport MRZ
    func correctTD3MRZ(mrzString: String) -> String? {
        let formattedMrz = mrzString.replacingOccurrences(of: "\n", with: "")
        
        debug(message: "TD3 correction attempt for MRZ: '\(formattedMrz)'")
        debug(message: "First char: '\(formattedMrz.first ?? Character(" "))', Length: \(formattedMrz.count)")
        
        if formattedMrz.first == "P" && formattedMrz.count == 88 {
            var correctedMrz = formattedMrz
            
            // Helper function to parse check digit with O/0 correction
            func parseCheckDigit(_ char: Character) -> Int? {
                if let digit = Int(String(char)) {
                    return digit
                } else if char == "O" {
                    return 0  // Convert O to 0
                } else {
                    return nil
                }
            }
            
            // Document number correction (position 44-52, with check digit at 53)
            let docNumberRange = 44..<53
            let docNumber = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: docNumberRange.lowerBound)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: docNumberRange.upperBound)])
            let docCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 53)]
            let docCheckDigit = parseCheckDigit(docCheckChar)
            
            debug(message: "Document number: '\(docNumber)', Check char: '\(docCheckChar)', Check digit: \(docCheckDigit?.description ?? "nil")")
            
            // Date of birth correction (position 57-62, with check digit at 63)
            let dobRange = 57..<63
            let dob = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: dobRange.lowerBound)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: dobRange.upperBound)])
            let dobCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 63)]
            let dobCheckDigit = parseCheckDigit(dobCheckChar)
            
            debug(message: "Date of birth: '\(dob)', Check char: '\(dobCheckChar)', Check digit: \(dobCheckDigit?.description ?? "nil")")
            
            // Date of expiry correction (position 65-70, with check digit at 71)
            let doeRange = 65..<71
            let doe = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: doeRange.lowerBound)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: doeRange.upperBound)])
            let doeCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 71)]
            let doeCheckDigit = parseCheckDigit(doeCheckChar)
            
            debug(message: "Date of expiry: '\(doe)', Check char: '\(doeCheckChar)', Check digit: \(doeCheckDigit?.description ?? "nil")")
            
            // Personal number correction (position 72-85, with check digit at 86)
            let personalNumberRange = 72..<86
            let personalNumber = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: personalNumberRange.lowerBound)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: personalNumberRange.upperBound)])
            let personalCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 86)]
            let personalCheckDigit = parseCheckDigit(personalCheckChar)
            
            // Check if personal number should be skipped (empty or check digit is <)
            let shouldSkipPersonal = personalCheckChar == "<" || personalNumber.allSatisfy { $0 == "<" }
            
            if shouldSkipPersonal {
                debug(message: "Personal number: '\(personalNumber)', Check char: '\(personalCheckChar)' - SKIPPED (empty or < check digit)")
            } else {
                debug(message: "Personal number: '\(personalNumber)', Check char: '\(personalCheckChar)', Check digit: \(personalCheckDigit?.description ?? "nil")")
            }
            
            // Overall check digit at position 87
            let overallCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 87)]
            let overallCheckDigit = parseCheckDigit(overallCheckChar)
            
            debug(message: "Overall check char: '\(overallCheckChar)', Check digit: \(overallCheckDigit?.description ?? "nil")")
            
            // Only proceed with correction if we have valid check digits
            if let docCD = docCheckDigit, let dobCD = dobCheckDigit, let doeCD = doeCheckDigit,
               let overallCD = overallCheckDigit {
                
                // Personal number is optional - only validate if not skipped
                let personalCD = shouldSkipPersonal ? nil : personalCheckDigit
                
                debug(message: "All required check digits parsed successfully, proceeding with comprehensive corrections...")
                
                // Helper function to get all valid O/0 combinations for a field
                func getAllValidCombinations(value: String, checkDigit: Int) -> [String] {
                    var validCombinations: [String] = []
                    
                    debug(message: "=== getAllValidCombinations for '\(value)' with checkDigit \(checkDigit) ===")
                    
                    // Find all positions with O/0, 1/I, B/8, S/5, and Z/2 confusions
                    var confusablePositions: [(Int, String)] = [] // (position, confusionType)
                    for (i, char) in value.enumerated() {
                        if char == "O" || char == "0" {
                            confusablePositions.append((i, "O0"))
                        } else if char == "1" || char == "I" {
                            confusablePositions.append((i, "1I"))
                        } else if char == "B" || char == "8" {
                            confusablePositions.append((i, "B8"))
                        } else if char == "S" || char == "5" {
                            confusablePositions.append((i, "S5"))
                        } else if char == "Z" || char == "2" {
                            confusablePositions.append((i, "Z2"))
                        }
                    }
                    
                    debug(message: "Confusable positions: \(confusablePositions)")
                    
                    if confusablePositions.isEmpty {
                        // No confusable characters, but check if original is valid
                        let calculatedCheck = getCheckDigit(for: value)
                        let isValid = verifyChecksum(value: value, checkDigit: checkDigit)
                        debug(message: "No confusable chars. Original '\(value)' -> calculated: \(calculatedCheck), expected: \(checkDigit), valid: \(isValid)")
                        if isValid {
                            validCombinations.append(value)
                        }
                        return validCombinations
                    }
                    
                    // Try all possible combinations (2^n where n is number of confusable positions)
                    let numCombinations = 1 << confusablePositions.count
                    debug(message: "Testing \(numCombinations) combinations...")
                    
                    for combination in 0..<numCombinations {
                        var corrected = Array(value)
                        
                        // Apply the combination
                        for (bitIndex, (charIndex, confusionType)) in confusablePositions.enumerated() {
                            let shouldFlip = (combination & (1 << bitIndex)) != 0
                            if shouldFlip {
                                let currentChar = corrected[charIndex]
                                if confusionType == "O0" {
                                    corrected[charIndex] = currentChar == "O" ? "0" : "O"
                                } else if confusionType == "1I" {
                                    corrected[charIndex] = currentChar == "1" ? "I" : "1"
                                } else if confusionType == "B8" {
                                    corrected[charIndex] = currentChar == "B" ? "8" : "B"
                                } else if confusionType == "S5" {
                                    corrected[charIndex] = currentChar == "S" ? "5" : "S"
                                } else if confusionType == "Z2" {
                                    corrected[charIndex] = currentChar == "Z" ? "2" : "Z"
                                }
                            }
                        }
                        
                        let correctedString = String(corrected)
                        let calculatedCheck = getCheckDigit(for: correctedString)
                        let isValid = verifyChecksum(value: correctedString, checkDigit: checkDigit)
                        
                        debug(message: "  Combination \(combination): '\(correctedString)' -> calculated: \(calculatedCheck), expected: \(checkDigit), valid: \(isValid)")
                        
                        if isValid {
                            validCombinations.append(correctedString)
                            debug(message: "    ✅ Added to valid combinations")
                        } else {
                            debug(message: "    ❌ Invalid checksum, skipped")
                        }
                    }
                    
                    debug(message: "Final valid combinations: \(validCombinations)")
                    debug(message: "=== End getAllValidCombinations ===")
                    
                    // Sort valid combinations by number of 0s, 1s, 8s, 5s, and 2s (descending) - prioritize more digits
                    validCombinations.sort { combination1, combination2 in
                        let zeros1 = combination1.filter { $0 == "0" }.count
                        let zeros2 = combination2.filter { $0 == "0" }.count
                        let ones1 = combination1.filter { $0 == "1" }.count
                        let ones2 = combination2.filter { $0 == "1" }.count
                        let eights1 = combination1.filter { $0 == "8" }.count
                        let eights2 = combination2.filter { $0 == "8" }.count
                        let fives1 = combination1.filter { $0 == "5" }.count
                        let fives2 = combination2.filter { $0 == "5" }.count
                        let twos1 = combination1.filter { $0 == "2" }.count
                        let twos2 = combination2.filter { $0 == "2" }.count
                        
                        // First prioritize by 0s, then by 1s, then by 8s, then by 5s, then by 2s
                        if zeros1 != zeros2 {
                            return zeros1 > zeros2
                        } else if ones1 != ones2 {
                            return ones1 > ones2
                        } else if eights1 != eights2 {
                            return eights1 > eights2
                        } else if fives1 != fives2 {
                            return fives1 > fives2
                        } else {
                            return twos1 > twos2
                        }
                    }
                    
                    return validCombinations
                }
                
                // Helper function for date fields - only convert O to 0 (dates contain only digits)
                func getValidDateCombination(value: String, checkDigit: Int) -> [String] {
                    // For dates, simply convert all O's to 0's and check if valid
                    let correctedValue = value.replacingOccurrences(of: "O", with: "0")
                    
                    if verifyChecksum(value: correctedValue, checkDigit: checkDigit) {
                        debug(message: "Date field corrected: '\(value)' -> '\(correctedValue)'")
                        return [correctedValue]
                    } else {
                        debug(message: "Date field correction failed: '\(value)' -> '\(correctedValue)' (invalid checksum)")
                        return []
                    }
                }
                
                // Get all valid combinations for each field
                let docCombinations = getAllValidCombinations(value: docNumber, checkDigit: docCD)
                let dobCombinations = getValidDateCombination(value: dob, checkDigit: dobCD)
                let doeCombinations = getValidDateCombination(value: doe, checkDigit: doeCD)
                let personalCombinations = shouldSkipPersonal ? [personalNumber] : (personalCD != nil ? getAllValidCombinations(value: personalNumber, checkDigit: personalCD!) : [personalNumber])
                
                debug(message: "Valid document number combinations: \(docCombinations)")
                debug(message: "Valid DOB combinations: \(dobCombinations)")
                debug(message: "Valid DOE combinations: \(doeCombinations)")
                if shouldSkipPersonal {
                    debug(message: "Personal number combinations: SKIPPED")
                } else {
                    debug(message: "Valid personal number combinations: \(personalCombinations)")
                }
                
                // Try all combinations of valid field corrections and test overall checksum
                for docCandidate in docCombinations {
                    for dobCandidate in dobCombinations {
                        for doeCandidate in doeCombinations {
                            for personalCandidate in personalCombinations {
                                // Build test MRZ with this combination
                                var testMrz = correctedMrz
                                
                                // Apply document number
                                let docStartIndex = testMrz.index(testMrz.startIndex, offsetBy: docNumberRange.lowerBound)
                                let docEndIndex = testMrz.index(testMrz.startIndex, offsetBy: docNumberRange.upperBound)
                                testMrz.replaceSubrange(docStartIndex..<docEndIndex, with: docCandidate)
                                
                                // Apply DOB
                                let dobStartIndex = testMrz.index(testMrz.startIndex, offsetBy: dobRange.lowerBound)
                                let dobEndIndex = testMrz.index(testMrz.startIndex, offsetBy: dobRange.upperBound)
                                testMrz.replaceSubrange(dobStartIndex..<dobEndIndex, with: dobCandidate)
                                
                                // Apply DOE
                                let doeStartIndex = testMrz.index(testMrz.startIndex, offsetBy: doeRange.lowerBound)
                                let doeEndIndex = testMrz.index(testMrz.startIndex, offsetBy: doeRange.upperBound)
                                testMrz.replaceSubrange(doeStartIndex..<doeEndIndex, with: doeCandidate)
                                
                                // Apply personal number
                                let personalStartIndex = testMrz.index(testMrz.startIndex, offsetBy: personalNumberRange.lowerBound)
                                let personalEndIndex = testMrz.index(testMrz.startIndex, offsetBy: personalNumberRange.upperBound)
                                testMrz.replaceSubrange(personalStartIndex..<personalEndIndex, with: personalCandidate)
                                
                                // Also correct check digit characters (O -> 0) in test MRZ
                                var testMrzChars = Array(testMrz)
                                if docCheckChar == "O" { testMrzChars[53] = "0" }
                                if dobCheckChar == "O" { testMrzChars[63] = "0" }
                                if doeCheckChar == "O" { testMrzChars[71] = "0" }
                                if personalCheckChar == "O" { testMrzChars[86] = "0" }
                                if overallCheckChar == "O" { testMrzChars[87] = "0" }
                                testMrz = String(testMrzChars)
                                
                                // Calculate overall checksum correctly
                                // Overall checksum = doc+check + dob+check + doe+check + personal+check
                                let docWithCheck = String(testMrz[testMrz.index(testMrz.startIndex, offsetBy: 44)..<testMrz.index(testMrz.startIndex, offsetBy: 54)]) // positions 44-53 (10 chars)
                                let dobWithCheck = String(testMrz[testMrz.index(testMrz.startIndex, offsetBy: 57)..<testMrz.index(testMrz.startIndex, offsetBy: 64)]) // positions 57-63 (7 chars)
                                let doeWithCheck = String(testMrz[testMrz.index(testMrz.startIndex, offsetBy: 65)..<testMrz.index(testMrz.startIndex, offsetBy: 72)]) // positions 65-71 (7 chars)
                                let personalWithCheck = String(testMrz[testMrz.index(testMrz.startIndex, offsetBy: 72)..<testMrz.index(testMrz.startIndex, offsetBy: 87)]) // positions 72-86 (15 chars)
                                
                                let overallChecksumData = docWithCheck + dobWithCheck + doeWithCheck + personalWithCheck
                                let calculatedOverallCheck = getCheckDigit(for: overallChecksumData)
                                
                                debug(message: "Testing combination:")
                                debug(message: "  Doc: '\(docNumber)' -> '\(docCandidate)'")
                                debug(message: "  DOB: '\(dob)' -> '\(dobCandidate)'")
                                debug(message: "  DOE: '\(doe)' -> '\(doeCandidate)'")
                                debug(message: "  Personal number: '\(personalNumber)' -> '\(personalCandidate)'")
                                debug(message: "  Overall checksum data: '\(overallChecksumData)'")
                                debug(message: "  Calculated overall check: \(calculatedOverallCheck), Expected: \(overallCD)")

                                if calculatedOverallCheck == overallCD {
                                    debug(message: "✅ Found valid combination with correct overall checksum!")
                                    
                                    // Final validation before returning
                                    let finalMrz = testMrz.prefix(44) + "\n" + testMrz.suffix(44)
                                  if validateFinalMRZ(String(finalMrz)) {
                                        debug(message: "✅ Final MRZ validation passed")
                                        return String(finalMrz)
                                    } else {
                                        debug(message: "❌ Final MRZ validation failed, continuing search...")
                                    }
                                } else {
                                    debug(message: "❌ Overall checksum mismatch, trying next combination...")
                                }
                            }
                        }
                    }
                }
                
                debug(message: "❌ No combination of valid field corrections produces a valid overall checksum")
            } else {
                debug(message: "Failed to parse one or more check digits - skipping correction")
            }
        } else {
            debug(message: "TD3 format validation failed")
        }
        
        return nil
    }
    
    // Final validation function for TD3 MRZ
    func validateFinalMRZ(_ mrzString: String) -> Bool {
        let formattedMrz = mrzString.replacingOccurrences(of: "\n", with: "")
        
        guard formattedMrz.first == "P" && formattedMrz.count == 88 else {
            debug(message: "❌ Invalid MRZ format for final validation")
            return false
        }
        
        // Helper function to parse check digit
        func parseCheckDigit(_ char: Character) -> Int? {
            if let digit = Int(String(char)) {
                return digit
            } else if char == "O" {
                return 0
            } else {
                return nil
            }
        }
        
        // Extract and validate document number
        let docNumber = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 44)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 53)])
        let docCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 53)]
        guard let docCheckDigit = parseCheckDigit(docCheckChar) else {
            debug(message: "❌ Invalid document number check digit")
            return false
        }
        
        if !verifyChecksum(value: docNumber, checkDigit: docCheckDigit) {
            debug(message: "❌ Document number checksum validation failed")
            return false
        }
        
        // Extract and validate date of birth
        let dob = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 57)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 63)])
        let dobCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 63)]
        guard let dobCheckDigit = parseCheckDigit(dobCheckChar) else {
            debug(message: "❌ Invalid DOB check digit")
            return false
        }
        
        if !verifyChecksum(value: dob, checkDigit: dobCheckDigit) {
            debug(message: "❌ DOB checksum validation failed")
            return false
        }
        
        // Extract and validate date of expiry
        let doe = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 65)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 71)])
        let doeCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 71)]
        guard let doeCheckDigit = parseCheckDigit(doeCheckChar) else {
            debug(message: "❌ Invalid DOE check digit")
            return false
        }
        
        if !verifyChecksum(value: doe, checkDigit: doeCheckDigit) {
            debug(message: "❌ DOE checksum validation failed")
            return false
        }
        
        // Extract and validate personal number
        let personalNumber = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 72)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 86)])
        let personalCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 86)]
        
        // Check if personal number should be skipped (empty or check digit is <)
        let shouldSkipPersonalValidation = personalCheckChar == "<" || personalNumber.allSatisfy { $0 == "<" }
        
        if !shouldSkipPersonalValidation {
            guard let personalCheckDigit = parseCheckDigit(personalCheckChar) else {
                debug(message: "❌ Invalid personal number check digit")
                return false
            }
            
            if !verifyChecksum(value: personalNumber, checkDigit: personalCheckDigit) {
                debug(message: "❌ Personal number checksum validation failed")
                return false
            }
        } else {
            debug(message: "Personal number validation skipped (empty or < check digit)")
        }
        
        // Validate overall checksum
        let overallCheckChar = formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 87)]
        guard let overallCheckDigit = parseCheckDigit(overallCheckChar) else {
            debug(message: "❌ Invalid overall check digit")
            return false
        }
        
        let docWithCheck = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 44)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 54)])
        let dobWithCheck = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 57)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 64)])
        let doeWithCheck = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 65)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 72)])
        let personalWithCheck = String(formattedMrz[formattedMrz.index(formattedMrz.startIndex, offsetBy: 72)..<formattedMrz.index(formattedMrz.startIndex, offsetBy: 87)])
        
        let overallChecksumData = docWithCheck + dobWithCheck + doeWithCheck + personalWithCheck
        let calculatedOverallCheck = getCheckDigit(for: overallChecksumData)
        
        if calculatedOverallCheck != overallCheckDigit {
            debug(message: "❌ Overall checksum validation failed: calculated \(calculatedOverallCheck), expected \(overallCheckDigit)")
            return false
        }
        
        debug(message: "✅ All checksums validated successfully")
        return true
    }
    
    // Attempt to correct O/0 confusion in a TD1 ID card MRZ
    func correctTD1MRZ(mrzString: String) -> String? {
        let lines = mrzString.components(separatedBy: "\n")
        
        debug(message: "TD1 correction attempt for MRZ lines: \(lines.count)")
        for (i, line) in lines.enumerated() {
            debug(message: "Line \(i): '\(line)' (length: \(line.count))")
        }
        
        if lines.count == 3 && lines[0].count == 30 && lines[1].count == 30 && lines[2].count == 30 {
            
            // Helper function to parse check digit with O/0 correction
            func parseCheckDigit(_ char: Character) -> Int? {
                if let digit = Int(String(char)) {
                    return digit
                } else if char == "O" {
                    return 0  // Convert O to 0
                } else {
                    return nil
                }
            }
            
            // Helper function to get all valid O/0 and 1/I combinations for a field
            func getAllValidCombinations(value: String, checkDigit: Int) -> [String] {
                var validCombinations: [String] = []
                
                debug(message: "=== TD1 getAllValidCombinations for '\(value)' with checkDigit \(checkDigit) ===")
                
                // Find all positions with O/0, 1/I, B/8, S/5, and Z/2 confusions
                var confusablePositions: [(Int, String)] = [] // (position, confusionType)
                for (i, char) in value.enumerated() {
                    if char == "O" || char == "0" {
                        confusablePositions.append((i, "O0"))
                    } else if char == "1" || char == "I" {
                        confusablePositions.append((i, "1I"))
                    } else if char == "B" || char == "8" {
                        confusablePositions.append((i, "B8"))
                    } else if char == "S" || char == "5" {
                        confusablePositions.append((i, "S5"))
                    } else if char == "Z" || char == "2" {
                        confusablePositions.append((i, "Z2"))
                    }
                }
                
                debug(message: "Confusable positions: \(confusablePositions)")
                
                if confusablePositions.isEmpty {
                    // No confusable characters, but check if original is valid
                    let calculatedCheck = getCheckDigit(for: value)
                    let isValid = verifyChecksum(value: value, checkDigit: checkDigit)
                    debug(message: "No confusable chars. Original '\(value)' -> calculated: \(calculatedCheck), expected: \(checkDigit), valid: \(isValid)")
                    if isValid {
                        validCombinations.append(value)
                    }
                    return validCombinations
                }
                
                // Try all possible combinations (2^n where n is number of confusable positions)
                let numCombinations = 1 << confusablePositions.count
                debug(message: "Testing \(numCombinations) combinations...")
                
                for combination in 0..<numCombinations {
                    var corrected = Array(value)
                    
                    // Apply the combination
                    for (bitIndex, (charIndex, confusionType)) in confusablePositions.enumerated() {
                        let shouldFlip = (combination & (1 << bitIndex)) != 0
                        if shouldFlip {
                            let currentChar = corrected[charIndex]
                            if confusionType == "O0" {
                                corrected[charIndex] = currentChar == "O" ? "0" : "O"
                            } else if confusionType == "1I" {
                                corrected[charIndex] = currentChar == "1" ? "I" : "1"
                            } else if confusionType == "B8" {
                                corrected[charIndex] = currentChar == "B" ? "8" : "B"
                            } else if confusionType == "S5" {
                                corrected[charIndex] = currentChar == "S" ? "5" : "S"
                            } else if confusionType == "Z2" {
                                corrected[charIndex] = currentChar == "Z" ? "2" : "Z"
                            }
                        }
                    }
                    
                    let correctedString = String(corrected)
                    let calculatedCheck = getCheckDigit(for: correctedString)
                    let isValid = verifyChecksum(value: correctedString, checkDigit: checkDigit)
                    
                    debug(message: "  Combination \(combination): '\(correctedString)' -> calculated: \(calculatedCheck), expected: \(checkDigit), valid: \(isValid)")
                    
                    if isValid {
                        validCombinations.append(correctedString)
                        debug(message: "    ✅ Added to valid combinations")
                    } else {
                        debug(message: "    ❌ Invalid checksum, skipped")
                    }
                }
                
                debug(message: "Final valid combinations: \(validCombinations)")
                debug(message: "=== End TD1 getAllValidCombinations ===")
                
                // Sort valid combinations by number of 0s, 1s, 8s, 5s, and 2s (descending) - prioritize more digits
                validCombinations.sort { combination1, combination2 in
                    let zeros1 = combination1.filter { $0 == "0" }.count
                    let zeros2 = combination2.filter { $0 == "0" }.count
                    let ones1 = combination1.filter { $0 == "1" }.count
                    let ones2 = combination2.filter { $0 == "1" }.count
                    let eights1 = combination1.filter { $0 == "8" }.count
                    let eights2 = combination2.filter { $0 == "8" }.count
                    let fives1 = combination1.filter { $0 == "5" }.count
                    let fives2 = combination2.filter { $0 == "5" }.count
                    let twos1 = combination1.filter { $0 == "2" }.count
                    let twos2 = combination2.filter { $0 == "2" }.count
                    
                    // First prioritize by 0s, then by 1s, then by 8s, then by 5s, then by 2s
                    if zeros1 != zeros2 {
                        return zeros1 > zeros2
                    } else if ones1 != ones2 {
                        return ones1 > ones2
                    } else if eights1 != eights2 {
                        return eights1 > eights2
                    } else if fives1 != fives2 {
                        return fives1 > fives2
                    } else {
                        return twos1 > twos2
                    }
                }
                
                return validCombinations
            }
            
            // Helper function for date fields - only convert O to 0 (dates contain only digits)
            func getValidDateCombination(value: String, checkDigit: Int) -> [String] {
                // For dates, simply convert all O's to 0's and check if valid
                let correctedValue = value.replacingOccurrences(of: "O", with: "0")
                
                if verifyChecksum(value: correctedValue, checkDigit: checkDigit) {
                    debug(message: "Date field corrected: '\(value)' -> '\(correctedValue)'")
                    return [correctedValue]
                } else {
                    debug(message: "Date field correction failed: '\(value)' -> '\(correctedValue)' (invalid checksum)")
                    return []
                }
            }
            
            // Extract and analyze document number (complex logic for extended document numbers)
            var docCombinations: [String] = []
            var docCheckDigit: Int?
            var fullDocNumber: String = ""
            
            // Check if extended document number (< at index 14)
            let isExtendedDoc = lines[0].at(index: 14) == "<"
            
            if isExtendedDoc {
                debug(message: "Extended document number detected")
                // Extended: 5-13 + 15-27, find last digit for check digit
                let docPart1 = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 5)..<lines[0].index(lines[0].startIndex, offsetBy: 14)]) // 5-13
                let docPart2 = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 15)..<lines[0].index(lines[0].startIndex, offsetBy: 28)]) // 15-27
                
                // Find the last digit in the extended part for check digit
                var checkDigitIndex = -1
                for i in (15...28).reversed() {
                    if let char = lines[0].at(index: i), char != "<" {
                        if let digit = parseCheckDigit(char) {
                            checkDigitIndex = i
                            docCheckDigit = digit
                            break
                        }
                    }
                }
                
                if checkDigitIndex > 15 {
                    // Document number is everything except the check digit
                    let docPart2WithoutCheck = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 15)..<lines[0].index(lines[0].startIndex, offsetBy: checkDigitIndex)])
                    fullDocNumber = docPart1 + docPart2WithoutCheck.replacingOccurrences(of: "<", with: "")
                    debug(message: "Extended doc number: '\(fullDocNumber)', Check digit at index \(checkDigitIndex): \(docCheckDigit!)")
                } else {
                    debug(message: "Could not find valid check digit in extended document number")
                    return nil
                }
            } else {
                debug(message: "Standard document number detected")
                // Standard: 5-13 with check digit at 14
                fullDocNumber = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 5)..<lines[0].index(lines[0].startIndex, offsetBy: 14)])
                if let checkDigitChar = lines[0].at(index: 14) {
                    docCheckDigit = parseCheckDigit(checkDigitChar)
                  debug(message: "Standard doc number: '\(fullDocNumber)', Check digit: \(docCheckDigit ?? -1)")
                }
            }
            
            if let docCD = docCheckDigit {
                docCombinations = getAllValidCombinations(value: fullDocNumber, checkDigit: docCD)
            }
            
            // Extract date of birth (line 1, position 0-5, with check digit at 6)
            var dobCombinations: [String] = []
            let dob = String(lines[1].prefix(6))
            if let dobCheckChar = lines[1].at(index: 6) {
                let dobCheckDigit = parseCheckDigit(dobCheckChar)
                debug(message: "Date of birth: '\(dob)', Check char: '\(dobCheckChar)', Check digit: \(dobCheckDigit?.description ?? "nil")")
                
                if let dobCD = dobCheckDigit {
                    dobCombinations = getValidDateCombination(value: dob, checkDigit: dobCD)
                }
            }
            
            // Extract date of expiry (line 1, position 8-13, with check digit at 14)
            var doeCombinations: [String] = []
            let doe = String(lines[1][lines[1].index(lines[1].startIndex, offsetBy: 8)..<lines[1].index(lines[1].startIndex, offsetBy: 14)])
            if let doeCheckChar = lines[1].at(index: 14) {
                let doeCheckDigit = parseCheckDigit(doeCheckChar)
                debug(message: "Date of expiry: '\(doe)', Check char: '\(doeCheckChar)', Check digit: \(doeCheckDigit?.description ?? "nil")")
                
                if let doeCD = doeCheckDigit {
                    doeCombinations = getValidDateCombination(value: doe, checkDigit: doeCD)
                }
            }
            
            // Get composite checksum digit (last character of line 1)
            guard let compositeCheckChar = lines[1].at(index: 29),
                  let compositeCheckDigit = parseCheckDigit(compositeCheckChar) else {
                debug(message: "Could not parse composite check digit")
                return nil
            }
            
            debug(message: "Composite check char: '\(compositeCheckChar)', Check digit: \(compositeCheckDigit)")
            
            // Check if we have valid combinations for all fields
            if !docCombinations.isEmpty && !dobCombinations.isEmpty && !doeCombinations.isEmpty {
                debug(message: "Valid document number combinations: \(docCombinations)")
                debug(message: "Valid DOB combinations: \(dobCombinations)")
                debug(message: "Valid DOE combinations: \(doeCombinations)")
                
                // Try all combinations and validate composite checksum
                for docCandidate in docCombinations {
                    for dobCandidate in dobCombinations {
                        for doeCandidate in doeCombinations {
                            // Build test lines with this combination
                            var testLines = lines
                            
                            // Apply document number correction based on type
                            if isExtendedDoc {
                                // For extended doc, we need to reconstruct the full field
                                var line0Chars = Array(testLines[0])
                                // Clear the extended part first
                                for i in 15..<28 {
                                    line0Chars[i] = "<"
                                }
                                // Apply the corrected document number
                                let docPart1 = String(docCandidate.prefix(9)) // First 9 chars go to 5-13
                                for (i, char) in docPart1.enumerated() {
                                    line0Chars[5 + i] = char
                                }
                                // Remaining chars go to extended part
                                if docCandidate.count > 9 {
                                    let docPart2 = String(docCandidate.dropFirst(9))
                                    for (i, char) in docPart2.enumerated() {
                                        if 15 + i < 28 {
                                            line0Chars[15 + i] = char
                                        }
                                    }
                                }
                                
                                // Find where to place the check digit (find the last non-< position in 15-28)
                                var checkDigitPosition = -1
                                for i in (15...28).reversed() {
                                    if line0Chars[i] != "<" {
                                        checkDigitPosition = i + 1
                                        break
                                    }
                                }
                                
                                // Place the check digit in the correct position
                                if checkDigitPosition > 15 && checkDigitPosition <= 28 {
                                    line0Chars[checkDigitPosition] = Character(String(docCheckDigit!))
                                }
                                
                                testLines[0] = String(line0Chars)
                            } else {
                                // Standard document number
                                var line0Chars = Array(testLines[0])
                                for (i, char) in docCandidate.enumerated() {
                                    if 5 + i < 14 {
                                        line0Chars[5 + i] = char
                                    }
                                }
                                testLines[0] = String(line0Chars)
                            }
                            
                            // Apply DOB to line 1
                            var line1Chars = Array(testLines[1])
                            for (i, char) in dobCandidate.enumerated() {
                                line1Chars[i] = char
                            }
                            
                            // Apply DOE to line 1
                            for (i, char) in doeCandidate.enumerated() {
                                line1Chars[8 + i] = char
                            }
                            testLines[1] = String(line1Chars)
                            
                            // Calculate composite checksum
                            // Line 0: indices 5-29 (inclusive)
                            let line0Part = String(testLines[0][testLines[0].index(testLines[0].startIndex, offsetBy: 5)..<testLines[0].index(testLines[0].startIndex, offsetBy: 30)])
                            // Line 1: DOB (0-6), DOE (8-14), indices 18-28 (but not 7, 15-17)
                            let dobWithCheck = String(testLines[1].prefix(7)) // 0-6
                            let doeWithCheck = String(testLines[1][testLines[1].index(testLines[1].startIndex, offsetBy: 8)..<testLines[1].index(testLines[1].startIndex, offsetBy: 15)]) // 8-14
                            let line1Part = String(testLines[1][testLines[1].index(testLines[1].startIndex, offsetBy: 18)..<testLines[1].index(testLines[1].startIndex, offsetBy: 29)]) // 18-28
                            
                            let compositeData = line0Part + dobWithCheck + doeWithCheck + line1Part
                            let calculatedComposite = getCheckDigit(for: compositeData)
                            
                            debug(message: "Testing TD1 combination:")
                            debug(message: "  Doc: '\(fullDocNumber)' -> '\(docCandidate)'")
                            debug(message: "  DOB: '\(dob)' -> '\(dobCandidate)'")
                            debug(message: "  DOE: '\(doe)' -> '\(doeCandidate)'")
                            debug(message: "  Composite data: '\(compositeData)'")
                            debug(message: "  Calculated composite: \(calculatedComposite), Expected: \(compositeCheckDigit)")
                            
                            if calculatedComposite == compositeCheckDigit {
                                debug(message: "✅ Found valid TD1 combination with correct composite checksum!")
                                
                                // Apply check digit corrections (O -> 0)
                                if let docCheckChar = lines[0].at(index: isExtendedDoc ? 28 : 14), docCheckChar == "O" {
                                    var line0Chars = Array(testLines[0])
                                    line0Chars[isExtendedDoc ? 28 : 14] = "0"
                                    testLines[0] = String(line0Chars)
                                    debug(message: "Corrected doc check digit: 'O' -> '0'")
                                }
                                
                                if let dobCheckChar = lines[1].at(index: 6), dobCheckChar == "O" {
                                    var line1Chars = Array(testLines[1])
                                    line1Chars[6] = "0"
                                    testLines[1] = String(line1Chars)
                                    debug(message: "Corrected DOB check digit: 'O' -> '0'")
                                }
                                
                                if let doeCheckChar = lines[1].at(index: 14), doeCheckChar == "O" {
                                    var line1Chars = Array(testLines[1])
                                    line1Chars[14] = "0"
                                    testLines[1] = String(line1Chars)
                                    debug(message: "Corrected DOE check digit: 'O' -> '0'")
                                }
                                
                                if compositeCheckChar == "O" {
                                    var line1Chars = Array(testLines[1])
                                    line1Chars[29] = "0"
                                    testLines[1] = String(line1Chars)
                                    debug(message: "Corrected composite check digit: 'O' -> '0'")
                                }
                                
                                let finalMrz = testLines.joined(separator: "\n")
                                if validateFinalTD1MRZ(finalMrz) {
                                    debug(message: "✅ Final TD1 MRZ validation passed")
                                    return finalMrz
                                } else {
                                    debug(message: "❌ Final TD1 MRZ validation failed")
                                }
                            } else {
                                debug(message: "❌ Composite checksum mismatch, trying next combination...")
                            }
                        }
                    }
                }
                
                debug(message: "❌ No combination of valid TD1 field corrections produces a valid composite checksum")
            } else {
                debug(message: "One or more TD1 fields could not be corrected")
            }
        } else {
            debug(message: "TD1 format validation failed")
        }
        
        return nil
    }
    
    // Final validation function for TD1 MRZ
    func validateFinalTD1MRZ(_ mrzString: String) -> Bool {
        let lines = mrzString.components(separatedBy: "\n")
        
        guard lines.count == 3 && lines[0].count == 30 && lines[1].count == 30 && lines[2].count == 30 else {
            debug(message: "❌ Invalid TD1 MRZ format for final validation")
            return false
        }
        
        // Helper function to parse check digit
        func parseCheckDigit(_ char: Character) -> Int? {
            if let digit = Int(String(char)) {
                return digit
            } else if char == "O" {
                return 0
            } else {
                return nil
            }
        }
        
        // Validate document number (handle both standard and extended)
        let isExtendedDoc = lines[0].at(index: 14) == "<"
        var fullDocNumber: String = ""
        var docCheckDigit: Int?
        
        if isExtendedDoc {
            debug(message: "Validating extended document number")
            // Extended: 5-13 + 15-27, find last digit for check digit
            let docPart1 = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 5)..<lines[0].index(lines[0].startIndex, offsetBy: 14)]) // 5-13
            let docPart2 = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 15)..<lines[0].index(lines[0].startIndex, offsetBy: 28)]) // 15-27
            
            // Find the last digit in the extended part for check digit
            var checkDigitIndex = -1
            for i in (15...28).reversed() {
                if let char = lines[0].at(index: i), char != "<" {
                    if let digit = parseCheckDigit(char) {
                        checkDigitIndex = i
                        docCheckDigit = digit
                        break
                    }
                }
            }
            
            if checkDigitIndex > 15 {
                // Document number is everything except the check digit
                let docPart2WithoutCheck = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 15)..<lines[0].index(lines[0].startIndex, offsetBy: checkDigitIndex)])
                fullDocNumber = docPart1 + docPart2WithoutCheck.replacingOccurrences(of: "<", with: "")
                debug(message: "Extended doc validation: '\(fullDocNumber)', Check digit: \(docCheckDigit!)")
            } else {
                debug(message: "❌ Could not find valid check digit in extended document number")
                return false
            }
        } else {
            debug(message: "Validating standard document number")
            // Standard: 5-13 with check digit at 14
            fullDocNumber = String(lines[0][lines[0].index(lines[0].startIndex, offsetBy: 5)..<lines[0].index(lines[0].startIndex, offsetBy: 14)])
            if let checkDigitChar = lines[0].at(index: 14) {
                docCheckDigit = parseCheckDigit(checkDigitChar)
                debug(message: "Standard doc validation: '\(fullDocNumber)', Check digit: \(docCheckDigit!)")
            } else {
                debug(message: "❌ Invalid standard document number check digit")
                return false
            }
        }
        
        guard let docCD = docCheckDigit else {
            debug(message: "❌ Could not parse document number check digit")
            return false
        }
        
        if !verifyChecksum(value: fullDocNumber, checkDigit: docCD) {
            debug(message: "❌ Document number checksum validation failed")
            return false
        }
        
        // Validate date of birth (line 1, position 0-5, check digit at 6)
        let dob = String(lines[1].prefix(6))
        guard let dobCheckChar = lines[1].at(index: 6),
              let dobCheckDigit = parseCheckDigit(dobCheckChar) else {
            debug(message: "❌ Invalid DOB check digit")
            return false
        }
        
        if !verifyChecksum(value: dob, checkDigit: dobCheckDigit) {
            debug(message: "❌ DOB checksum validation failed")
            return false
        }
        
        // Validate date of expiry (line 1, position 8-13, check digit at 14)
        let doe = String(lines[1][lines[1].index(lines[1].startIndex, offsetBy: 8)..<lines[1].index(lines[1].startIndex, offsetBy: 14)])
        guard let doeCheckChar = lines[1].at(index: 14),
              let doeCheckDigit = parseCheckDigit(doeCheckChar) else {
            debug(message: "❌ Invalid DOE check digit")
            return false
        }
        
        if !verifyChecksum(value: doe, checkDigit: doeCheckDigit) {
            debug(message: "❌ DOE checksum validation failed")
            return false
        }
        
        debug(message: "✅ All TD1 checksums validated successfully")
        return true
    }

    func checkMrz() -> (String)? {
        // This pattern allows for common OCR misreads (0O, 1I, 8B, 5S, D0)
        let countryPattern = "[A-Z0-9OIBDS<]{3}"
        
        // TD1 (ID Card) - Three lines, 30 chars each
        let tdOneFirstRegex = "([I1]|C|A).(\(countryPattern))([A-Z0-9<]{25})"
        let tdOneSecondRegex = "([IBSO0-9]{7})(.)([IBSO0-9]{7})(\(countryPattern))([A-Z0-9<]{12})"
        let tdOneThirdRegex = "([A-Z0-9<]{30})"

        // Existing TD3 regex patterns
        let tdThreeFirstRegex = "P.(\(countryPattern))([A-Z0-9<]{39})"
        let tdThreeSecondRegex = "[A-Z0-9<]{1,9}<?[0-9O]{1}\(countryPattern)[0-9]{7}(.)[0-9O]{7}[A-Z0-9<]+"

        let tdOneMrzRegex = "\(tdOneFirstRegex)\n\(tdOneSecondRegex)\n\(tdOneThirdRegex)"
        let tdThreeMrzRegex = "\(tdThreeFirstRegex)\n\(tdThreeSecondRegex)"

        // Check for TD1 format
        let tdOneFirstLine = self.range(
            of: tdOneFirstRegex, options: .regularExpression, range: nil, locale: nil)
        let tdOneSecondLine = self.range(
            of: tdOneSecondRegex, options: .regularExpression, range: nil, locale: nil)
        let tdOneThirdLine = self.range(
            of: tdOneThirdRegex, options: .regularExpression, range: nil, locale: nil)

        // Existing TD3 checks
        let tdThreeFirstLine = self.range(
            of: tdThreeFirstRegex, options: .regularExpression, range: nil, locale: nil)
        let tdThreeSeconddLine = self.range(
            of: tdThreeSecondRegex, options: .regularExpression, range: nil, locale: nil)

        // TD1 capture logic
        if tdOneFirstLine != nil {
            if self.count == 30 {
                captureFirst = self
            }
        }
        if tdOneSecondLine != nil {
            if self.count == 30 {
                captureSecond = self
            }
        }
        if tdOneThirdLine != nil {
            if self.count == 30 {
                captureThird = self
            }
        }

        // Existing TD3 capture logic
        if tdThreeFirstLine != nil {
            if self.count == 44 {
                captureFirst = self
            }
        }
        if tdThreeSeconddLine != nil {
            if self.count == 44 {
                captureSecond = self
            }
        }

        // Check for complete TD1
        if captureFirst.count == 30 && captureSecond.count == 30 && captureThird.count == 30 {
            debug(message: "TD1 MRZ detected: '\(captureFirst)' and '\(captureSecond)' and '\(captureThird)'")
            temp_mrz = (captureFirst.stripped + "\n" + captureSecond.stripped + "\n" + captureThird.stripped)
                .replacingOccurrences(of: " ", with: "<")
            let checkMrz = temp_mrz.range(
                of: tdOneMrzRegex, options: .regularExpression, range: nil, locale: nil)
            if checkMrz != nil {
                mrz = temp_mrz
                
                debug(message: "TD1 MRZ detected: '\(mrz)'")
                
                // Try to correct O/0 confusion
                if let correctedMrz = correctTD1MRZ(mrzString: mrz) {
                    debug(message: "TD1 MRZ corrected: '\(correctedMrz)'")
                    mrz = correctedMrz
                } else {
                    debug(message: "TD1 MRZ correction returned nil")
                    return nil
                }
            }
        }

        // Existing TD3 check
        if captureFirst.count == 44 && captureSecond.count == 44 {
            debug(message: "TD3 MRZ detected: '\(captureFirst)' and '\(captureSecond)'")
            temp_mrz = (captureFirst.stripped + "\n" + captureSecond.stripped)
                .replacingOccurrences(of: " ", with: "<")
            debug(message: "temp_mrz: \(temp_mrz)")
            let checkMrz = temp_mrz.range(
                of: tdThreeMrzRegex, options: .regularExpression, range: nil, locale: nil)
            debug(message: "checkMrz: \(checkMrz)")
            if checkMrz != nil {
                mrz = temp_mrz
                
                debug(message: "TD3 MRZ detected: '\(mrz)'")
                
                // Try to correct O/0 confusion
                if let correctedMrz = correctTD3MRZ(mrzString: mrz) {
                    debug(message: "TD3 MRZ corrected: '\(correctedMrz)'")
                    mrz = correctedMrz
                } else {
                    debug(message: "TD3 MRZ correction returned nil")
                    return nil
                }
            }
        }

        debug(message: "captureFirst: \(captureFirst)")
        debug(message: "captureFirst count: \(captureFirst.count)")
        debug(message: "captureSecond: \(captureSecond)")
        debug(message: "captureSecond count: \(captureSecond.count)")
        debug(message: "captureThird: \(captureThird)")
        debug(message: "captureThird count: \(captureThird.count)")

        if mrz == "" {
            return nil
        }

        if let result = parser.parse(mrzString: mrz) {
            return mrz
        }
        return mrz
    }

    var stripped: String {
        let okayChars = Set("ABCDEFGHIJKLKMNOPQRSTUVWXYZ1234567890<")
        return self.filter { okayChars.contains($0) }
    }
    
    // Helper to get character at index
    func at(index: Int) -> Character? {
        guard index >= 0 && index < self.count else {
            return nil
        }
        return self[self.index(self.startIndex, offsetBy: index)]
    }
}

class StringTracker {
    var frameIndex: Int64 = 0

    typealias StringObservation = (lastSeen: Int64, count: Int64)

    // Dictionary of seen strings. Used to get stable recognition before
    // displaying anything.
    var seenStrings = [String: StringObservation]()
    var bestCount = Int64(0)
    var bestString = ""

    func logFrame(strings: [String]) {
        for string in strings {
            if seenStrings[string] == nil {
                seenStrings[string] = (lastSeen: Int64(0), count: Int64(-1))
            }
            seenStrings[string]?.lastSeen = frameIndex
            seenStrings[string]?.count += 1
            //print("Seen \(string) \(seenStrings[string]?.count ?? 0) times")
        }

        var obsoleteStrings = [String]()

        // Go through strings and prune any that have not been seen in while.
        // Also find the (non-pruned) string with the greatest count.
        for (string, obs) in seenStrings {
            // Remove previously seen text after 30 frames (~1s).
            if obs.lastSeen < frameIndex - 30 {
                obsoleteStrings.append(string)
            }

            // Find the string with the greatest count.
            let count = obs.count
            if !obsoleteStrings.contains(string) && count > bestCount {
                bestCount = Int64(count)
                bestString = string
            }
        }
        // Remove old strings.
        for string in obsoleteStrings {
            seenStrings.removeValue(forKey: string)
        }

        frameIndex += 1
    }

    func getStableString() -> String? {
        if bestCount >= 3 {
            return bestString
        } else {
            return nil
        }
    }

    func reset(string: String) {
        seenStrings.removeValue(forKey: string)
        bestCount = 0
        bestString = ""
        captureFirst = ""
        captureSecond = ""
        captureThird = ""
        mrz = ""
        temp_mrz = ""
    }
}
