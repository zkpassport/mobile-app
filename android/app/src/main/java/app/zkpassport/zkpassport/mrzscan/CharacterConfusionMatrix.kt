package app.zkpassport.zkpassport.mrzscan

/**
 * Enhanced character confusion matrix for MRZ OCR correction
 * Based on empirical OCR error patterns and MRZ field context
 */
object CharacterConfusionMatrix {
    
    // Extended confusion pairs based on common OCR errors
    private val CONFUSION_PAIRS = mapOf(
        // Digit confusions
        '0' to setOf('O', 'D', 'Q'),
        'O' to setOf('0', 'D', 'Q'),
        '1' to setOf('I', 'L', '7'),
        'I' to setOf('1', 'L'),
        '6' to setOf('G', '8'),
        'G' to setOf('6', 'C', '9'),
        '8' to setOf('B', '3', '6', 'S'),
        'B' to setOf('8', '3', 'R', '6', '5'),
        '5' to setOf('S', '6'),
        'S' to setOf('5', '8', '3'),
        '2' to setOf('Z', '7'),
        'Z' to setOf('2', '7'),
        '3' to setOf('8', 'B', 'E'),
        '4' to setOf('A', 'H'),
        'A' to setOf('4', 'R'),
        '9' to setOf('P'),
        'P' to setOf('9', 'R'),
        '7' to setOf('1', 'T', 'Z'),
        
        // Letter confusions
        'C' to setOf('G'),
        'D' to setOf('0', 'O'),
        'E' to setOf('F', '3'),
        'F' to setOf('E', 'P'),
        'H' to setOf('N', 'M', '4'),
        'K' to setOf('X'),
        'M' to setOf('N', 'H', 'W'),
        'N' to setOf('M', 'H'),
        'Q' to setOf('0', 'O'),
        'R' to setOf('B', 'P', 'A'),
        'T' to setOf('7', 'I'),
        'U' to setOf('V', '0'),
        'V' to setOf('U', 'Y'),
        'W' to setOf('M'),
        'X' to setOf('K', 'Y'),
        'Y' to setOf('V', 'X')
    )
    
    // Context-aware corrections based on field type
    enum class FieldType {
        DOCUMENT_NUMBER,    // Can contain letters and digits
        DATE,              // Only digits (YYMMDD format)
        COUNTRY_CODE,      // Only letters (3-letter ISO codes)
        NAME,              // Only letters and '<'
        GENDER,            // Only 'M', 'F', or '<'
        CHECK_DIGIT,       // Only single digit 0-9
        MIXED              // General field
    }
    
    /**
     * Get possible corrections for a character based on confusion matrix
     */
    fun getPossibleCorrections(char: Char, fieldType: FieldType): Set<Char> {
        val baseCorrections = CONFUSION_PAIRS[char] ?: emptySet()
        
        // Filter corrections based on field type
        return when (fieldType) {
            FieldType.DATE, FieldType.CHECK_DIGIT -> {
                // Dates and check digits should only contain digits
                baseCorrections.filter { it.isDigit() }.toSet() + 
                    if (char.isLetter() && getDigitForLetter(char) != null) {
                        setOf(getDigitForLetter(char)!!)
                    } else emptySet()
            }
            FieldType.COUNTRY_CODE, FieldType.NAME -> {
                // Country codes and names should only contain letters
                baseCorrections.filter { it.isLetter() }.toSet() +
                    if (char.isDigit() && getLetterForDigit(char) != null) {
                        setOf(getLetterForDigit(char)!!)
                    } else emptySet()
            }
            FieldType.GENDER -> {
                // Gender can only be M, F, or <
                when (char) {
                    'M', 'N', 'H' -> setOf('M')
                    'F', 'E', 'P' -> setOf('F')
                    else -> setOf('<')
                }
            }
            FieldType.DOCUMENT_NUMBER, FieldType.MIXED -> {
                // Can contain both letters and digits
                baseCorrections
            }
        }
    }
    
    /**
     * Get most likely digit for a misread letter in date fields
     */
    private fun getDigitForLetter(letter: Char): Char? {
        return when (letter) {
            'O', 'D', 'Q' -> '0'
            'I' -> '1'
            'Z' -> '2'
            'E' -> '3'
            'A' -> '4'
            'S' -> '5'
            'G' -> '6'
            'T' -> '7'
            'B' -> '8'
            'P' -> '9'
            else -> null
        }
    }
    
    /**
     * Get most likely letter for a misread digit in country/name fields
     */
    private fun getLetterForDigit(digit: Char): Char? {
        return when (digit) {
            '0' -> 'O'
            '1' -> 'I'
            '2' -> 'Z'
            '3' -> 'E'
            '4' -> 'A'
            '5' -> 'S'
            '6' -> 'G'
            '7' -> 'T'
            '8' -> 'B'
            '9' -> 'P'
            else -> null
        }
    }
    
