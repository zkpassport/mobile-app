//
//  CharacterConfusionMatrix.swift
//  Enhanced character confusion matrix for MRZ OCR correction
//  Based on Android's CharacterConfusionMatrix.kt
//

import Foundation

class CharacterConfusionMatrix {
    
    // MARK: - Extended confusion pairs based on common OCR errors
    private static let confusionPairs: [Character: Set<Character>] = [
        // Digit confusions
        "0": ["O", "D", "Q"],
        "O": ["0", "D", "Q"],
        "1": ["I", "L", "7"],
        "I": ["1", "L"],
        "6": ["G", "8"],
        "G": ["6", "C", "9"],
        "8": ["B", "3", "6", "S"],
        "B": ["8", "3", "R", "6", "5"],
        "5": ["S", "6"],
        "S": ["5", "8", "3"],
        "2": ["Z", "7"],
        "Z": ["2", "7"],
        "3": ["8", "B", "E"],
        "4": ["A", "H"],
        "A": ["4", "R"],
        "9": ["P"],
        "P": ["9", "R"],
        "7": ["1", "T", "Z"],
        
        // Letter confusions
        "C": ["G"],
        "D": ["0", "O"],
        "E": ["F", "3"],
        "F": ["E", "P"],
        "H": ["N", "M", "4"],
        "K": ["X"],
        "M": ["N", "H", "W"],
        "N": ["M", "H"],
        "Q": ["0", "O"],
        "R": ["B", "P", "A"],
        "T": ["7", "I"],
        "U": ["V", "0"],
        "V": ["U", "Y"],
        "W": ["M"],
        "X": ["K", "Y"],
        "Y": ["V", "X"]
    ]
    
    // MARK: - Context-aware corrections based on field type
    enum FieldType {
        case documentNumber    // Can contain letters and digits
        case date             // Only digits (YYMMDD format)
        case countryCode      // Only letters (3-letter ISO codes)
        case name             // Only letters and '<'
        case gender           // Only 'M', 'F', or '<'
        case checkDigit       // Only single digit 0-9
        case mixed            // General field
    }
    
    // MARK: - Valid country codes (subset of common ones)
    private static let commonCountryCodes = Set([
        "AFG","ALB","DZA","ASM","AND","AGO","AIA","ATA","ATG","ARG","ARM","ABW","AUS","AUT","AZE",
        "BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BMU","BTN","BOL","BIH","BWA","BVT","BRA",
        "IOT","BRN","BGR","BFA","BDI","KHM","CMR","CAN","CPV","CYM","CAF","TCD","CHL","CHN","CXR",
        "CCK","COL","COM","COG","COD","COK","CRI","CIV","HRV","CUB","CYP","CZE","DNK","DJI","DMA",
        "DOM","ECU","EGY","SLV","GNQ","ERI","EST","ETH","FLK","FRO","FJI","FIN","FRA","GUF","PYF",
        "ATF","GAB","GMB","GEO","D<<","GHA","GIB","GRC","GRL","GRD","GLP","GUM","GTM","GIN","GNB",
        "GUY","HTI","HMD","VAT","HND","HKG","HUN","ISL","IND","IDN","IRN","IRQ","IRL","ISR","ITA",
        "JAM","JPN","JOR","KAZ","KEN","KIR","PRK","KOR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR",
        "LBY","LIE","LTU","LUX","MAC","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MTQ","MRT","MUS",
        "MYT","MEX","FSM","MDA","MCO","MNG","MSR","MAR","MOZ","MMR","NAM","NRU","NPL","NLD","NCL",
        "NZL","NIC","NER","NGA","NIU","NFK","MNP","MKD","NOR","OMN","PAK","PLW","PSE","PAN","PNG",
        "PRY","PER","PHL","PCN","POL","PRT","PRI","QAT","REU","ROU","RUS","RWA","SHN","KNA","LCA",
        "SPM","VCT","WSM","SMR","STP","SAU","SEN","SYC","SLE","SGP","SVK","SVN","SLB","SOM","ZAF",
        "SGS","ESP","LKA","SDN","SUR","SJM","SWZ","SWE","CHE","SYR","TWN","TJK","TZA","THA","TLS",
        "TGO","TKL","TON","TTO","TUN","TUR","TKM","TCA","TUV","UGA","UKR","ARE","GBR","USA","UMI",
        "URY","UZB","VUT","VEN","VNM","VGB","VIR","WLF","ESH","YEM","ZMB","ZWE","ALA","BES","CUW",
        "GGY","IMN","JEY","MNE","BLM","MAF","SRB","SXM","SSD","XKX"
    ])
    
