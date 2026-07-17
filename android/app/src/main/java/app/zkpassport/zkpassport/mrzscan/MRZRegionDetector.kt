package app.zkpassport.zkpassport.mrzscan

import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.RectF
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.*
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * MRZ Region Detector using Google MLKit
 * 
 * This class detects MRZ (Machine Readable Zone) regions in images using MLKit text recognition.
 * It identifies MRZ-like text lines and combines their bounding boxes to provide a dynamic
 * crop region.
 * 
 * The detector:
 * 1. Runs MLKit text recognition on the input bitmap
 * 2. Filters recognized text for MRZ-like characteristics (length, character set, patterns)
 * 3. Groups consecutive MRZ lines based on vertical proximity
 * 4. Returns a combined bounding box for the detected MRZ region with padding
 * 
 * If no MRZ region is detected, returns null to allow fallback to fixed ROI cropping.
 */
class MRZRegionDetector {

    companion object {
        private const val TAG = "MRZRegionDetector"
        
        // MRZ line length constraints
        private const val TD3_LINE_LENGTH = 44  // Passport
        private const val TD1_LINE_LENGTH = 30  // ID card
        private const val LINE_LENGTH_TOLERANCE = 4
        
        // MRZ character ratio threshold
        private const val MIN_MRZ_CHAR_RATIO = 0.85f
        
        // Padding percentages for the combined bounding box
        private const val HORIZONTAL_PADDING = 0.1f  // 10% padding on each side
        private const val VERTICAL_PADDING = 0.2f    // 20% padding on top and bottom
    }

    data class MRZLine(
        val text: String,
        val bounds: RectF,
        val confidence: Float = 0f
    )

    data class DetectionResult(
        val mrzBounds: RectF?,
        val mrzLines: List<MRZLine>,
        val otherTextBounds: List<RectF>
    )

    private var textRecognizer: TextRecognizer? = null
    private var isInitialized: Boolean = false
    private val detectorScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    /**
     * Initialize MLKit text recognizer
     */
    fun initialize(): Boolean {
        if (isInitialized && textRecognizer != null) {
            return true
        }

        return try {
            close()
            val options = TextRecognizerOptions.Builder().build()
            textRecognizer = TextRecognition.getClient(options)
            isInitialized = true
            debug("MRZ Region Detector initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing MRZ Region Detector", e)
            isInitialized = false
            false
        }
    }