    /**
     * Calculate confidence score for a correction based on context
     */
    fun getCorrectionConfidence(
        original: Char,
        corrected: Char,
        fieldType: FieldType,
        surroundingChars: String? = null
    ): Float {
        var confidence = 0.5f // Base confidence
        
        // Higher confidence for common confusion pairs
        if (CONFUSION_PAIRS[original]?.contains(corrected) == true) {
            confidence += 0.2f
        }
        
        // Context-based confidence adjustments
        when (fieldType) {
            FieldType.DATE -> {
                if (corrected.isDigit()) confidence += 0.3f
                // Check for valid date patterns (0-3 for day tens, 0-1 for month tens)
                surroundingChars?.let { context ->
                    if (isValidDateContext(corrected, context)) {
                        confidence += 0.2f
                    }
                }
            }
            FieldType.COUNTRY_CODE -> {
                if (corrected.isLetter() || corrected == '<') confidence += 0.3f
                // Check against known country codes
                surroundingChars?.let { context ->
                    if (isValidCountryContext(corrected, context)) {
                        confidence += 0.2f
                    }
                }
            }
            FieldType.CHECK_DIGIT -> {
                if (corrected.isDigit()) confidence += 0.4f
            }
            else -> {}
        }
        
        return confidence.coerceIn(0f, 1f)
    }
    
    private fun isValidDateContext(char: Char, context: String): Boolean {
        // Date format: YYMMDD (6 digits)
        if (!char.isDigit()) return false
        
        // If context is too short to contain a full date, do basic validation
        if (context.length < 6) {
            return char in '0'..'9'
        }
        
        // Find potential date patterns in the context
        // Look for 6-digit sequences that could be dates
        val datePattern = Regex("\\d{6}")
        val matches = datePattern.findAll(context)
        
        for (match in matches) {
            val dateStr = match.value
            if (isValidYYMMDD(dateStr)) {
                // Check if the current character fits in this valid date context
                val charIndex = context.indexOf(char, match.range.first)
                if (charIndex in match.range) {
                    return isValidCharAtPosition(char, charIndex - match.range.first, dateStr)
                }
            }
        }
        
        // If no complete date found, validate based on position patterns
        return isValidDateCharInPartialContext(char, context)
    }
    
    private fun isValidYYMMDD(dateStr: String): Boolean {
        if (dateStr.length != 6) return false
        
        try {
            // Extract year, month, day from YYMMDD format
            val month = dateStr.substring(2, 4).toInt() 
            val day = dateStr.substring(4, 6).toInt()
            
            // Validate month (01-12)
            if (month < 1 || month > 12) return false
            
            // Validate day (01-31)
            if (day < 1 || day > 31) return false
            
            // Additional validation for days per month
            return when (month) {
                2 -> day <= 29  // Feb (allow leap years)
                4, 6, 9, 11 -> day <= 30  // Apr, Jun, Sep, Nov
                else -> day <= 31  // Jan, Mar, May, Jul, Aug, Oct, Dec
            }
        } catch (e: NumberFormatException) {
            return false
        }
    }
    
    private fun isValidCharAtPosition(char: Char, position: Int, fullDate: String): Boolean {
        return when (position) {
            0, 1 -> char in '0'..'9'  // Year: any digits (00-99)
            2 -> char in '0'..'1'     // Month tens: 0 or 1
            3 -> {                    // Month units
                val monthTens = fullDate[2]
                when (monthTens) {
                    '0' -> char in '1'..'9'  // 01-09
                    '1' -> char in '0'..'2'  // 10-12
                    else -> false
                }
            }
            4 -> char in '0'..'3'     // Day tens: 0-3
            5 -> {                    // Day units
                val dayTens = fullDate[4]
                when (dayTens) {
                    '0' -> char in '1'..'9'  // 01-09
                    '1', '2' -> char in '0'..'9'  // 10-29
                    '3' -> char in '0'..'1'  // 30-31
                    else -> false
                }
            }
            else -> false
        }
    }
    
    private fun isValidDateCharInPartialContext(char: Char, context: String): Boolean {
        // Look for patterns that suggest position in a date
        val charIndex = context.indexOf(char)
        
        // Check for obvious month patterns (month should be 01-12)
        if (charIndex > 0 && context[charIndex - 1] == '0') {
            // Char is units digit after '0', should be 1-9 for months
            return char in '1'..'9'
        }
        
        if (charIndex > 0 && context[charIndex - 1] == '1') {
            // Char is units digit after '1', should be 0-2 for months
            return char in '0'..'2'
        }
        
        // Check for day patterns (day tens should be 0-3)
        if (charIndex < context.length - 1) {
            val nextChar = context[charIndex + 1]
            if (nextChar.isDigit()) {
                // If this could be day tens, validate accordingly
                if (char in '0'..'3') return true
            }
        }
        
        // Default: any digit is potentially valid in partial context
        return char in '0'..'9'
    }
    