    // MARK: - Get possible corrections for a character
    static func getPossibleCorrections(for char: Character, fieldType: FieldType) -> Set<Character> {
        let baseCorrections = confusionPairs[char] ?? []
        
        // Filter corrections based on field type
        switch fieldType {
        case .date, .checkDigit:
            // Dates and check digits should only contain digits
            var corrections = baseCorrections.filter { $0.isNumber }
            if char.isLetter, let digit = getDigitForLetter(char) {
                corrections.insert(digit)
            }
            return corrections
            
        case .countryCode, .name:
            // Country codes and names should only contain letters
            var corrections = baseCorrections.filter { $0.isLetter }
            if char.isNumber, let letter = getLetterForDigit(char) {
                corrections.insert(letter)
            }
            return corrections
            
        case .gender:
            // Gender can only be M, F, or <
            switch char {
            case "M", "N", "H": return ["M"]
            case "F", "E", "P": return ["F"]
            default: return ["<"]
            }
            
        case .documentNumber, .mixed:
            // Can contain both letters and digits
            return baseCorrections
        }
    }
    
    // MARK: - Get most likely digit for a misread letter
    private static func getDigitForLetter(_ letter: Character) -> Character? {
        switch letter {
        case "O", "D", "Q": return "0"
        case "I": return "1"
        case "Z": return "2"
        case "E": return "3"
        case "A": return "4"
        case "S": return "5"
        case "G": return "6"
        case "T": return "7"
        case "B": return "8"
        case "P": return "9"
        default: return nil
        }
    }
    
    // MARK: - Get most likely letter for a misread digit
    private static func getLetterForDigit(_ digit: Character) -> Character? {
        switch digit {
        case "0": return "O"
        case "1": return "I"
        case "2": return "Z"
        case "3": return "E"
        case "4": return "A"
        case "5": return "S"
        case "6": return "G"
        case "7": return "T"
        case "8": return "B"
        case "9": return "P"
        default: return nil
        }
    }
    
    // MARK: - Calculate confidence score for a correction
    static func getCorrectionConfidence(
        original: Character,
        corrected: Character,
        fieldType: FieldType,
        surroundingChars: String? = nil
    ) -> Float {
        var confidence: Float = 0.5  // Base confidence
        
        // Higher confidence for common confusion pairs
        if confusionPairs[original]?.contains(corrected) == true {
            confidence += 0.2
        }
        
        // Context-based confidence adjustments
        switch fieldType {
        case .date:
            if corrected.isNumber { confidence += 0.3 }
            // Check for valid date patterns
            if let context = surroundingChars, isValidDateContext(corrected, context: context) {
                confidence += 0.2
            }
            
        case .countryCode:
            if corrected.isLetter || corrected == "<" { confidence += 0.3 }
            // Check against known country codes
            if let context = surroundingChars, isValidCountryContext(corrected, context: context) {
                confidence += 0.2
            }
            
        case .checkDigit:
            if corrected.isNumber { confidence += 0.4 }
            
        default:
            break
        }
        
        return min(max(confidence, 0), 1)  // Clamp between 0 and 1
    }
    
    // MARK: - Date validation
    private static func isValidDateContext(_ char: Character, context: String) -> Bool {
        guard char.isNumber else { return false }
        
        // If context is too short, do basic validation
        if context.count < 6 {
            return char >= "0" && char <= "9"
        }
        
        // Find potential date patterns (YYMMDD)
        let datePattern = try? NSRegularExpression(pattern: "\\d{6}")
        let matches = datePattern?.matches(in: context, range: NSRange(context.startIndex..., in: context)) ?? []
        
        for match in matches {
            if let range = Range(match.range, in: context) {
                let dateStr = String(context[range])
                if isValidYYMMDD(dateStr) {
                    // Check if character fits in this valid date context
                    if let charIndex = context.firstIndex(of: char),
                       range.contains(charIndex) {
                        let position = context.distance(from: range.lowerBound, to: charIndex)
                        return isValidCharAtPosition(char, position: position, fullDate: dateStr)
                    }
                }
            }
        }
        
        return isValidDateCharInPartialContext(char, context: context)
    }
    
    private static func isValidYYMMDD(_ dateStr: String) -> Bool {
        guard dateStr.count == 6 else { return false }
        
        let monthStr = String(dateStr[dateStr.index(dateStr.startIndex, offsetBy: 2)..<dateStr.index(dateStr.startIndex, offsetBy: 4)])
        let dayStr = String(dateStr[dateStr.index(dateStr.startIndex, offsetBy: 4)..<dateStr.index(dateStr.startIndex, offsetBy: 6)])
        
        guard let month = Int(monthStr), let day = Int(dayStr) else { return false }
        
        // Validate month (01-12)
        guard month >= 1 && month <= 12 else { return false }
        
        // Validate day (01-31)
        guard day >= 1 && day <= 31 else { return false }
        
        // Additional validation for days per month
        switch month {
        case 2: return day <= 29  // Feb (allow leap years)
        case 4, 6, 9, 11: return day <= 30  // Apr, Jun, Sep, Nov
        default: return day <= 31  // Jan, Mar, May, Jul, Aug, Oct, Dec
        }
    }
    
