package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import org.jmrtd.lds.icao.MRZInfo
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min

/**
 * Aggregates OCR results from multiple frames to improve accuracy and reduce errors
 * Uses voting mechanism and confidence scoring to determine the best MRZ reading
 */
class MultiFrameAggregator(private val context: Context? = null) {
    
    companion object {
        private const val TAG = "MultiFrameAggregator"
        private const val DEBUG = true
    }   
    
    /**
     * Frame data with timestamp and confidence
     */
    data class FrameResult(
        val timestamp: Long,
        val mrzLines: List<String>,
        val confidence: Float,
        val checksumValid: Boolean,
        val fieldConfidences: Map<String, Float> = emptyMap()
    )
    
    /**
     * Aggregated field data
     */
    data class FieldConsensus(
        val value: String,
        val confidence: Float,
        val occurrences: Int
    )
    
    /**
     * MRZ result with confidence information
     */
    data class MRZResult(
        val mrz: String,
        val confidence: Float,
        val mrzLines: List<String>
    )
    
    private val frameBuffer = mutableListOf<FrameResult>()
    private val fieldVotes = ConcurrentHashMap<String, MutableMap<String, Int>>()
    private val characterVotes = ConcurrentHashMap<String, Array<MutableMap<Char, Int>>>()
    
    private fun debug(message: String) {
        if (DEBUG) {
            Log.d(TAG, message)
        }
    }
    
