package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Enhanced MRZ processor that integrates multiple improvement strategies:
 * - Advanced character confusion correction
 * - Image preprocessing
 * - Multi-frame aggregation
 * - Confidence-based validation
 * - Context-aware field correction
 */
class EnhancedMRZProcessor(private val context: Context, private val documentType: String? = null) {

    companion object {
        private const val TAG = "EnhancedMRZProcessor"
    }

    // Use OpenCV for preprocessing
    private val openCvPreprocessor: OpenCVImagePreprocessor by lazy {
        OpenCVImagePreprocessor(documentType)
    }

    private val multiFrameAggregator = MultiFrameAggregator(context)

    // OCR engines
    private var tesseractEngine: TesseractOcrEngine? = null
    private var mlKitEngine: MLKitOcrEngine? = null

    // Frame sequencing for parallel processing and engine alternation
    private val frameSequence = AtomicInteger(0)
    private val lastProcessedSequence = AtomicInteger(0)
    private val frameCounter = AtomicInteger(0)

    // Main thread handler for callbacks
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    /**
     * Initialize the processor
     */
    fun initialize() {
        // Initialize Tesseract engine
        try {
            if (tesseractEngine == null) {
                tesseractEngine = TesseractEngineManager.getEngine(context)
                debug("Tesseract OCR engine acquired: ${tesseractEngine != null}")
                debug("Engine status: ${TesseractEngineManager.getStatus()}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire Tesseract engine: ${e.message}")
        }

        // Initialize ML Kit engine
        try {
            if (mlKitEngine == null) {
                mlKitEngine = MLKitOcrEngine(context)
                val mlKitInitialized = mlKitEngine?.initialize() ?: false
                debug("ML Kit OCR engine initialized: $mlKitInitialized")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize ML Kit engine: ${e.message}")
        }

        debug("Enhanced MRZ Processor initialized with Tesseract and ML Kit")
    }

    /**
     * Downscale bitmap if it exceeds maximum dimensions to reduce memory/CPU usage
     */
    private fun downscaleBitmapIfNeeded(bitmap: Bitmap): Bitmap {
        val maxWidth = MRZScanConfig.maxImageWidth
        val maxHeight = MRZScanConfig.maxImageHeight

        if (bitmap.width <= maxWidth && bitmap.height <= maxHeight) {
            return bitmap
        }

        val scale = minOf(
            maxWidth.toFloat() / bitmap.width,
            maxHeight.toFloat() / bitmap.height
        )

        val newWidth = (bitmap.width * scale).toInt()
        val newHeight = (bitmap.height * scale).toInt()

        debug("Downscaling bitmap from ${bitmap.width}x${bitmap.height} to ${newWidth}x${newHeight}")

        val downscaled = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)

        // Recycle original if a new bitmap was created
        if (downscaled != bitmap) {
            bitmap.recycle()
        }

        return downscaled
    }

    /**
     * Process a bitmap image for MRZ extraction
     * Thread-safe with frame sequencing for parallel OCR processing
     */
    fun processBitmap(
        bitmap: Bitmap,
        callback: MRZProcessingCallback,
        onProcessedImage: ((Bitmap) -> Unit)? = null
    ) {
        // Assign sequence number for tracking out-of-order results
        val sequence = frameSequence.incrementAndGet()

        debug("Processing bitmap: ${bitmap.width}x${bitmap.height}, sequence: $sequence")

        // Step 0: Downscale bitmap if necessary to reduce memory/CPU usage
        val scaledBitmap = downscaleBitmapIfNeeded(bitmap)

        // Step 1: Preprocess image if enabled
        val processedBitmap = if (MRZScanConfig.enablePreprocessing) {
            // Try OpenCV first, fallback to Leptonica if OpenCV is not available
            val processed = openCvPreprocessor.preprocessImage(scaledBitmap, MRZScanConfig.preprocessingConfig, sequence)
            // Callback with processed image for debug visualization
            onProcessedImage?.invoke(processed)

            // Recycle scaled bitmap if preprocessing created a new one
            if (processed != scaledBitmap) {
                scaledBitmap.recycle()
            }
            processed
        } else {
            // Callback with original image if preprocessing is disabled
            onProcessedImage?.invoke(scaledBitmap)
            debug("Debug image callback invoked with scaled image")
            scaledBitmap
        }

        // Step 2: Run OCR - alternate between Tesseract and ML Kit (if enabled)
        val frameCount = frameCounter.incrementAndGet()
        val useMLKit = MRZScanConfig.enableMLKitAlternation &&
                       mlKitEngine != null &&
                       (frameCount % 2 == 1) // Odd frames use ML Kit, even frames use Tesseract

        debug("Frame $frameCount: Using ${if (useMLKit) "ML Kit" else "Tesseract"} for OCR (alternation=${MRZScanConfig.enableMLKitAlternation})")

        try {
            if (useMLKit && mlKitEngine != null) {
                // Use ML Kit for odd frames
                mlKitEngine?.recognizeAsync(processedBitmap, documentType) { recognizedLines ->
                    try {
                        // Post result processing to main thread for thread-safe callbacks
                        mainHandler.post {
                            processMLKitResult(recognizedLines, callback, sequence, "MLKit")
                        }
                    } finally {
                        // Always recycle the processed bitmap after OCR completes
                        if (!processedBitmap.isRecycled) {
                            processedBitmap.recycle()
                            debug("Processed bitmap recycled after ML Kit OCR (sequence: $sequence)")
                        }
                    }
                } ?: run {
                    // Fallback to Tesseract if ML Kit is not available
                    debug("ML Kit not available, falling back to Tesseract")
                    useTesseractFallback(processedBitmap, documentType, callback, sequence)
                }
            } else {
                // Use Tesseract for even frames or if ML Kit is not available
                tesseractEngine?.recognizeAsync(processedBitmap, documentType) { recognizedLines ->
                    try {
                        // Post result processing to main thread for thread-safe callbacks
                        mainHandler.post {
                            processTesseractResult(recognizedLines, callback, sequence, "Tesseract")
                        }
                    } finally {
                        // Always recycle the processed bitmap after OCR completes
                        if (!processedBitmap.isRecycled) {
                            processedBitmap.recycle()
                            debug("Processed bitmap recycled after Tesseract OCR (sequence: $sequence)")
                        }
                    }
                } ?: run {
                    mainHandler.post {
                        callback.onError(Exception("No OCR engine initialized"))
                    }
                }
            }
        } catch (e: Exception) {
            // Clean up bitmap on error
            if (!processedBitmap.isRecycled) {
                processedBitmap.recycle()
            }
            mainHandler.post {
                callback.onError(e)
            }
            Log.e(TAG, "Error processing bitmap: ${e.message}")
        }
    }

    /**
     * Fallback method to use Tesseract when ML Kit is not available
     */
    private fun useTesseractFallback(
        processedBitmap: Bitmap,
        documentType: String?,
        callback: MRZProcessingCallback,
        sequence: Int
    ) {
        tesseractEngine?.recognizeAsync(processedBitmap, documentType) { recognizedLines ->
            try {
                mainHandler.post {
                    processTesseractResult(recognizedLines, callback, sequence, "Tesseract (fallback)")
                }
            } finally {
                if (!processedBitmap.isRecycled) {
                    processedBitmap.recycle()
                    debug("Processed bitmap recycled after Tesseract fallback (sequence: $sequence)")
                }
            }
        } ?: run {
            if (!processedBitmap.isRecycled) {
                processedBitmap.recycle()
            }
            mainHandler.post {
                callback.onError(Exception("No OCR engine available"))
            }
        }
    }

    /**
     * Process OCR results with enhanced correction and validation
     * Thread-safe - runs on main thread
     * @param sequence Frame sequence number for out-of-order detection
     * @param engineName Name of the OCR engine for debugging
     */
    private fun processTesseractResult(
        lines: List<TesseractOcrEngine.RecognizedLine>,
        callback: MRZProcessingCallback,
        sequence: Int,
        engineName: String = "Tesseract"
    ) {
        // Check for out-of-order results
        val lastSeq = lastProcessedSequence.get()
        if (sequence < lastSeq) {
            debug("⚠️ Out-of-order result: sequence $sequence (last: $lastSeq) - processing anyway")
        }
        lastProcessedSequence.set(max(lastSeq, sequence))

        debug("[$engineName] Processing OCR result with ${lines.size} lines, sequence: $sequence")

        // Extract potential MRZ lines with confidence scores
        val mrzCandidates = extractMRZCandidatesFromLines(lines, callback)

        if (mrzCandidates.isEmpty()) {
            debug("No MRZ candidates found")
            callback.onMRZNotFound()
            return
        }

        debug("Found ${mrzCandidates.size} MRZ candidates")

        // Process each candidate
        for (candidate in mrzCandidates) {
            debug("Processing candidate: ${candidate.lines.joinToString(" / ")}")
            val correctedMRZ = processCandidate(candidate)

            if (correctedMRZ != null) {

                if (correctedMRZ.lines.size > 0 && correctedMRZ.lines.size >= 2) {
                    if (lines.size > correctedMRZ.lines.size && lines.size == 3) {
                        callback.onMRZLinesDetected(listOf(correctedMRZ.lines[0], correctedMRZ.lines[1], lines[2].text.trim().uppercase()))
                    } else {
                        callback.onMRZLinesDetected(correctedMRZ.lines)
                    }
                }

                // Try multi-frame aggregation if enabled
                if (MRZScanConfig.enableMultiFrame) {
                    val aggregatedMRZ = multiFrameAggregator.addFrame(
                        mrzLines = correctedMRZ.lines,
                        confidence = candidate.confidence,
                        checksumValid = correctedMRZ.checksumValid,
                        fieldConfidences = correctedMRZ.fieldConfidences
                    )

                    // Trigger callback when frame with valid checksum is added
                    if (correctedMRZ.checksumValid) {
                        callback.onValidChecksumFrame()
                    }

                    // Update progress based on valid frames
                    val (currentValidFrames, requiredFrames) = multiFrameAggregator.getValidFrameProgress()
                    callback.onProgressUpdate(currentValidFrames, requiredFrames)
                    debug("Progress update: $currentValidFrames/$requiredFrames valid frames")

                    if (aggregatedMRZ != null) {
                        debug("MRZ consensus achieved through aggregation")
                        callback.onBestValidGroupMRZ(aggregatedMRZ.mrzLines, aggregatedMRZ.mrz, aggregatedMRZ.confidence)
                        callback.onMRZExtracted(aggregatedMRZ.mrz, aggregatedMRZ.confidence)
                        return
                    }

                    // Check aggregation status
                    val status = multiFrameAggregator.getConsensusStatus()
                    debug("Aggregation status: $status")

                    // Still aggregating frames, notify to continue processing
                    callback.onProcessingFrame()
                    return
                } else {
                    // Single frame processing
                    if (correctedMRZ.checksumValid && correctedMRZ.confidence >= MRZScanConfig.minConfidence) {
                        try {
                            callback.onMRZExtracted(correctedMRZ.lines.joinToString("\n"), correctedMRZ.confidence)
                            return
                        } catch (e: Exception) {
                            debug("Failed to create MRZInfo: ${e.message}")
                        }
                    }
                }
            }
        }

        // No valid MRZ found in this frame
        callback.onProcessingFrame()
    }

    /**
     * Process ML Kit OCR results
     * Thread-safe - runs on main thread
     * @param sequence Frame sequence number for out-of-order detection
     * @param engineName Name of the OCR engine for debugging
     */
    private fun processMLKitResult(
        lines: List<MLKitOcrEngine.RecognizedLine>,
        callback: MRZProcessingCallback,
        sequence: Int,
        engineName: String = "MLKit"
    ) {
        // Convert ML Kit results to Tesseract format for unified processing
        val tesseractLines = lines.map { mlKitLine ->
            TesseractOcrEngine.RecognizedLine(
                text = mlKitLine.text,
                confidence = mlKitLine.confidence,
                boundingBox = mlKitLine.boundingBox
            )
        }

        // Process using the same logic as Tesseract
        processTesseractResult(tesseractLines, callback, sequence, engineName)
    }

    /**
     * Extract potential MRZ candidates from OCR results
     */
    private fun extractMRZCandidatesFromLines(
        recognizedLines: List<TesseractOcrEngine.RecognizedLine>,
        callback: MRZProcessingCallback
    ): List<MRZCandidate> {
        val candidates = mutableListOf<MRZCandidate>()
        var allLines = mutableListOf<LineWithConfidence>()

        debug("recognizedLines: ${recognizedLines.size}")
        debug("recognizedLines: ${recognizedLines.joinToString("\n") { it.text }}")

        // We assume we have something close to an MRZ now
        if (recognizedLines.size > 0) {
            callback.onMRZSeen()
        }

        // Extract all lines with confidence
        val sorted = recognizedLines.sortedBy { it.boundingBox?.top ?: 0 }
        for (line in sorted) {
            val text = line.text.trim().uppercase()
            val confidence = line.confidence.takeIf { it in 0f..1f } ?: 1.0f
            debug("text: $text, confidence: $confidence")
            if (text.length >= 10 && containsMRZCharacters(text)) {
                if (confidence >= MRZScanConfig.minConfidence) {
                    allLines.add(
                        LineWithConfidence(
                            removeNonMRZCharacters(text),
                            confidence,
                            line.boundingBox
                        )
                    )
                }
            }
        }

        // Group lines by proximity and format
        val td3Lines = mutableListOf<LineWithConfidence>()
        val td1Lines = mutableListOf<LineWithConfidence>()

        debug("allLines: ${allLines.size}")
        debug("allLines: ${allLines.joinToString("\n") { it.text }}")

        if (allLines.size < 2 || allLines.size > 3) {
            debug("No valid lines found")
            return candidates
        }

        // Function to check if lines match TD1 format
        fun checkTD1(lines: List<LineWithConfidence>): Boolean {
            return lines.size == 3 &&
                   lines.all { it.text.length == 30 } &&
                   (lines[0].text.startsWith("I") || lines[0].text.startsWith("C") ||
                    lines[0].text.startsWith("A") || lines[0].text.startsWith("X")) &&
                   lines[0].text.any { it.isDigit() } &&
                   lines[1].text.take(7).all { it.isDigit() } &&
                   lines[1].text.drop(8).take(7).all { it.isDigit() }
        }

        // Function to check if lines match TD3 format
        fun checkTD3(lines: List<LineWithConfidence>): Boolean {
            return lines.size == 2 && lines[0].text.startsWith("P")
        }

        // Generate all permutations of lines
        fun <T> permutations(list: List<T>): List<List<T>> {
            if (list.size <= 1) return listOf(list)

            val result = mutableListOf<List<T>>()
            for (i in list.indices) {
                val element = list[i]
                val remaining = list.subList(0, i) + list.subList(i + 1, list.size)
                for (perm in permutations(remaining)) {
                    result.add(listOf(element) + perm)
                }
            }
            return result
        }

        // Try all permutations to find a valid TD1 or TD3 format
        var isTD1 = false
        var isTD3 = false
        var validLines = allLines

        for (permutation in permutations(allLines)) {
            if (checkTD1(permutation)) {
                isTD1 = true
                validLines = permutation.toMutableList()
                debug("Found valid TD1 format with permutation: ${permutation.joinToString(" | ") { it.text }}")
                break
            } else if (checkTD3(permutation)) {
                isTD3 = true
                validLines = permutation.toMutableList()
                debug("Found valid TD3 format with permutation: ${permutation.joinToString(" | ") { it.text }}")
                break
            }
        }

        // Update allLines with the valid permutation
        allLines = validLines

        debug("isTD3: $isTD3")
        debug("isTD1: $isTD1")
        debug("Final line order: ${allLines.joinToString(" | ") { it.text }}")

        for (line in allLines) {
            when {
                isTD1 -> td1Lines.add(line)
                isTD3 -> td3Lines.add(line)
            }
        }

        debug("td3Lines: ${td3Lines.size}")
        debug("td3Lines: ${td3Lines.joinToString("\n") { it.text }}")

        debug("td1Lines: ${td1Lines.size}")
        debug("td1Lines: ${td1Lines.joinToString("\n") { it.text }}")

        // Create TD3 candidates (2 lines of 44 chars)
        if (td3Lines.size >= 2) {
            // Sort by vertical position
            td3Lines.sortBy { it.boundingBox?.top ?: 0 }

            for (i in 0 until td3Lines.size - 1) {
                val line1 = td3Lines[i]
                val line2 = td3Lines[i + 1]

                debug("Adding TD3 candidate: ${line1.text} ${line2.text}")
                candidates.add(
                    MRZCandidate(
                        lines = listOf(
                            normalizeLineLength(line1.text, 44),
                            normalizeLineLength(line2.text, 44)
                        ),
                        confidence = min(line1.confidence, line2.confidence),
                        format = MRZFormat.TD3
                    )
                )
            }
        }

        // Create TD1 candidates (3 lines of 30 chars when available, otherwise 2 lines + placeholder)
        if (td1Lines.size >= 2) {
            // Sort by vertical position
            td1Lines.sortBy { it.boundingBox?.top ?: 0 }

            if (td1Lines.size >= 3) {
                // We have all 3 lines - use them directly
                for (i in 0 until td1Lines.size - 2) {
                    val line1 = td1Lines[i]
                    val line2 = td1Lines[i + 1]
                    val line3 = td1Lines[i + 2]

                    debug("Adding TD1 candidate (3 lines): ${line1.text} ${line2.text} ${line3.text}")
                    candidates.add(
                        MRZCandidate(
                            lines = listOf(
                                normalizeLineLength(line1.text, 30),
                                normalizeLineLength(line2.text, 30),
                                normalizeLineLength(line3.text, 30)  // Include actual third line
                            ),
                            confidence = minOf(line1.confidence, line2.confidence, line3.confidence),
                            format = MRZFormat.TD1
                        )
                    )
                }
            } else {
                // We only have 2 lines - use them with a placeholder third line
                for (i in 0 until td1Lines.size - 1) {
                    val line1 = td1Lines[i]
                    val line2 = td1Lines[i + 1]

                    debug("Adding TD1 candidate (2 lines + placeholder): ${line1.text} ${line2.text}")
                    candidates.add(
                        MRZCandidate(
                            lines = listOf(
                                normalizeLineLength(line1.text, 30),
                                normalizeLineLength(line2.text, 30),
                                "".padEnd(30, '<')  // Placeholder third line
                            ),
                            confidence = min(line1.confidence, line2.confidence),
                            format = MRZFormat.TD1
                        )
                    )
                }
            }
        }

        return candidates
    }

    /**
     * Process a single MRZ candidate with corrections
     */
    private fun processCandidate(candidate: MRZCandidate): CorrectedMRZ? {
        debug("Processing ${candidate.format} candidate with confidence ${candidate.confidence}")

        return when (candidate.format) {
            MRZFormat.TD3 -> processTD3Candidate(candidate)
            MRZFormat.TD1 -> processTD1Candidate(candidate)
        }
    }

    /**
     * Process TD3 (passport) candidate
     */
    private fun processTD3Candidate(candidate: MRZCandidate): CorrectedMRZ? {
        if (candidate.lines.size < 2) return null

        val line1 = candidate.lines[0]
        val line2 = candidate.lines[1]

        if (line1 == null || line2 == null) {
            debug("No valid lines found")
            return null
        }

        debug("line1: ${line1}")
        debug("line2: ${line2}")

        // check if first line contains date patterns at positions 13-18 and 21-26
        if (line1.length == 44) {
            val dobPattern = line1.substring(13, 19)
            val doePattern = line1.substring(21, 27)

            val dobNumericCount = dobPattern.count { it.isDigit() }
            val doeNumericCount = doePattern.count { it.isDigit() }

            if (dobNumericCount >= 5 && doeNumericCount >= 5) {
                debug("❌ Detected swapped TD3 lines - first line contains date patterns")
                return null
            }
        }

        // validate document number - '<' can only appear at the end (padding)
        if (line2.length >= 9) {
            val docNumber = line2.substring(0, 9)
            var foundFiller = false

            for (char in docNumber) {
                if (char == '<') {
                    foundFiller = true
                } else if (foundFiller) {
                    // Found a non-'<' character after a '<' - invalid pattern
                    debug("❌ Invalid document number: '<' character found in the middle: $docNumber")
                    return null
                }
            }
        }

        // Extract fields with context-aware correction
        val correctedFields = mutableMapOf<String, String>()
        val fieldConfidences = mutableMapOf<String, Float>()

        // Line 1 fields
        correctedFields["document_type"] = "P"
        correctedFields["issuing_country"] = correctCountryCode(line1.substring(2, 5))
        correctedFields["names"] = line1.substring(5, 44)

        // Preserve original line for optional data reconstruction
        correctedFields["original_line1"] = line1
        correctedFields["original_line2"] = line2

        debug("corrected document_type: ${correctedFields["document_type"]}")
        debug("corrected issuing_country: ${correctedFields["issuing_country"]}")
        debug("corrected names: ${correctedFields["names"]}")

        // Line 2 fields with corrections
        val docNumber = line2.substring(0, 9)
        val docNumberCheck = line2[9]
        correctedFields["document_number"] = correctWithCheckDigit(
            docNumber,
            docNumberCheck,
            CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER
        )

        debug("corrected document_number: ${correctedFields["document_number"]}")

        correctedFields["nationality"] = correctCountryCode(line2.substring(10, 13))
        debug("corrected nationality: ${correctedFields["nationality"]}")

        val dob = line2.substring(13, 19)
        val dobCheck = line2[19]
        correctedFields["date_of_birth"] = correctWithCheckDigit(
            dob,
            dobCheck,
            CharacterConfusionMatrix.FieldType.DATE
        )
        debug("corrected date_of_birth: ${correctedFields["date_of_birth"]}")

        correctedFields["sex"] = correctGender(line2[20])
        debug("corrected sex: ${correctedFields["sex"]}")

        val expiry = line2.substring(21, 27)
        val expiryCheck = line2[27]
        correctedFields["expiry_date"] = correctWithCheckDigit(
            expiry,
            expiryCheck,
            CharacterConfusionMatrix.FieldType.DATE
        )
        debug("corrected expiry_date: ${correctedFields["expiry_date"]}")
        val personalNumber = line2.substring(28, 42)
        val personalCheck = line2[42]
        correctedFields["personal_number"] = if (personalCheck != '<') {
            correctWithCheckDigit(
                personalNumber,
                personalCheck,
                CharacterConfusionMatrix.FieldType.MIXED
            )
        } else {
            personalNumber
        }

        debug("corrected personal_number: ${correctedFields["personal_number"]}")

        // Build corrected MRZ lines
        var correctedLine1 = buildTD3Line1(correctedFields)
        var correctedLine2 = buildTD3Line2(correctedFields)

        debug("correctedLine1: ${correctedLine1}")
        debug("correctedLine2: ${correctedLine2}")

        // Validate checksums
        var checksumValid = validateTD3Checksums(correctedLine1, correctedLine2)
        debug("checksumValid: $checksumValid")

        if (!checksumValid) {
            debug("TD3 checksums are invalid, attempting enhanced combination checking")

            // Try enhanced combination checking to fix all fields simultaneously
            val enhancedResult = attemptTD3EnhancedCorrection(candidate, correctedFields)
            if (enhancedResult != null) {
                debug("✅ Enhanced TD3 correction successful")
                return enhancedResult
            }

            return null
            // Fallback: attempt to replace the composite check digit with the correct one
            /*correctedLine2 = correctedLine2.substring(0, 43) + calculateTD3CompositeCheckDigit(correctedLine2).toString()
            correctedLine2 = correctedLine2.padEnd(44, '<')
            checksumValid = validateTD3Checksums(correctedLine1, correctedLine2)
            if (!checksumValid) {
                debug("TD3 checksums are still invalid after all correction attempts")
                return null
            }*/
        }

        return CorrectedMRZ(
            lines = listOf(correctedLine1, correctedLine2),
            confidence = calculateOverallConfidence(fieldConfidences),
            checksumValid = checksumValid,
            fieldConfidences = fieldConfidences
        )
    }

    /**
     * Process TD1 (ID card) candidate
     */
    private fun processTD1Candidate(candidate: MRZCandidate): CorrectedMRZ? {
        if (candidate.lines.size < 2) return null

        val line1 = candidate.lines[0]
        val line2 = candidate.lines[1]
        val line3 = candidate.lines.getOrNull(2) ?: "".padEnd(30, '<') // Use actual third line or placeholder

        if (line1 == null || line2 == null) {
            debug("No valid lines found")
            return null
        }

        // Validate basic format
        if (!line1[0].let { it == 'I' || it == 'C' || it == 'A' || it == 'X' }) {
            debug("TD1 line 1 doesn't start with I, C, A or X")
            return null
        }
        // The first 7 characters of line 2 should be a number as it's the date of birth
        if (!line2.substring(0, 7).all { it.isDigit() }) {
            debug("TD1 line 2 doesn't start with the date")
            return null
        }

        // Extract and correct fields
        val correctedFields = mutableMapOf<String, String>()
        val fieldConfidences = mutableMapOf<String, Float>()

        // Line 1 fields
        correctedFields["document_type"] = line1.substring(0, 2)
        correctedFields["issuing_country"] = correctCountryCode(line1.substring(2, 5))

        // Preserve original lines for optional data reconstruction
        correctedFields["original_line1"] = line1
        correctedFields["original_line2"] = line2
        correctedFields["original_line3"] = line3  // Preserve actual third line

        // Document number handling (standard or extended)
        val isExtended = line1[14] == '<'
        correctedFields["document_number"] = if (isExtended) {
            // Extended format
            line1.substring(5, 14) + line1.substring(15, 30).takeWhile { it != '<' }
        } else {
            correctWithCheckDigit(
                line1.substring(5, 14),
                line1[14],
                CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER
            )
        }

        // Line 2 fields
        val dob = line2.substring(0, 6)
        val dobCheck = line2[6]
        correctedFields["date_of_birth"] = correctWithCheckDigit(
            dob,
            dobCheck,
            CharacterConfusionMatrix.FieldType.DATE
        )

        correctedFields["sex"] = correctGender(line2[7])

        val expiry = line2.substring(8, 14)
        val expiryCheck = line2[14]
        correctedFields["expiry_date"] = correctWithCheckDigit(
            expiry,
            expiryCheck,
            CharacterConfusionMatrix.FieldType.DATE
        )

        correctedFields["nationality"] = correctCountryCode(line2.substring(15, 18))

        // Build corrected MRZ lines
        var correctedLine1 = buildTD1Line1(correctedFields)
        var correctedLine2 = buildTD1Line2(correctedFields)

        // Use actual third line (already stored in correctedFields)
        val correctedLine3 = correctedFields["original_line3"] ?: "".padEnd(30, '<')

        // Validate checksums
        var checksumValid = validateTD1Checksums(correctedLine1, correctedLine2)

        if (!checksumValid) {
            debug("TD1 checksums are invalid, attempting enhanced combination checking")

            // Try enhanced combination checking to fix all fields simultaneously
            val enhancedResult = attemptTD1EnhancedCorrection(candidate, correctedFields)
            if (enhancedResult != null) {
                debug("✅ Enhanced TD1 correction successful")
                return enhancedResult
            }

            return null
            // Fallback: attempt to replace the composite check digit with the correct one
            /*correctedLine2 = correctedLine2.substring(0, 29) + calculateTD1CompositeCheckDigit(correctedLine1, correctedLine2).toString()
            correctedLine2 = correctedLine2.padEnd(30, '<')
            checksumValid = validateTD1Checksums(correctedLine1, correctedLine2)
            if (!checksumValid) {
                debug("TD1 checksums are still invalid after all correction attempts")
                return null
            }*/
        }

        return CorrectedMRZ(
            lines = listOf(correctedLine1, correctedLine2, correctedLine3),
            confidence = calculateOverallConfidence(fieldConfidences),
            checksumValid = checksumValid,
            fieldConfidences = fieldConfidences
        )
    }

    /**
     * Combination checker for generating and testing character confusion corrections
     */
    inner class CombinationChecker {

        /**
         * Get all valid combinations for a field value that match the expected check digit
         */
        fun getValidCombinations(
            value: String,
            expectedCheckDigit: Int,
            fieldType: CharacterConfusionMatrix.FieldType,
            maxCandidates: Int = MRZScanConfig.maxCorrectionCandidates
        ): List<Pair<String, Float>> {
            var validCombinations = mutableListOf<Pair<String, Float>>()

            debug("=== CombinationChecker for '$value' with checkDigit $expectedCheckDigit ===")

            // First, check if the original value is already valid
            if (calculateCheckDigit(value) == expectedCheckDigit) {
                debug("Original value '$value' is already valid")
                return listOf(value to 1.0f)
            }

            // Generate correction candidates using CharacterConfusionMatrix
            val correctionCandidates = if (MRZScanConfig.enableAdvancedCorrection) {
                generateAdvancedCorrectionCandidates(value, fieldType, maxCandidates)
            } else {
                generateBasicCorrectionCandidates(value, fieldType)
            }

            debug("Generated ${correctionCandidates.size} correction candidates")

            // Test each candidate against the check digit
            for ((candidate, confidence) in correctionCandidates) {
                if (calculateCheckDigit(candidate) == expectedCheckDigit) {
                    debug("✅ Valid combination found: '$candidate' (confidence: $confidence)")
                    validCombinations.add(candidate to confidence)
                }
            }

            // Apply field-specific sorting
            validCombinations = when (fieldType) {
                CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER -> {
                    debug("Applying document number digit bias sorting - prioritizing combinations with more digits (0,1,8,5,2)")
                    applyDocumentNumberDigitBias(validCombinations).toMutableList()
                }
                else -> {
                    // For other field types, sort by confidence only
                    validCombinations.sortedByDescending { it.second }.toMutableList()
                }
            }

            debug("Found ${validCombinations.size} valid combinations")

            // Debug output for document number combinations to show digit bias effect
            if (fieldType == CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER && validCombinations.isNotEmpty()) {
                debug("Top document number combinations (after digit bias):")
                validCombinations.take(3).forEachIndexed { index, (combination, confidence) ->
                    val digitCount = combination.count { it.isDigit() }
                    val targetDigitCount = arrayOf('0', '1', '8', '5', '2').sumOf { combination.count { c -> c == it } }
                    debug("  ${index + 1}. '$combination' (conf: $confidence, digits: $digitCount, target digits: $targetDigitCount)")
                }
            }

            return validCombinations.take(maxCandidates)
        }

        /**
         * Generate advanced correction candidates using CharacterConfusionMatrix
         */
        private fun generateAdvancedCorrectionCandidates(
            value: String,
            fieldType: CharacterConfusionMatrix.FieldType,
            maxCandidates: Int
        ): List<Pair<String, Float>> {
            val candidates = mutableSetOf<Pair<String, Float>>()

            // Single character corrections
            for (i in value.indices) {
                val originalChar = value[i]
                val possibleCorrections = CharacterConfusionMatrix.getPossibleCorrections(originalChar, fieldType)

                for (correctedChar in possibleCorrections) {
                    if (correctedChar != originalChar) {
                        val correctedValue = value.toCharArray().apply { this[i] = correctedChar }.joinToString("")
                        val confidence = CharacterConfusionMatrix.getCorrectionConfidence(
                            originalChar, correctedChar, fieldType, value
                        )
                        candidates.add(correctedValue to confidence)
                    }
                }
            }

            // Multi-character corrections (up to 2 characters for performance)
            if (value.length <= 15) { // Only for shorter fields to avoid combinatorial explosion
                for (i in value.indices) {
                    for (j in i + 1 until value.indices.last) {
                        val char1 = value[i]
                        val char2 = value[j]

                        val corrections1 = CharacterConfusionMatrix.getPossibleCorrections(char1, fieldType)
                        val corrections2 = CharacterConfusionMatrix.getPossibleCorrections(char2, fieldType)

                        for (corrected1 in corrections1) {
                            for (corrected2 in corrections2) {
                                if (corrected1 != char1 || corrected2 != char2) {
                                    val correctedValue = value.toCharArray().apply {
                                        this[i] = corrected1
                                        this[j] = corrected2
                                    }.joinToString("")

                                    val confidence1 = CharacterConfusionMatrix.getCorrectionConfidence(
                                        char1, corrected1, fieldType, value
                                    )
                                    val confidence2 = CharacterConfusionMatrix.getCorrectionConfidence(
                                        char2, corrected2, fieldType, value
                                    )
                                    // Average confidence for multi-char corrections
                                    val avgConfidence = (confidence1 + confidence2) / 2f

                                    candidates.add(correctedValue to avgConfidence)
                                }
                            }
                        }
                    }
                }
            }

            return candidates.sortedByDescending { it.second }.take(maxCandidates)
        }

        /**
         * Generate basic correction candidates using simple character confusion rules
         */
        private fun generateBasicCorrectionCandidates(
            value: String,
            fieldType: CharacterConfusionMatrix.FieldType
        ): List<Pair<String, Float>> {
            val candidates = mutableSetOf<Pair<String, Float>>()

            // Basic confusion pairs based on common OCR errors
            val confusionPairs = mapOf(
                'O' to '0', '0' to 'O',
                'I' to '1', '1' to 'I',
                'B' to '8', '8' to 'B',
                'S' to '5', '5' to 'S',
                'Z' to '2', '2' to 'Z',
                'G' to '6', '6' to 'G'
            )

            // Single character corrections
            for (i in value.indices) {
                val originalChar = value[i]
                confusionPairs[originalChar]?.let { correctedChar ->
                    // Check if this correction is valid for the field type
                    if (isCharValidForFieldType(correctedChar, fieldType)) {
                        val correctedValue = value.toCharArray().apply { this[i] = correctedChar }.joinToString("")
                        candidates.add(correctedValue to 0.8f) // High confidence for basic corrections
                    }
                }
            }

            // Apply the same biasing logic for document numbers
            val candidateList = candidates.toList()
            return if (fieldType == CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER) {
                applyDocumentNumberDigitBias(candidateList)
            } else {
                candidateList.sortedByDescending { it.second }
            }
        }

        /**
         * Apply document number digit bias
         * Prioritizes combinations with more digits (specifically 0, 1, 8, 5, 2)
         */
        private fun applyDocumentNumberDigitBias(
            combinations: List<Pair<String, Float>>
        ): List<Pair<String, Float>> {
            return combinations.sortedWith { (combination1, confidence1), (combination2, confidence2) ->
                // First priority: confidence
                val confidenceDiff = confidence2.compareTo(confidence1)
                if (confidenceDiff != 0) return@sortedWith confidenceDiff

                // Second priority: number of specific digits (0, 1, 8, 5, 2) - prioritize more digits
                val digitCounts1 = arrayOf(
                    combination1.count { it == '0' },
                    combination1.count { it == '1' },
                    combination1.count { it == '8' },
                    combination1.count { it == '5' },
                    combination1.count { it == '2' }
                )
                val digitCounts2 = arrayOf(
                    combination2.count { it == '0' },
                    combination2.count { it == '1' },
                    combination2.count { it == '8' },
                    combination2.count { it == '5' },
                    combination2.count { it == '2' }
                )

                for (i in digitCounts1.indices) {
                    if (digitCounts1[i] != digitCounts2[i]) {
                        return@sortedWith digitCounts2[i] - digitCounts1[i]
                    }
                }
                0
            }
        }

        /**
         * Check if a character is valid for a specific field type
         */
        private fun isCharValidForFieldType(char: Char, fieldType: CharacterConfusionMatrix.FieldType): Boolean {
            return when (fieldType) {
                CharacterConfusionMatrix.FieldType.DATE,
                CharacterConfusionMatrix.FieldType.CHECK_DIGIT -> char.isDigit() || char == '<'
                CharacterConfusionMatrix.FieldType.COUNTRY_CODE,
                CharacterConfusionMatrix.FieldType.NAME,
                CharacterConfusionMatrix.FieldType.GENDER -> char.isLetter() || char == '<'
                CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER,
                CharacterConfusionMatrix.FieldType.MIXED -> char.isLetterOrDigit() || char == '<'
            }
        }
    }

    // Lazy initialization of combination checker
    private val combinationChecker by lazy { CombinationChecker() }

    /**
     * Correct a field value using check digit validation with advanced combination checking
     */
    private fun correctWithCheckDigit(
        value: String,
        checkChar: Char,
        fieldType: CharacterConfusionMatrix.FieldType
    ): String {
        val checkDigit = parseCheckDigit(checkChar) ?: return value
        val calculatedCheckDigit = calculateCheckDigit(value)

        // If the check digit is correct, return original value
        if (calculatedCheckDigit == checkDigit) {
            debug("Check digit valid for '$value': $checkDigit")
            return value
        }

        debug("Check digit mismatch for '$value': calculated=$calculatedCheckDigit, expected=$checkDigit")

        // Use combination checker to find valid corrections
        val validCombinations = combinationChecker.getValidCombinations(
            value, checkDigit, fieldType
        )

        return if (validCombinations.isNotEmpty()) {
            val (bestCandidate, confidence) = validCombinations.first()
            debug("Corrected '$value' to '$bestCandidate' with confidence $confidence")
            bestCandidate
        } else {
            debug("No valid correction found for '$value', returning original")
            value
        }
    }

    /**
     * Attempt enhanced TD3 correction using combination checking across all fields
     */
    private fun attemptTD3EnhancedCorrection(
        candidate: MRZCandidate,
        currentFields: Map<String, String>
    ): CorrectedMRZ? {
        val line1 = candidate.lines[0]
        val line2 = candidate.lines[1]

        debug("=== Attempting TD3 Enhanced Correction ===")

        // Extract original field values and their check digits
        val originalFields = mapOf(
            "document_number" to line2.substring(0, 9),
            "doc_check" to line2[9],
            "date_of_birth" to line2.substring(13, 19),
            "dob_check" to line2[19],
            "expiry_date" to line2.substring(21, 27),
            "expiry_check" to line2[27],
            "personal_number" to line2.substring(28, 42),
            "personal_check" to line2[42]
        )

        debug("Original fields: $originalFields")

        // Generate all valid combinations for each field
        val documentNumber = originalFields["document_number"] as String
        val docCheckChar = originalFields["doc_check"] as Char
        val dateOfBirth = originalFields["date_of_birth"] as String
        val dobCheckChar = originalFields["dob_check"] as Char
        val expiryDate = originalFields["expiry_date"] as String
        val expiryCheckChar = originalFields["expiry_check"] as Char
        val personalNumber = originalFields["personal_number"] as String
        val personalCheckChar = originalFields["personal_check"] as Char

        val docCombinations = combinationChecker.getValidCombinations(
            documentNumber,
            parseCheckDigit(docCheckChar) ?: return null,
            CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER,
            maxCandidates = MRZScanConfig.maxCorrectionCandidates
        )

        val dobCombinations = combinationChecker.getValidCombinations(
            dateOfBirth,
            parseCheckDigit(dobCheckChar) ?: return null,
            CharacterConfusionMatrix.FieldType.DATE,
            maxCandidates = MRZScanConfig.maxCorrectionCandidates
        )

        val expiryCombinations = combinationChecker.getValidCombinations(
            expiryDate,
            parseCheckDigit(expiryCheckChar) ?: return null,
            CharacterConfusionMatrix.FieldType.DATE,
            maxCandidates = MRZScanConfig.maxCorrectionCandidates
        )

        val personalCombinations = if (personalCheckChar != '<') {
            combinationChecker.getValidCombinations(
                personalNumber,
                parseCheckDigit(personalCheckChar) ?: return null,
                CharacterConfusionMatrix.FieldType.MIXED,
                maxCandidates = MRZScanConfig.maxCorrectionCandidates
            )
        } else {
            listOf(personalNumber to 1.0f)
        }

        debug("Doc combinations: ${docCombinations.size}")
        debug("DOB combinations: ${dobCombinations.size}")
        debug("Expiry combinations: ${expiryCombinations.size}")
        debug("Personal combinations: ${personalCombinations.size}")

        // Try all combinations to find one that validates completely
        for ((docCandidate, docConf) in docCombinations) {
            for ((dobCandidate, dobConf) in dobCombinations) {
                for ((expiryCandidate, expiryConf) in expiryCombinations) {
                    for ((personalCandidate, personalConf) in personalCombinations) {

                        // Build test fields with corrections
                        val testFields = currentFields.toMutableMap()
                        testFields["document_number"] = docCandidate
                        testFields["date_of_birth"] = dobCandidate
                        testFields["expiry_date"] = expiryCandidate
                        testFields["personal_number"] = personalCandidate

                        // Build test MRZ lines
                        val testLine1 = buildTD3Line1(testFields)
                        val testLine2 = buildTD3Line2(testFields)

                        // Validate the combination
                        if (validateTD3Checksums(testLine1, testLine2)) {
                            val avgConfidence = (docConf + dobConf + expiryConf + personalConf) / 4f
                            debug("✅ Found valid TD3 combination with confidence $avgConfidence")
                            debug("  Doc: $docCandidate, DOB: $dobCandidate, Expiry: $expiryCandidate")

                            return CorrectedMRZ(
                                lines = listOf(testLine1, testLine2),
                                confidence = avgConfidence,
                                checksumValid = true,
                                fieldConfidences = mapOf(
                                    "document_number" to docConf,
                                    "date_of_birth" to dobConf,
                                    "expiry_date" to expiryConf,
                                    "personal_number" to personalConf
                                )
                            )
                        }
                    }
                }
            }
        }

        debug("No valid TD3 combination found")
        return null
    }

    /**
     * Attempt enhanced TD1 correction using combination checking across all fields
     */
    private fun attemptTD1EnhancedCorrection(
        candidate: MRZCandidate,
        currentFields: Map<String, String>
    ): CorrectedMRZ? {
        val line1 = candidate.lines[0]
        val line2 = candidate.lines[1]

        debug("=== Attempting TD1 Enhanced Correction ===")

        // Extract original field values and their check digits
        val isExtended = line1[14] == '<'
        val originalFields = if (isExtended) {
            mapOf(
                "document_number" to (line1.substring(5, 14) + line1.substring(15, 30).takeWhile { it != '<' }),
                "doc_check" to '<',
                "date_of_birth" to line2.substring(0, 6),
                "dob_check" to line2[6],
                "expiry_date" to line2.substring(8, 14),
                "expiry_check" to line2[14]
            )
        } else {
            mapOf(
                "document_number" to line1.substring(5, 14),
                "doc_check" to line1[14],
                "date_of_birth" to line2.substring(0, 6),
                "dob_check" to line2[6],
                "expiry_date" to line2.substring(8, 14),
                "expiry_check" to line2[14]
            )
        }

        debug("Original TD1 fields: $originalFields")
        debug("Is extended format: $isExtended")

        // Generate valid combinations for each field
        val documentNumber = originalFields["document_number"] as String
        val docCheckChar = originalFields["doc_check"] as Char
        val dateOfBirth = originalFields["date_of_birth"] as String
        val dobCheckChar = originalFields["dob_check"] as Char
        val expiryDate = originalFields["expiry_date"] as String
        val expiryCheckChar = originalFields["expiry_check"] as Char

        val docCombinations = if (!isExtended) {
            combinationChecker.getValidCombinations(
                documentNumber,
                parseCheckDigit(docCheckChar) ?: return null,
                CharacterConfusionMatrix.FieldType.DOCUMENT_NUMBER,
                maxCandidates = MRZScanConfig.maxCorrectionCandidates
            )
        } else {
            listOf(documentNumber to 1.0f)
        }

        val dobCombinations = combinationChecker.getValidCombinations(
            dateOfBirth,
            parseCheckDigit(dobCheckChar) ?: return null,
            CharacterConfusionMatrix.FieldType.DATE,
            maxCandidates = MRZScanConfig.maxCorrectionCandidates
        )

        val expiryCombinations = combinationChecker.getValidCombinations(
            expiryDate,
            parseCheckDigit(expiryCheckChar) ?: return null,
            CharacterConfusionMatrix.FieldType.DATE,
            maxCandidates = MRZScanConfig.maxCorrectionCandidates
        )

        debug("Doc combinations: ${docCombinations.size}")
        debug("DOB combinations: ${dobCombinations.size}")
        debug("Expiry combinations: ${expiryCombinations.size}")

        // Try all combinations to find one that validates completely
        for ((docCandidate, docConf) in docCombinations) {
            for ((dobCandidate, dobConf) in dobCombinations) {
                for ((expiryCandidate, expiryConf) in expiryCombinations) {

                    // Build test fields with corrections
                    val testFields = currentFields.toMutableMap()
                    testFields["document_number"] = docCandidate
                    testFields["date_of_birth"] = dobCandidate
                    testFields["expiry_date"] = expiryCandidate

                    // Build test MRZ lines
                    val testLine1 = buildTD1Line1(testFields)
                    val testLine2 = buildTD1Line2(testFields)

                    // Validate the combination
                    if (validateTD1Checksums(testLine1, testLine2)) {
                        val avgConfidence = (docConf + dobConf + expiryConf) / 3f
                        debug("✅ Found valid TD1 combination with confidence $avgConfidence")
                        debug("  Doc: $docCandidate, DOB: $dobCandidate, Expiry: $expiryCandidate")

                        val correctedLine3 = "".padEnd(30, '<')

                        return CorrectedMRZ(
                            lines = listOf(testLine1, testLine2, correctedLine3),
                            confidence = avgConfidence,
                            checksumValid = true,
                            fieldConfidences = mapOf(
                                "document_number" to docConf,
                                "date_of_birth" to dobConf,
                                "expiry_date" to expiryConf
                            )
                        )
                    }
                }
            }
        }

        debug("No valid TD1 combination found")
        return null
    }

    /**
     * Correct country code
     */
    private fun correctCountryCode(code: String): String {
        // List of common country codes for validation
        val validCodes = setOf(
           "AFG","ALB","DZA","ASM","AND","AGO","AIA","ATA","ATG","ARG","ARM","ABW","AUS","AUT","AZE","BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BMU","BTN","BOL","BIH","BWA","BVT","BRA","IOT","BRN","BGR","BFA","BDI","KHM","CMR","CAN","CPV","CYM","CAF","TCD","CHL","CHN","CXR","CCK","COL","COM","COG","COD","COK","CRI","CIV","HRV","CUB","CYP","CZE","DNK","DJI","DMA","DOM","ECU","EGY","SLV","GNQ","ERI","EST","ETH","FLK","FRO","FJI","FIN","FRA","GUF","PYF","ATF","GAB","GMB","GEO","D<<","GHA","GIB","GRC","GRL","GRD","GLP","GUM","GTM","GIN","GNB","GUY","HTI","HMD","VAT","HND","HKG","HUN","ISL","IND","IDN","IRN","IRQ","IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","PRK","KOR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE","LTU","LUX","MAC","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MTQ","MRT","MUS","MYT","MEX","FSM","MDA","MCO","MNG","MSR","MAR","MOZ","MMR","NAM","NRU","NPL","NLD","NCL","NZL","NIC","NER","NGA","NIU","NFK","MNP","MKD","NOR","OMN","PAK","PLW","PSE","PAN","PNG","PRY","PER","PHL","PCN","POL","PRT","PRI","QAT","REU","ROU","RUS","RWA","SHN","KNA","LCA","SPM","VCT","WSM","SMR","STP","SAU","SEN","SYC","SLE","SGP","SVK","SVN","SLB","SOM","ZAF","SGS","ESP","LKA","SDN","SUR","SJM","SWZ","SWE","CHE","SYR","TWN","TJK","TZA","THA","TLS","TGO","TKL","TON","TTO","TUN","TUR","TKM","TCA","TUV","UGA","UKR","ARE","GBR","USA","UMI","URY","UZB","VUT","VEN","VNM","VGB","VIR","WLF","ESH","YEM","ZMB","ZWE","ALA","BES","CUW","GGY","IMN","JEY","MNE","BLM","MAF","SRB","SXM","SSD","XKX"
        )

        if (code in validCodes) return code

        // Try to correct using confusion matrix
        val candidates = if (MRZScanConfig.enableAdvancedCorrection) {
            CharacterConfusionMatrix.generateCorrectionCandidates(
                code,
                CharacterConfusionMatrix.FieldType.COUNTRY_CODE,
                maxCandidates = MRZScanConfig.maxCorrectionCandidates
            )
        } else {
            listOf(code to 1.0f)
        }

        for ((candidate, _) in candidates) {
            if (candidate in validCodes) {
                debug("Corrected country code '$code' to '$candidate'")
                return candidate
            }
        }

        return code
    }

    /**
     * Correct gender field
     */
    private fun correctGender(char: Char): String {
        return when (char) {
            'M', 'N', 'H' -> "M"
            'F', 'E', 'P' -> "F"
            else -> "<"
        }
    }

    /**
     * Helper functions for building MRZ lines
     */
    private fun buildTD3Line1(fields: Map<String, String>): String {
        val docType = fields["document_type"] ?: "P"
        val country = fields["issuing_country"] ?: "UTO"
        val names = fields["names"] ?: ""

        // Build the corrected line, preserving the names field exactly as is
        return "$docType<$country$names".padEnd(44, '<').take(44)
    }

    private fun buildTD3Line2(fields: Map<String, String>): String {
        // Get original line2 to preserve optional data fields
        val originalLine2 = fields["original_line2"] ?: ""

        val docNumber = (fields["document_number"] ?: "").padEnd(9, '<')
        val docCheck = calculateCheckDigit(docNumber).toString()
        val nationality = fields["nationality"] ?: "UTO"
        val dob = fields["date_of_birth"] ?: "000000"
        val dobCheck = calculateCheckDigit(dob).toString()
        val sex = fields["sex"] ?: "<"
        val expiry = fields["expiry_date"] ?: "000000"
        val expiryCheck = calculateCheckDigit(expiry).toString()

        // Preserve personal number and any optional data from original line
        val personal = if (originalLine2.length >= 42) {
            // Extract the personal number portion (positions 28-41) from original, preserving optional fields
            originalLine2.substring(28, 42)
        } else {
            (fields["personal_number"] ?: "").padEnd(14, '<')
        }

        // Calculate personal check digit if needed
        val personalCheck = if (originalLine2.length >= 43) {
            // Preserve original check digit
            originalLine2[42].toString()
        } else {
            if (personal.all { it == '<' }) "<" else calculateCheckDigit(personal).toString()
        }

        val line2 = "$docNumber$docCheck$nationality$dob$dobCheck$sex$expiry$expiryCheck$personal$personalCheck"

        // Calculate overall check digit
        val overallData = "$docNumber$docCheck$dob$dobCheck$expiry$expiryCheck$personal$personalCheck"
        val overallCheck = calculateCheckDigit(overallData).toString()

        return "$line2$overallCheck".padEnd(44, '<').take(44)
    }

    private fun buildTD1Line1(fields: Map<String, String>): String {
        val originalLine1 = fields["original_line1"] ?: ""

        val docType = fields["document_type"] ?: "I<"
        val country = fields["issuing_country"] ?: "UTO"
        val documentNumber = fields["document_number"] ?: ""

        // If the document number is longer than 9 characters,
        // then it means it's an extended document number,
        // so we need to add the extra "<" in between the first 9 characters and the rest
        val docNumber = if (documentNumber.length > 9) {
            documentNumber.take(9).padEnd(9, '<') + "<" + documentNumber.substring(9).padEnd(15, '<')
        } else {
            documentNumber.padEnd(9, '<')
        }
        val docCheck = calculateCheckDigit(docNumber).toString()

        // Preserve optional data from original line (positions 15-29)
        val optional = if (originalLine1.length >= 30) {
            originalLine1.substring(15, 30)
        } else {
            "".padEnd(15, '<')
        }

        return "$docType$country$docNumber$docCheck$optional".take(30)
    }

    private fun buildTD1Line2(fields: Map<String, String>): String {
        val originalLine2 = fields["original_line2"] ?: ""

        val dob = fields["date_of_birth"] ?: "000000"
        val dobCheck = calculateCheckDigit(dob).toString()
        val sex = fields["sex"] ?: "<"
        val expiry = fields["expiry_date"] ?: "000000"
        val expiryCheck = calculateCheckDigit(expiry).toString()
        val nationality = fields["nationality"] ?: "UTO"

        // Preserve optional data from original line (positions 18-28)
        val optional = if (originalLine2.length >= 29) {
            originalLine2.substring(18, 29)
        } else {
            "".padEnd(11, '<')
        }

        // Calculate composite check digit
        val compositeData = fields["document_number"]?.take(9)?.padEnd(9, '<') ?: "<<<<<<<<<" +
                           calculateCheckDigit(fields["document_number"] ?: "").toString() +
                           dob + dobCheck + expiry + expiryCheck + optional
        val compositeCheck = calculateCheckDigit(compositeData).toString()

        return "$dob$dobCheck$sex$expiry$expiryCheck$nationality$optional$compositeCheck".take(30)
    }

    private fun calculateTD3CompositeCheckDigit(line2: String): Int {
        val overallData = line2.substring(0, 10) + line2.substring(13, 20) + line2.substring(21, 43)
        return calculateCheckDigit(overallData)
    }

    /**
     * Validate TD3 checksums
     */
    private fun validateTD3Checksums(line1: String, line2: String): Boolean {
        if (line1.length != 44 || line2.length != 44) return false

        return try {
            // Validate individual check digits
            val docNumber = line2.substring(0, 9)
            val docCheck = parseCheckDigit(line2[9]) ?: return false
            if (calculateCheckDigit(docNumber) != docCheck) return false

            val dob = line2.substring(13, 19)
            val dobCheck = parseCheckDigit(line2[19]) ?: return false
            if (calculateCheckDigit(dob) != dobCheck) return false

            val expiry = line2.substring(21, 27)
            val expiryCheck = parseCheckDigit(line2[27]) ?: return false
            if (calculateCheckDigit(expiry) != expiryCheck) return false

            //calculateTD3CompositeCheckDigit(line2) == parseCheckDigit(line2[43]) ?: return false
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun calculateTD1CompositeCheckDigit(line1: String, line2: String): Int {
        // Line 0: indices 5-29 (inclusive) - document number + check + issuing state + name
        val line0Part = line1.substring(5, 30)

        // Line 1: DOB (0-6), DOE (8-14), indices 18-28 (but not 7, 15-17)
        val dobWithCheck = line2.substring(0, 7) // 0-6
        val doeWithCheck = line2.substring(8, 15) // 8-14
        val line1Part = line2.substring(18, 29) // 18-28

        val compositeData = line0Part + dobWithCheck + doeWithCheck + line1Part
        return calculateCheckDigit(compositeData)
    }

    /**
     * Validate TD1 checksums (first 2 lines only)
     */
    private fun validateTD1Checksums(line1: String, line2: String): Boolean {
        if (line1.length != 30 || line2.length != 30) return false

        return try {
            // Check if extended document number
            val isExtended = line1[14] == '<'

            if (!isExtended) {
                // Validate document number check digit
                val docNumber = line1.substring(5, 14)
                val docCheck = parseCheckDigit(line1[14]) ?: return false
                if (calculateCheckDigit(docNumber) != docCheck) return false
            }

            // Validate date of birth
            val dob = line2.substring(0, 6)
            val dobCheck = parseCheckDigit(line2[6]) ?: return false
            if (calculateCheckDigit(dob) != dobCheck) return false

            // Validate expiry date
            val expiry = line2.substring(8, 14)
            val expiryCheck = parseCheckDigit(line2[14]) ?: return false
            if (calculateCheckDigit(expiry) != expiryCheck) return false

            val calculatedComposite = calculateTD1CompositeCheckDigit(line1, line2)
            val actualComposite = parseCheckDigit(line2[29]) ?: return false

            //calculatedComposite == actualComposite
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Utility functions
     */
    private fun containsMRZCharacters(text: String): Boolean {
        val validChars = setOf(
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
            'U', 'V', 'W', 'X', 'Y', 'Z', '<'
        )

        return text.count { it in validChars } > 10
    }

    private fun normalizeLineLength(text: String, targetLength: Int): String {
        return when {
            text.length > targetLength -> text.take(targetLength)
            text.length < targetLength -> text.padEnd(targetLength, '<')
            else -> text
        }
    }

    private fun removeNonMRZCharacters(text: String): String {
        val validChars = setOf(
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
            'U', 'V', 'W', 'X', 'Y', 'Z', '<'
        )

        return text.filter { it in validChars }
    }

    // Not used as we cannot get the bounding box from the Tesseract
    private fun areLinesSimilar(line1: LineWithConfidence, line2: LineWithConfidence, isTD1: Boolean): Boolean {
        val box1 = line1.boundingBox ?: return true
        val box2 = line2.boundingBox ?: return true

        val verticalGap = abs(box2.top - box1.bottom)
        // TD1 MRZ are more compact, so we allow a smaller gap (smaller than half the line height)
        // While TD3 MRZ are more spread out, so we allow a larger gap (should be the same height as the line)
        val percentage = if (isTD1) 0.5f else 1.2f
        val expectedGap = box1.height() * percentage  // Allow up to 50% of line height as gap (TD1) or 120% (TD3)

        // Check the gap between the lines is less than 50% of the line height
        // and also check each line have a similar height and width (within 10% of the average)
        val averageHeight = (box1.height() + box2.height()) / 2
        val averageWidth = (box1.width() + box2.width()) / 2
        debug("areLinesSimilar: verticalGap: $verticalGap, expectedGap: $expectedGap, averageHeight: $averageHeight, averageWidth: $averageWidth")
        return verticalGap < expectedGap &&
               abs(box1.height() - averageHeight) < averageHeight * 0.1f &&
               abs(box2.height() - averageHeight) < averageHeight * 0.1f
    }

    private fun parseCheckDigit(char: Char): Int? {
        return when {
            char.isDigit() -> char.toString().toInt()
            char == 'O' -> 0
            char == '<' -> 0  // Filler treated as 0 for check digit
            else -> null
        }
    }

    private fun calculateCheckDigit(value: String): Int {
        val weights = intArrayOf(7, 3, 1)
        val charValues = mapOf(
            '0' to 0, '1' to 1, '2' to 2, '3' to 3, '4' to 4,
            '5' to 5, '6' to 6, '7' to 7, '8' to 8, '9' to 9,
            '<' to 0,
            'A' to 10, 'B' to 11, 'C' to 12, 'D' to 13, 'E' to 14,
            'F' to 15, 'G' to 16, 'H' to 17, 'I' to 18, 'J' to 19,
            'K' to 20, 'L' to 21, 'M' to 22, 'N' to 23, 'O' to 24,
            'P' to 25, 'Q' to 26, 'R' to 27, 'S' to 28, 'T' to 29,
            'U' to 30, 'V' to 31, 'W' to 32, 'X' to 33, 'Y' to 34, 'Z' to 35
        )

        var sum = 0
        for (i in value.indices) {
            val charValue = charValues[value[i]] ?: 0
            sum += charValue * weights[i % 3]
        }

        return sum % 10
    }

    private fun calculateOverallConfidence(fieldConfidences: Map<String, Float>): Float {
        return if (fieldConfidences.isEmpty()) {
            0.5f  // Default confidence
        } else {
            fieldConfidences.values.average().toFloat()
        }
    }

    /**
     * Reset the processor state (useful for restarting scanning)
     */
    fun reset() {
        multiFrameAggregator.reset()
        debug("Enhanced MRZ Processor state reset")
    }

    /**
     * Clean up resources
     */
    fun release() {
        try {
            if (tesseractEngine != null) {
                TesseractEngineManager.releaseEngine()
                tesseractEngine = null
                debug("TesseractEngine reference released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing TesseractEngine: ${e.message}")
        }

        try {
            if (mlKitEngine != null) {
                mlKitEngine?.close()
                mlKitEngine = null
                debug("MLKitEngine closed and released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing MLKitEngine: ${e.message}")
        }

        multiFrameAggregator.reset()
        debug("Enhanced MRZ Processor released")
        debug("Engine status: ${TesseractEngineManager.getStatus()}")
    }

    /**
     * Data classes
     */
    data class LineWithConfidence(
        val text: String,
        val confidence: Float,
        val boundingBox: android.graphics.Rect?
    )

    data class MRZCandidate(
        val lines: List<String>,
        val confidence: Float,
        val format: MRZFormat
    )

    data class CorrectedMRZ(
        val lines: List<String>,
        val confidence: Float,
        val checksumValid: Boolean,
        val fieldConfidences: Map<String, Float>
    )

    enum class MRZFormat {
        TD1,  // ID Card
        TD3   // Passport
    }

    /**
     * Callback interface
     */
    interface MRZProcessingCallback {
        fun onMRZExtracted(mrz: String, confidence: Float)
        fun onMRZSeen()
        fun onMRZNotFound()
        fun onProcessingFrame()
        fun onError(exception: Exception)
        fun onMRZLinesDetected(lines: List<String>)
        fun onValidChecksumFrame()
        fun onProgressUpdate(currentFrames: Int, requiredFrames: Int)
        fun onBestValidGroupMRZ(mrzLines: List<String>, mrz: String, confidence: Float)
    }
}