    private static func isValidCharAtPosition(_ char: Character, position: Int, fullDate: String) -> Bool {
        let dateArray = Array(fullDate)
        
        switch position {
        case 0, 1: return char >= "0" && char <= "9"  // Year: any digits
        case 2: return char == "0" || char == "1"     // Month tens: 0 or 1
        case 3:                                        // Month units
            let monthTens = dateArray[2]
            switch monthTens {
            case "0": return char >= "1" && char <= "9"  // 01-09
            case "1": return char >= "0" && char <= "2"  // 10-12
            default: return false
            }
        case 4: return char >= "0" && char <= "3"     // Day tens: 0-3
        case 5:                                        // Day units
            let dayTens = dateArray[4]
            switch dayTens {
            case "0": return char >= "1" && char <= "9"  // 01-09
            case "1", "2": return char >= "0" && char <= "9"  // 10-29
            case "3": return char == "0" || char == "1"  // 30-31
            default: return false
            }
        default: return false
        }
    }
    
    private static func isValidDateCharInPartialContext(_ char: Character, context: String) -> Bool {
        guard let charIndex = context.firstIndex(of: char) else {
            return char >= "0" && char <= "9"
        }
        
        // Check for obvious month patterns
        if charIndex > context.startIndex {
            let prevIndex = context.index(before: charIndex)
            let prevChar = context[prevIndex]
            
            if prevChar == "0" {
                // Char is units digit after '0', should be 1-9 for months
                return char >= "1" && char <= "9"
            }
            
            if prevChar == "1" {
                // Char is units digit after '1', should be 0-2 for months
                return char >= "0" && char <= "2"
            }
        }
        
        // Check for day patterns
        if charIndex < context.index(before: context.endIndex) {
            let nextIndex = context.index(after: charIndex)
            let nextChar = context[nextIndex]
            
            if nextChar.isNumber && char >= "0" && char <= "3" {
                // Could be day tens
                return true
            }
        }
        
        // Default: any digit is potentially valid
        return char >= "0" && char <= "9"
    }
    
    // MARK: - Country code validation
    private static func isValidCountryContext(_ char: Character, context: String) -> Bool {
        let contextPrefix = String(context.prefix(3))
        return commonCountryCodes.contains { code in
            code.contains(char) && code.contains(contextPrefix)
        }
    }
    
    // MARK: - Generate correction candidates
    static func generateCorrectionCandidates(
        text: String,
        fieldType: FieldType,
        maxCandidates: Int = 10
    ) -> [(text: String, confidence: Float)] {
        var candidates: [(String, Float)] = []
        var confusableIndices: [Int] = []
        
        // Find all positions with confusable characters
        for (index, char) in text.enumerated() {
            if !getPossibleCorrections(for: char, fieldType: fieldType).isEmpty {
                confusableIndices.append(index)
            }
        }
        
        // Generate candidates recursively
        generateCandidatesRecursive(
            original: text,
            fieldType: fieldType,
            confusableIndices: confusableIndices,
            currentIndex: 0,
            current: text,
            confidence: 1.0,
            candidates: &candidates,
            maxCandidates: maxCandidates
        )
        
        // Sort by confidence and return top candidates
        return Array(candidates.sorted(by: { $0.1 > $1.1 }).prefix(maxCandidates))
    }
    
    private static func generateCandidatesRecursive(
        original: String,
        fieldType: FieldType,
        confusableIndices: [Int],
        currentIndex: Int,
        current: String,
        confidence: Float,
        candidates: inout [(String, Float)],
        maxCandidates: Int
    ) {
        guard candidates.count < maxCandidates else { return }
        
        if currentIndex >= confusableIndices.count {
            candidates.append((current, confidence))
            return
        }
        
        let charIndex = confusableIndices[currentIndex]
        let originalChar = original[original.index(original.startIndex, offsetBy: charIndex)]
        let corrections = getPossibleCorrections(for: originalChar, fieldType: fieldType).union([originalChar])
        
        for correction in corrections {
            var newCurrent = current
            let replaceIndex = newCurrent.index(newCurrent.startIndex, offsetBy: charIndex)
            newCurrent.replaceSubrange(replaceIndex...replaceIndex, with: String(correction))
            
            let correctionConfidence: Float
            if correction == originalChar {
                correctionConfidence = 1.0
            } else {
                correctionConfidence = getCorrectionConfidence(
                    original: originalChar,
                    corrected: correction,
                    fieldType: fieldType,
                    surroundingChars: newCurrent
                )
            }
            
            generateCandidatesRecursive(
                original: original,
                fieldType: fieldType,
                confusableIndices: confusableIndices,
                currentIndex: currentIndex + 1,
                current: newCurrent,
                confidence: confidence * correctionConfidence,
                candidates: &candidates,
                maxCandidates: maxCandidates
            )
        }
    }
}