    /**
     * Provide haptic feedback when a valid MRZ frame is detected
     */
    private fun performHapticFeedback() {
        context?.let { ctx ->
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Android 12+ - Use VibratorManager
                    val vibratorManager = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    val vibrator = vibratorManager?.defaultVibrator
                    
                    if (vibrator?.hasVibrator() == true) {
                        val effect = VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE)
                        vibrator.vibrate(effect)
                        debug("Haptic feedback triggered (VibratorManager)")
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Android 8+ - Use VibrationEffect
                    val vibrator = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    
                    if (vibrator?.hasVibrator() == true) {
                        val effect = VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE)
                        vibrator.vibrate(effect)
                        debug("Haptic feedback triggered (VibrationEffect)")
                    }
                } else {
                    // Legacy Android - Use deprecated vibrate method
                    @Suppress("DEPRECATION")
                    val vibrator = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    
                    if (vibrator?.hasVibrator() == true) {
                        @Suppress("DEPRECATION")
                        vibrator.vibrate(50)
                        debug("Haptic feedback triggered (legacy)")
                    }
                }
            } catch (e: Exception) {
                debug("Failed to perform haptic feedback: ${e.message}")
            }
        }
    }
    
    /**
     * Add a new frame result to the aggregator
     * Thread-safe for parallel OCR processing
     */
    @Synchronized
    fun addFrame(
        mrzLines: List<String>,
        confidence: Float = 1.0f,
        checksumValid: Boolean = false,
        fieldConfidences: Map<String, Float> = emptyMap()
    ): MRZResult? {
        val currentTime = System.currentTimeMillis()
        
        // Clean up old frames
        frameBuffer.removeAll { currentTime - it.timestamp > MRZScanConfig.frameExpiryMs }

        debug("Adding frame: ${mrzLines.joinToString(" / ")}")
        
        // Add new frame
        val frameResult = FrameResult(
            timestamp = currentTime,
            mrzLines = mrzLines,
            confidence = confidence,
            checksumValid = checksumValid,
            fieldConfidences = fieldConfidences
        )
        
        frameBuffer.add(frameResult)
        
        // Keep buffer size under control
        while (frameBuffer.size > MRZScanConfig.maxProcessingFrames) {
            frameBuffer.removeAt(0)
        }
        
        debug("Added frame ${frameBuffer.size}/${MRZScanConfig.maxProcessingFrames}, checksum valid: $checksumValid")
        
        // Provide haptic feedback for valid checksum frames
        if (checksumValid && MRZScanConfig.enableHapticFeedback) {
            performHapticFeedback()
            debug("Haptic feedback triggered for valid checksum frame")
        }
        
        // Update voting maps
        //updateVotes(mrzLines)
        
        // Try to achieve consensus
        return tryConsensus()
    }
    
    /**
     * Update character and field voting maps
     * Not used as just checking the whole lines is enough with Tesseract accuracy
     */
    private fun updateVotes(mrzLines: List<String>) {
        // Update character-level votes for each position
        mrzLines.forEachIndexed { lineIndex, line ->
            val lineKey = "line_$lineIndex"
            
            // Initialize character vote array if needed
            if (!characterVotes.containsKey(lineKey)) {
                characterVotes[lineKey] = Array(line.length) { mutableMapOf<Char, Int>() }
            }
            
            val lineVotes = characterVotes[lineKey]!!
            line.forEachIndexed { charIndex, char ->
                if (charIndex < lineVotes.size) {
                    lineVotes[charIndex][char] = lineVotes[charIndex].getOrDefault(char, 0) + 1
                }
            }
        }
        
        // Extract and vote on specific fields
        if (mrzLines.size >= 2) {
            when {
                // TD3 (Passport) format
                mrzLines[0].startsWith("P") && mrzLines[0].length == 44 -> {
                    extractTD3Fields(mrzLines)
                }
                // TD1 (ID Card) format
                mrzLines.all { it.length == 30 } -> {
                    extractTD1Fields(mrzLines)
                }
            }
        }
    }
    
    /**
     * Extract and vote on TD3 passport fields
     */
    private fun extractTD3Fields(lines: List<String>) {
        if (lines.size < 2) return
        
        val fields = mapOf(
            "document_type" to lines[0].substring(0, 1),
            "issuing_country" to lines[0].substring(2, 5),
            "names" to lines[0].substring(5, 44),
            "document_number" to lines[1].substring(0, 9),
            "nationality" to lines[1].substring(10, 13),
            "date_of_birth" to lines[1].substring(13, 19),
            "sex" to lines[1].substring(20, 21),
            "expiry_date" to lines[1].substring(21, 27),
            "personal_number" to lines[1].substring(28, 42) 
        )
        
        fields.forEach { (fieldName, value) ->
            val votes = fieldVotes.getOrPut(fieldName) { mutableMapOf() }
            votes[value] = votes.getOrDefault(value, 0) + 1
        }
    }
    
    /**
     * Extract and vote on TD1 ID card fields (only first 2 lines)
     */
    private fun extractTD1Fields(lines: List<String>) {
        if (lines.size < 2) return
        
        val fields = mapOf(
            "document_type" to lines[0].substring(0, 2),
            "issuing_country" to lines[0].substring(2, 5),
            "document_number" to lines[0].substring(5, 14),
            "date_of_birth" to lines[1].substring(0, 6),
            "sex" to lines[1].substring(7, 8),
            "expiry_date" to lines[1].substring(8, 14),
            "nationality" to lines[1].substring(15, 18)
        )
        
        fields.forEach { (fieldName, value) ->
            val votes = fieldVotes.getOrPut(fieldName) { mutableMapOf() }
            votes[value] = votes.getOrDefault(value, 0) + 1
        }
    }
    
    /**
     * Extract key fields (document number, date of birth, expiry date) from MRZ lines
     * for grouping purposes. This allows grouping frames with different names but same key data.
     */
    private fun extractKeyFields(mrzLines: List<String>): String? {
        if (mrzLines.size < 2) return null
        
        return try {
            when {
                // TD3 (Passport) format
                mrzLines[0].startsWith("P") && mrzLines[0].length == 44 && mrzLines[1].length == 44 -> {
                    val documentNumber = mrzLines[1].substring(0, 9).trim('<')
                    val dateOfBirth = mrzLines[1].substring(13, 19)
                    val expiryDate = mrzLines[1].substring(21, 27)
                    "TD3:$documentNumber:$dateOfBirth:$expiryDate"
                }
                // TD1 (ID Card) format
                mrzLines.all { it.length == 30 } -> {
                    val line1 = mrzLines[0]
                    
                    // Check if it's an extended document number format
                    val isExtended = line1.getOrNull(14) == '<'
                    
                    val documentNumber = if (isExtended) {
                        // Extended format: combine positions 5-13 with positions 15-29 (until '<')
                        line1.substring(5, 14) + line1.substring(15, 30).takeWhile { it != '<' }
                    } else {
                        // Standard format: positions 5-14 (9 chars + check digit)
                        line1.substring(5, 15)
                    }
                    
                    val dateOfBirth = mrzLines[1].substring(0, 6)
                    val expiryDate = mrzLines[1].substring(8, 14)
                    "TD1:$documentNumber:$dateOfBirth:$expiryDate"
                }
                else -> null
            }
        } catch (e: Exception) {
            debug("Failed to extract key fields: ${e.message}")
            null
        }
    }
    
    /**
     * Try to achieve consensus from accumulated frames
     */
    private fun tryConsensus(): MRZResult? {
        if (frameBuffer.size < MRZScanConfig.minConsensusFrames) {
            debug("Not enough frames for consensus: ${frameBuffer.size}/$MRZScanConfig.minConsensusFrames (need ${MRZScanConfig.minConsensusFrames - frameBuffer.size} more)")
            return null
        }
        
        // First, check if we have any frames with valid checksums
        val validFrames = frameBuffer.filter { it.checksumValid }
        if (validFrames.isNotEmpty()) {
            debug("Found ${validFrames.size} frames with valid checksums")
            
            // Group valid frames by key fields (document number, DOB, expiry date) only
            // This allows frames with different names to be grouped together
            val validMrzGroups = validFrames.groupBy { frame ->
                extractKeyFields(frame.mrzLines) ?: frame.mrzLines.joinToString("\n")
            }
            val bestValidGroup = validMrzGroups.maxByOrNull { it.value.size }
            debug("Valid frames grouped by key fields (doc number, DOB, expiry): ${validMrzGroups.size} groups")
            debug("Best valid group key: ${bestValidGroup?.key}")
            debug("Best valid group has ${bestValidGroup?.value?.size} frames")
            
            if (bestValidGroup != null && bestValidGroup.value.size >= (MRZScanConfig.minConsensusFrames / 2).toInt()) {
                debug("Consensus achieved with ${bestValidGroup.value.size} valid frames")
                
                // Calculate average confidence of the best valid group
                val averageConfidence = bestValidGroup.value.map { it.confidence }.average().toFloat()
                debug("Best valid group average confidence: $averageConfidence")
                
                // Get the actual MRZ lines from the frame with highest confidence in the best group
                // We use the actual MRZ lines, not the key field grouping
                val bestFrame = bestValidGroup.value.maxByOrNull { it.confidence }
                val bestValidMrzLines = bestFrame?.mrzLines ?: bestValidGroup.value.first().mrzLines
                debug("Best valid group MRZ lines: ${bestValidMrzLines.joinToString(" | ")}")
                
                val mrzString = parseMRZLines(bestValidMrzLines)
                return if (mrzString != null) {
                    MRZResult(mrzString, averageConfidence, bestValidMrzLines)
                } else {
                    null
                }
            }
        }
        
        // Try character-level consensus
        /*val consensusLines = buildConsensusLines()
        if (consensusLines != null) {
            debug("Built consensus from character voting: ${consensusLines.joinToString(" / ")}")
            
            // Validate consensus lines
            val mrzInfo = parseMRZLines(consensusLines)
            if (mrzInfo != null) {
                debug("Consensus MRZ parsed successfully")
                return mrzInfo
            }
        }
        
        // Try field-level consensus as last resort
        val fieldConsensus = buildFieldConsensus()
        if (fieldConsensus.size >= 6) {  // Minimum required fields
            debug("Using field-level consensus")
            return buildMRZFromFields(fieldConsensus)
        }*/
        
        debug("No consensus achieved yet")
        return null
    }
    
    /**
     * Build consensus MRZ lines from character voting
     * Not used as just checking the whole lines is enough with Tesseract accuracy
     */
    private fun buildConsensusLines(): List<String>? {
        val consensusLines = mutableListOf<String>()
        
        for (lineIndex in 0..2) {
            val lineKey = "line_$lineIndex"
            val lineVotes = characterVotes[lineKey] ?: continue
            
            if (lineVotes.isEmpty()) continue
            
            val consensusLine = StringBuilder()
            var totalConfidence = 0f
            
            for (charVotes in lineVotes) {
                if (charVotes.isEmpty()) {
                    consensusLine.append('<')  // Default padding character
                    continue
                }
                
                val totalVotes = charVotes.values.sum()
                val bestChar = charVotes.maxByOrNull { it.value }
                
                if (bestChar != null) {
                    val charConfidence = bestChar.value.toFloat() / totalVotes
                    if (charConfidence >= MRZScanConfig.consensusThreshold) {
                        consensusLine.append(bestChar.key)
                        totalConfidence += charConfidence
                    } else {
                        // No clear consensus for this position
                        return null
                    }
                }
            }
            
            if (consensusLine.isNotEmpty()) {
                consensusLines.add(consensusLine.toString())
            }
        }
        
        return if (consensusLines.size >= 2) consensusLines else null
    }
    
    /**
     * Build field-level consensus
     * Not used as just checking the whole lines is enough with Tesseract accuracy
     */
    private fun buildFieldConsensus(): Map<String, FieldConsensus> {
        val consensus = mutableMapOf<String, FieldConsensus>()
        
        fieldVotes.forEach { (fieldName, votes) ->
            val totalVotes = votes.values.sum()
            val bestValue = votes.maxByOrNull { it.value }
            
            if (bestValue != null) {
                val confidence = bestValue.value.toFloat() / totalVotes
                if (confidence >= MRZScanConfig.consensusThreshold) {
                    consensus[fieldName] = FieldConsensus(
                        value = bestValue.key,
                        confidence = confidence,
                        occurrences = bestValue.value
                    )
                }
            }
        }
        
        return consensus
    }
    
    /**
     * Parse MRZ lines into MRZ string
     */
    private fun parseMRZLines(lines: List<String>): String? {
        debug("Parsing MRZ lines: ${lines.joinToString(" / ")}")
        return try {
            when {
                lines.size >= 2 && lines[0].startsWith("P") && lines[0].length == 44 -> {
                    // TD3 format
                    lines.take(2).joinToString("\n")
                }
                lines.size >= 2 && lines.all { it.length == 30 } -> {
                    // TD1 format - create with dummy third line if needed
                    val mrzLines = if (lines.size == 2) {
                        lines + "".padEnd(30, '<')
                    } else {
                        lines.take(3)
                    }
                    mrzLines.joinToString("\n")
                }
                else -> null
            }
        } catch (e: Exception) {
            debug("Failed to parse MRZ: ${e.message}")
            null
        }
    }
    
    /**
     * Build MRZ string from field consensus
     */
    /*private fun buildMRZFromFields(fields: Map<String, FieldConsensus>): String? {
        return try {
            val documentType = fields["document_type"]?.value ?: return null
            val issuingCountry = fields["issuing_country"]?.value ?: return null
            val documentNumber = fields["document_number"]?.value ?: return null
            val dateOfBirth = fields["date_of_birth"]?.value ?: return null
            val sex = fields["sex"]?.value ?: return null
            val expiryDate = fields["expiry_date"]?.value ?: return null
            val nationality = fields["nationality"]?.value ?: return null
            
            // Build MRZ lines based on document type
            when {
                documentType == "P" -> {
                    // TD3 Passport
                    val names = fields["names"]?.value ?: "<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
                    val personalNumber = fields["personal_number"]?.value ?: "<<<<<<<<<<<<<<<<"
                    
                    val line1 = "P<$issuingCountry$names"
                    val line2 = "$documentNumber<$nationality$dateOfBirth$sex$expiryDate$personalNumber<<"
                    
                    line1.padEnd(44, '<') + "\n" + line2.padEnd(44, '<')
                }
                documentType.startsWith("I") || documentType.startsWith("C") || documentType.startsWith("A") -> {
                    // TD1 ID Card - simplified without third line
                    null  // Cannot reconstruct TD1 without complete data
                }
                else -> null
            }
        } catch (e: Exception) {
            debug("Failed to build MRZ from fields: ${e.message}")
            null
        }
    }*/
    
    /**
     * Reset the aggregator
     */
    @Synchronized
    fun reset() {
        frameBuffer.clear()
        fieldVotes.clear()
        characterVotes.clear()
        debug("Aggregator reset")
    }
    
    /**
     * Get current consensus status
     * Thread-safe for parallel OCR processing
     */
    @Synchronized
    fun getConsensusStatus(): ConsensusStatus {
        val validFrames = frameBuffer.count { it.checksumValid }
        val totalFrames = frameBuffer.size
        val consensusLines = buildConsensusLines()
        val fieldConsensus = buildFieldConsensus()
        
        return ConsensusStatus(
            totalFrames = totalFrames,
            validFrames = validFrames,
            hasCharacterConsensus = consensusLines != null,
            fieldConsensusCount = fieldConsensus.size,
            averageConfidence = frameBuffer.map { it.confidence }.average().toFloat()
        )
    }
    
    /**
     * Get current progress for valid frames
     */
    @Synchronized
    fun getValidFrameProgress(): Pair<Int, Int> {
        val validMrzGroups = frameBuffer.filter { it.checksumValid }.groupBy { frame ->
            extractKeyFields(frame.mrzLines) ?: frame.mrzLines.joinToString("\n")
        }
        val bestValidGroup = validMrzGroups.maxByOrNull { it.value.size }
        return Pair(bestValidGroup?.value?.size ?: 0, MRZScanConfig.minConsensusFrames)
    }
    
    data class ConsensusStatus(
        val totalFrames: Int,
        val validFrames: Int,
        val hasCharacterConsensus: Boolean,
        val fieldConsensusCount: Int,
        val averageConfidence: Float
    )
}