    private fun isValidCountryContext(char: Char, context: String): Boolean {
        // Check against known ISO country codes
        val commonCountryCodes = setOf(
            "AFG","ALB","DZA","ASM","AND","AGO","AIA","ATA","ATG","ARG","ARM","ABW","AUS","AUT","AZE","BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BMU","BTN","BOL","BIH","BWA","BVT","BRA","IOT","BRN","BGR","BFA","BDI","KHM","CMR","CAN","CPV","CYM","CAF","TCD","CHL","CHN","CXR","CCK","COL","COM","COG","COD","COK","CRI","CIV","HRV","CUB","CYP","CZE","DNK","DJI","DMA","DOM","ECU","EGY","SLV","GNQ","ERI","EST","ETH","FLK","FRO","FJI","FIN","FRA","GUF","PYF","ATF","GAB","GMB","GEO","D<<","GHA","GIB","GRC","GRL","GRD","GLP","GUM","GTM","GIN","GNB","GUY","HTI","HMD","VAT","HND","HKG","HUN","ISL","IND","IDN","IRN","IRQ","IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","PRK","KOR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE","LTU","LUX","MAC","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MTQ","MRT","MUS","MYT","MEX","FSM","MDA","MCO","MNG","MSR","MAR","MOZ","MMR","NAM","NRU","NPL","NLD","NCL","NZL","NIC","NER","NGA","NIU","NFK","MNP","MKD","NOR","OMN","PAK","PLW","PSE","PAN","PNG","PRY","PER","PHL","PCN","POL","PRT","PRI","QAT","REU","ROU","RUS","RWA","SHN","KNA","LCA","SPM","VCT","WSM","SMR","STP","SAU","SEN","SYC","SLE","SGP","SVK","SVN","SLB","SOM","ZAF","SGS","ESP","LKA","SDN","SUR","SJM","SWZ","SWE","CHE","SYR","TWN","TJK","TZA","THA","TLS","TGO","TKL","TON","TTO","TUN","TUR","TKM","TCA","TUV","UGA","UKR","ARE","GBR","USA","UMI","URY","UZB","VUT","VEN","VNM","VGB","VIR","WLF","ESH","YEM","ZMB","ZWE","ALA","BES","CUW","GGY","IMN","JEY","MNE","BLM","MAF","SRB","SXM","SSD","XKX"
         )
        return commonCountryCodes.any { it.contains(char) && it.contains(context.take(3)) }
    }
    
    /**
     * Generate all possible character combinations for a string with confusions
     */
    fun generateCorrectionCandidates(
        text: String,
        fieldType: FieldType,
        maxCandidates: Int = 10
    ): List<Pair<String, Float>> {
        val candidates = mutableListOf<Pair<String, Float>>()
        val confusableIndices = mutableListOf<Int>()
        
        // Find all positions with confusable characters
        text.forEachIndexed { index, char ->
            if (getPossibleCorrections(char, fieldType).isNotEmpty()) {
                confusableIndices.add(index)
            }
        }
        
        // Generate candidates with confidence scores
        generateCandidatesRecursive(
            text,
            fieldType,
            confusableIndices,
            0,
            StringBuilder(text),
            1.0f,
            candidates,
            maxCandidates
        )
        
        // Sort by confidence and return top candidates
        return candidates.sortedByDescending { it.second }.take(maxCandidates)
    }
    
    private fun generateCandidatesRecursive(
        original: String,
        fieldType: FieldType,
        confusableIndices: List<Int>,
        currentIndex: Int,
        current: StringBuilder,
        confidence: Float,
        candidates: MutableList<Pair<String, Float>>,
        maxCandidates: Int
    ) {
        if (candidates.size >= maxCandidates) return
        
        if (currentIndex >= confusableIndices.size) {
            candidates.add(current.toString() to confidence)
            return
        }
        
        val charIndex = confusableIndices[currentIndex]
        val originalChar = original[charIndex]
        val corrections = getPossibleCorrections(originalChar, fieldType) + originalChar
        
        for (correction in corrections) {
            val oldChar = current[charIndex]
            current[charIndex] = correction
            
            val correctionConfidence = if (correction == originalChar) {
                1.0f
            } else {
                getCorrectionConfidence(
                    originalChar,
                    correction,
                    fieldType,
                    current.toString()
                )
            }
            
            generateCandidatesRecursive(
                original,
                fieldType,
                confusableIndices,
                currentIndex + 1,
                current,
                confidence * correctionConfidence,
                candidates,
                maxCandidates
            )
            
            current[charIndex] = oldChar
        }
    }
}