    /**
     * Detect MRZ region in a bitmap asynchronously
     * @param bitmap The input image
     * @param callback Callback with the detection result (null if no MRZ found)
     */
    fun detectMRZRegion(bitmap: Bitmap, callback: (RectF?) -> Unit) {
        val recognizer = textRecognizer
        if (recognizer == null || !isInitialized) {
            Log.w(TAG, "MRZ Region Detector not initialized")
            callback(null)
            return
        }

        detectorScope.launch {
            try {
                val inputImage = InputImage.fromBitmap(bitmap, 0)
                val visionText = recognizeTextSync(recognizer, inputImage)

                val result = if (visionText != null) {
                    findMRZCandidates(visionText, bitmap.width, bitmap.height)
                } else {
                    null
                }

                if (isActive) {
                    withContext(Dispatchers.Main) {
                        callback(result?.mrzBounds)
                    }
                }
            } catch (e: CancellationException) {
                debug("MRZ detection cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "Error detecting MRZ region", e)
                if (isActive) {
                    withContext(Dispatchers.Main) {
                        callback(null)
                    }
                }
            }
        }
    }

    /**
     * Detect MRZ region synchronously (blocking)
     * @param bitmap The input image
     * @return The MRZ bounding box or null if not found
     */
    fun detectMRZRegionSync(bitmap: Bitmap): RectF? {
        val recognizer = textRecognizer
        if (recognizer == null || !isInitialized) {
            Log.w(TAG, "MRZ Region Detector not initialized")
            return null
        }

        return try {
            runBlocking {
                val inputImage = InputImage.fromBitmap(bitmap, 0)
                val visionText = recognizeTextSync(recognizer, inputImage)
                visionText?.let { findMRZCandidates(it, bitmap.width, bitmap.height)?.mrzBounds }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in sync MRZ detection", e)
            null
        }
    }

    /**
     * Perform synchronous text recognition using MLKit
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
                    Log.e(TAG, "MLKit text recognition failed", e)
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
     * Find MRZ candidate regions from MLKit recognition results
     */
    private fun findMRZCandidates(visionText: Text, imageWidth: Int, imageHeight: Int): DetectionResult {
        val mrzLines = mutableListOf<MRZLine>()
        val otherTextBounds = mutableListOf<RectF>()

        // Process each text block and line
        for (block in visionText.textBlocks) {
            for (line in block.lines) {
                val text = line.text
                    .uppercase()
                    .replace(" ", "")

                val boundingBox = line.boundingBox
                if (boundingBox != null) {
                    // Convert Rect to RectF normalized to image dimensions
                    val normalizedBounds = RectF(
                        boundingBox.left.toFloat() / imageWidth,
                        boundingBox.top.toFloat() / imageHeight,
                        boundingBox.right.toFloat() / imageWidth,
                        boundingBox.bottom.toFloat() / imageHeight
                    )

                    if (isMRZLikeLine(text)) {
                        debug("MRZ-like text detected: $text at $normalizedBounds")
                        mrzLines.add(MRZLine(text, normalizedBounds))
                    } else {
                        otherTextBounds.add(normalizedBounds)
                    }
                }
            }
        }

        if (mrzLines.isEmpty()) {
            return DetectionResult(null, emptyList(), otherTextBounds)
        }

        // Sort by Y position (top to bottom)
        mrzLines.sortBy { it.bounds.top }

        // Try to find TD3 (2 lines of 44 chars) first, then TD1 (3 lines of 30 chars)
        var mrzBounds = findMRZGroup(mrzLines, expectedLines = 2, lineLength = TD3_LINE_LENGTH)
        if (mrzBounds == null) {
            mrzBounds = findMRZGroup(mrzLines, expectedLines = 3, lineLength = TD1_LINE_LENGTH)
        }

        // Fallback: return combined bounds of all MRZ-like lines if we have at least 2
        if (mrzBounds == null && mrzLines.size >= 2) {
            mrzBounds = combineBounds(mrzLines.map { it.bounds })
        }

        return DetectionResult(mrzBounds, mrzLines, otherTextBounds)
    }

    /**
     * Check if a text line looks like MRZ
     */
    private fun isMRZLikeLine(text: String): Boolean {
        // Check for high proportion of MRZ characters
        val mrzChars = setOf(
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
            'U', 'V', 'W', 'X', 'Y', 'Z',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            '<'
        )
        val mrzCharCount = text.count { it in mrzChars }
        val mrzRatio = mrzCharCount.toFloat() / text.length

        // Should be mostly MRZ characters
        if (mrzRatio < MIN_MRZ_CHAR_RATIO) {
            return false
        }

        // Should contain '<' (filler character)
        if (!text.contains('<')) {
            return false
        }

        // Check for MRZ-like patterns
        val hasDocType = text.startsWith("P") || text.startsWith("I") ||
                        text.startsWith("A") || text.startsWith("C")
        val hasFillers = text.count { it == '<' } >= 2

        return hasDocType || hasFillers
    }

    /**
     * Find a group of MRZ lines with expected count and length
     */
    private fun findMRZGroup(lines: List<MRZLine>, expectedLines: Int, lineLength: Int): RectF? {
        val matchingLines = lines.filter { line ->
            abs(line.text.length - lineLength) <= LINE_LENGTH_TOLERANCE
        }

        if (matchingLines.size < expectedLines) {
            return null
        }

        // Find consecutive lines that are close together vertically
        var bestGroup: List<MRZLine> = emptyList()

        for (i in matchingLines.indices) {
            val group = mutableListOf(matchingLines[i])

            for (j in (i + 1) until matchingLines.size) {
                val prevBounds = group.last().bounds
                val currBounds = matchingLines[j].bounds

                // Check if lines are close vertically (within reasonable MRZ line spacing)
                val verticalGap = abs(currBounds.top - prevBounds.bottom)
                val expectedGap = prevBounds.height() * 0.5f  // Lines should be close

                if (verticalGap < expectedGap * 3) {
                    group.add(matchingLines[j])
                }

                if (group.size >= expectedLines) {
                    break
                }
            }

            if (group.size >= expectedLines && group.size > bestGroup.size) {
                bestGroup = group.take(expectedLines)
            }
        }

        if (bestGroup.size < expectedLines) {
            return null
        }

        return combineBounds(bestGroup.map { it.bounds })
    }

    /**
     * Combine multiple bounding boxes into one with padding
     */
    private fun combineBounds(bounds: List<RectF>): RectF? {
        if (bounds.isEmpty()) {
            return null
        }

        var minX = bounds[0].left
        var minY = bounds[0].top
        var maxX = bounds[0].right
        var maxY = bounds[0].bottom

        for (rect in bounds.drop(1)) {
            minX = min(minX, rect.left)
            minY = min(minY, rect.top)
            maxX = max(maxX, rect.right)
            maxY = max(maxY, rect.bottom)
        }

        // Add padding
        val width = maxX - minX
        val height = maxY - minY
        val paddingX = width * HORIZONTAL_PADDING
        val paddingY = height * VERTICAL_PADDING

        return RectF(
            max(0f, minX - paddingX),
            max(0f, minY - paddingY),
            min(1f, maxX + paddingX),
            min(1f, maxY + paddingY)
        )
    }

    /**
     * Crop a bitmap to the detected MRZ bounds
     * @param bitmap The source bitmap
     * @param mrzBounds Normalized bounds (0-1 range)
     * @return Cropped bitmap or original if cropping fails
     */
    fun cropToMRZBounds(bitmap: Bitmap, mrzBounds: RectF): Bitmap {
        return try {
            // Convert normalized bounds to pixel coordinates
            val cropLeft = (mrzBounds.left * bitmap.width).toInt().coerceIn(0, bitmap.width - 1)
            val cropTop = (mrzBounds.top * bitmap.height).toInt().coerceIn(0, bitmap.height - 1)
            val cropWidth = ((mrzBounds.right - mrzBounds.left) * bitmap.width).toInt()
                .coerceAtLeast(1)
                .coerceAtMost(bitmap.width - cropLeft)
            val cropHeight = ((mrzBounds.bottom - mrzBounds.top) * bitmap.height).toInt()
                .coerceAtLeast(1)
                .coerceAtMost(bitmap.height - cropTop)

            if (cropWidth <= 0 || cropHeight <= 0) {
                debug("Invalid crop dimensions, returning original bitmap")
                return bitmap
            }

            val croppedBitmap = Bitmap.createBitmap(
                bitmap,
                cropLeft,
                cropTop,
                cropWidth,
                cropHeight
            )

            debug("Cropped to MRZ bounds: ${croppedBitmap.width}x${croppedBitmap.height}")
            croppedBitmap
        } catch (e: Exception) {
            Log.e(TAG, "Error cropping to MRZ bounds: ${e.message}", e)
            bitmap
        }
    }

    /**
     * Close and clean up resources
     */
    fun close() {
        try {
            detectorScope.cancel()
            textRecognizer?.close()
            textRecognizer = null
            isInitialized = false
            debug("MRZ Region Detector closed")
        } catch (e: Exception) {
            Log.w(TAG, "Error closing MRZ Region Detector: ${e.message}")
        }
    }
}

