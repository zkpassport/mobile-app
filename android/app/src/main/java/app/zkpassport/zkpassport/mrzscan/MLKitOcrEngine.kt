package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.*

/**
 * ML Kit-based OCR engine for MRZ recognition
 * Uses Google's ML Kit Text Recognition API optimized for Latin script
 */
class MLKitOcrEngine(private val context: Context) {
    
    data class RecognizedLine(
        val text: String,
        val confidence: Float,
        val boundingBox: Rect?
    )
    
    private var textRecognizer: TextRecognizer? = null
    private var isInitialized: Boolean = false
    
    // Coroutine scope for async operations
    private val ocrScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }
    
    companion object {
        private const val TAG = "MLKitOcrEngine"
    }
    
    /**
     * Initialize ML Kit text recognizer
     */
    fun initialize(): Boolean {
        if (isInitialized && textRecognizer != null) {
            debug("ML Kit already initialized, skipping")
            return true
        }
        
        return try {
            // Close any existing instance first
            close()
            
            // Create text recognizer with Latin script options (optimized for MRZ)
            val options = TextRecognizerOptions.Builder()
                .build()
            
            textRecognizer = TextRecognition.getClient(options)
            isInitialized = true
            debug("ML Kit text recognizer successfully initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing ML Kit text recognizer", e)
            isInitialized = false
            false
        }
    }
    
    /**
     * Synchronous text recognition
     */
    fun recognize(bitmap: Bitmap, documentType: String? = null): List<RecognizedLine> {
        val recognizer = textRecognizer
        if (recognizer == null || !isInitialized) {
            Log.w(TAG, "ML Kit text recognizer not initialized")
            return emptyList()
        }
        
        return try {
            val inputImage = InputImage.fromBitmap(bitmap, 0)
            
            // Perform synchronous text recognition
            val visionText = runBlocking {
                withContext(Dispatchers.IO) {
                    recognizeTextSync(recognizer, inputImage)
                }
            }
            
            if (visionText != null) {
                extractMRZLines(visionText)
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during ML Kit recognition", e)
            emptyList()
        }
    }
    
    /**
     * Asynchronous text recognition matching the interface expected by EnhancedMRZProcessor
     */
    fun recognizeAsync(bitmap: Bitmap, documentType: String? = null, callback: (List<RecognizedLine>) -> Unit) {
        val recognizer = textRecognizer
        if (recognizer == null || !isInitialized) {
            Log.w(TAG, "ML Kit text recognizer not initialized")
            callback(emptyList())
            return
        }
        
        ocrScope.launch {
            try {
                val inputImage = InputImage.fromBitmap(bitmap, 0)
                
                val visionText = recognizeTextSync(recognizer, inputImage)
                
                val results = if (visionText != null) {
                    extractMRZLines(visionText)
                } else {
                    emptyList()
                }
                
                // Check if coroutine is still active before callback
                if (isActive) {
                    withContext(Dispatchers.Main) {
                        callback(results)
                    }
                }
            } catch (e: CancellationException) {
                debug("ML Kit recognition task was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "Error in async ML Kit recognition", e)
                if (isActive) {
                    withContext(Dispatchers.Main) {
                        callback(emptyList())
                    }
                }
            }
        }
    }
    
    /**
     * Perform synchronous text recognition using ML Kit
     */
    private suspend fun recognizeTextSync(recognizer: TextRecognizer, inputImage: InputImage): Text? {
        return suspendCancellableCoroutine { continuation ->
            recognizer.process(inputImage)
                .addOnSuccessListener { visionText ->
                    if (continuation.isActive) {
                        continuation.resume(visionText) { _, _, _ -> }
                    }
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "ML Kit text recognition failed", e)
                    if (continuation.isActive) {
                        continuation.resume(null) { _, _, _ -> }
                    }
                }
                .addOnCanceledListener {
                    if (continuation.isActive) {
                        continuation.resume(null) { _, _, _ -> }
                    }
                }
        }
    }
    
    /**
     * Extract MRZ-like lines from ML Kit recognition results
     */
    private fun extractMRZLines(visionText: Text): List<RecognizedLine> {
        val results = mutableListOf<RecognizedLine>()
        
        // Process each text block
        for (block in visionText.textBlocks) {
            // Process lines within the block
            for (line in block.lines) {
                var text = line.text.trim().uppercase()
                
                // ML Kit specific preprocessing to handle common issues
                text = preprocessMLKitText(text)
                
                // Filter out non-MRZ lines (MRZ lines typically contain < and are uppercase)
                if (text.length >= 10 && containsMRZCharacters(text)) {
                    // Apply MRZ-specific formatting
                    text = formatMRZLine(text)
                    
                    // ML Kit doesn't provide confidence scores per line, so we estimate based on text quality
                    val confidence = estimateConfidence(text)
                    
                    results.add(
                        RecognizedLine(
                            text = text,
                            confidence = confidence,
                            boundingBox = line.boundingBox
                        )
                    )
                    
                    debug("ML Kit recognized line: '$text' (confidence: $confidence)")
                }
            }
        }
        
        // Sort by vertical position (top to bottom)
        results.sortBy { it.boundingBox?.top ?: 0 }
        
        // Find the first line starting with a valid document code
        val firstDocumentLineIndex = results.indexOfFirst { line ->
            val firstChar = line.text.trim().firstOrNull()
            firstChar == 'P' || // Passport
            firstChar == 'I' || // ID card
            firstChar == 'C' || // ID card 
            firstChar == 'A' || // ID card
            firstChar == 'X'    // Other document type
        }
        
        // If we found a document code line, remove all lines before it
        val filteredResults = if (firstDocumentLineIndex > 0) {
            results.subList(firstDocumentLineIndex, results.size)
        } else {
            results
        }
        
        debug("ML Kit extracted ${results.size} MRZ candidate lines, filtered to ${filteredResults.size} lines")
        return filteredResults
    }
    
    /**
     * Preprocess ML Kit text to handle common recognition issues
     */
    private fun preprocessMLKitText(text: String): String {
        var processed = text
        
        // Remove all internal whitespace (ML Kit often adds spaces where there shouldn't be any)
        processed = processed.replace(" ", "")
        
        // Common ML Kit character confusions in MRZ context
        processed = processed
            .replace("«", "<<")  // Sometimes recognizes << as «
            .replace("»", ">>")  // Sometimes recognizes >> as »
            .replace(">", "<")   // MRZ uses < not >
            .replace(".", "<")   // Sometimes dots are recognized instead of <
            .replace(",", "<")   // Sometimes commas are recognized instead of <
            .replace("'", "")    // Remove apostrophes that shouldn't be there
            .replace("\"", "")   // Remove quotes
            .replace("-", "")    // Remove hyphens except in specific positions
        
        return processed
    }
    
    /**
     * Format MRZ line to expected length with proper padding
     */
    private fun formatMRZLine(text: String): String {
        // Determine expected line length based on content and current length
        val expectedLength = when {
            // TD3 (passport) lines are 44 characters
            text.startsWith("P") || text.length > 40 -> 44
            // TD1 (ID card) lines are 30 characters
            text.startsWith("I") || text.startsWith("C") || 
            text.startsWith("A") || text.startsWith("X") || 
            text.length in 25..35 -> 30
            // If we can't determine, check if it's closer to TD1 or TD3
            else -> if (text.length <= 35) 30 else 44
        }
        
        return when {
            text.length > expectedLength -> {
                // Truncate if too long
                debug("ML Kit line too long (${text.length}), truncating to $expectedLength")
                text.take(expectedLength)
            }
            text.length < expectedLength -> {
                // Pad with < characters if too short
                val padded = text.padEnd(expectedLength, '<')
                debug("ML Kit line too short (${text.length}), padding to $expectedLength")
                padded
            }
            else -> text
        }
    }
    
    /**
     * Estimate confidence based on MRZ character patterns and completeness
     * ML Kit doesn't provide line-level confidence, so we estimate based on content
     */
    private fun estimateConfidence(text: String): Float {
        var score = 0.3f // Lower base confidence for ML Kit
        
        // Check if line appears complete (has proper length)
        when (text.length) {
            44 -> score += 0.2f // Perfect TD3 line length
            30 -> score += 0.2f // Perfect TD1 line length
            in 40..43 -> score += 0.1f // Nearly complete TD3
            in 28..29 -> score += 0.1f // Nearly complete TD1
            else -> score -= 0.1f // Penalty for unusual length
        }
        
        // Increase confidence for MRZ-specific patterns
        if (text.contains("<<")) score += 0.1f
        if (text.count { it == '<' } > 2) score += 0.1f
        if (text.any { it.isDigit() }) score += 0.1f
        
        // Document type indicators
        if (text.startsWith("P")) score += 0.15f // Passport
        if (text.startsWith("I") || text.startsWith("C") || 
            text.startsWith("A") || text.startsWith("X")) score += 0.15f // ID card
        
        // Check for proper padding at the end
        if (text.endsWith("<")) score += 0.05f
        
        // Penalty if line appears truncated (no padding at all)
        if (!text.contains('<')) score -= 0.2f
        
        // Check character distribution (MRZ should have mix of letters and special chars)
        val letterCount = text.count { it.isLetter() }
        val digitCount = text.count { it.isDigit() }
        val specialCount = text.count { it == '<' }
        
        if (letterCount > 0 && (digitCount > 0 || specialCount > 0)) {
            score += 0.1f // Good character mix
        }
        
        return score.coerceIn(0.1f, 0.85f) // Cap ML Kit confidence lower than Tesseract
    }
    
    /**
     * Check if text contains MRZ characters
     * More lenient for ML Kit as it might miss some characters
     */
    private fun containsMRZCharacters(text: String): Boolean {
        val validChars = setOf(
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
            'U', 'V', 'W', 'X', 'Y', 'Z', '<'
        )
        
        val validCharCount = text.count { it in validChars }
        val validRatio = validCharCount.toFloat() / text.length
        
        // More lenient threshold for ML Kit (70% instead of 80%)
        // Also check for MRZ-like patterns
        return validRatio > 0.7 || 
               (validRatio > 0.6 && (text.contains("<<") || text.startsWith("P") || 
                text.startsWith("I") || text.startsWith("C") || 
                text.startsWith("A") || text.startsWith("X")))
    }
    
    /**
     * Close and clean up resources
     */
    fun close() {
        if (!isInitialized && textRecognizer == null) {
            debug("ML Kit already closed or never initialized")
            return
        }
        
        try {
            // Cancel all ongoing coroutines
            ocrScope.cancel()
            
            // ML Kit text recognizer doesn't need explicit cleanup
            textRecognizer = null
            isInitialized = false
            
            debug("ML Kit text recognizer closed and state reset")
        } catch (e: Exception) {
            Log.w(TAG, "Error closing ML Kit text recognizer: ${e.message}")
        }
    }
}
