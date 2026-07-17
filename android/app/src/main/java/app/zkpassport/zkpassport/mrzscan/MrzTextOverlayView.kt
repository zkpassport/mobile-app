package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.util.AttributeSet
import android.util.Log
import android.view.View

/**
 * Custom view that overlays recognized MRZ text lines on the camera preview
 * Adapts to TD1 (3 lines) or TD3 (2 lines) format automatically
 */
class MrzTextOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    companion object {
        private const val TAG = "MrzTextOverlayView"
        private const val DEBUG = true

        // Placeholder MRZ examples (from ICAO specs)
        private val PLACEHOLDER_TD3 = listOf(
            "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
            "L898902C36UTO7408122F1204159ZE184226B<<<<<10"
        )

        private val PLACEHOLDER_TD1 = listOf(
            "I<UTOD231458907<<<<<<<<<<<<<<<",
            "7408122F1204159UTO<<<<<<<<<<<6",
            "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"
        )
    }

    // Paint objects for drawing text
    // Note: Text size is calculated dynamically in onDraw based on guide rectangle width
    private val textPaint = Paint().apply {
        // Make the text semi-transparent
        color = Color.argb(220, Color.red(MRZScanConfig.overlayTextColor), Color.green(MRZScanConfig.overlayTextColor), Color.blue(MRZScanConfig.overlayTextColor))
        typeface = getOcrBTypeface()
        isAntiAlias = true
        isFakeBoldText = false
    }

    // Paint for dimmed (non-highlighted) text
    private val dimmedTextPaint = Paint().apply {
        // Use same color as normal text but with reduced opacity (30% of original)
        color = Color.argb(66, Color.red(MRZScanConfig.overlayTextColor), Color.green(MRZScanConfig.overlayTextColor), Color.blue(MRZScanConfig.overlayTextColor))
        typeface = getOcrBTypeface()
        isAntiAlias = true
        isFakeBoldText = false
    }

    private val backgroundPaint = Paint().apply {
        color = Color.argb(0, 0, 0, 0)
        isAntiAlias = true
    }

    private val placeholderPaint = Paint().apply {
        color = Color.argb(220,255,255,255)
        typeface = getOcrBTypeface()
        isAntiAlias = true
        isFakeBoldText = false
    }

    // Cached calculated text size (recalculated when guide rect changes)
    private var calculatedTextSize: Float = 0f

    // MRZ data
    private var mrzLines: List<String> = emptyList()
    private var documentType: DocumentType = DocumentType.UNKNOWN
    private var isVisible: Boolean = false
    private var showPlaceholder: Boolean = true
    private var placeholderDocumentType: DocumentType = DocumentType.TD3 // Default to TD3
    private var isConfirmationMode: Boolean = false  // Enhanced background for confirmation

    // Layout dimensions
    private var guideRect: Rect = Rect()

    enum class DocumentType {
        TD1,    // 3 lines (ID cards)
        TD3,    // 2 lines (passports)
        UNKNOWN
    }

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    // Cached typeface to avoid repeated loading
    private var cachedOcrBTypeface: Typeface? = null

    /**
     * Get OCR-B-like typeface for MRZ text display
     * Fallback to MONOSPACE if OCR-B is not available
     */
    private fun getOcrBTypeface(): Typeface {
        // Return cached typeface if available
        cachedOcrBTypeface?.let { return it }

        val typeface = try {
            // Try to load OCR-B.otf from assets
            Typeface.createFromAsset(context.assets, "fonts/OCR-B.otf")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load OCR-B.otf font, falling back to MONOSPACE: ${e.message}")
            try {
                // Fallback: try .ttf extension
                Typeface.createFromAsset(context.assets, "fonts/OCR-B.ttf")
            } catch (e2: Exception) {
                Log.w(TAG, "Failed to load OCR-B.ttf font, using MONOSPACE: ${e2.message}")
                Typeface.MONOSPACE
            }
        }

        cachedOcrBTypeface = typeface
        return typeface
    }

    /**
     * Update the MRZ text overlay with new recognized lines
     */
    fun updateMrzLines(lines: List<String>) {
        if (lines == mrzLines) return // No change needed

        mrzLines = lines
        documentType = detectDocumentType(lines)
        isVisible = lines.isNotEmpty() && lines.any { it.isNotBlank() }
        showPlaceholder = false // Hide placeholder when actual MRZ is detected

        debug("Updated MRZ overlay - Type: $documentType, Lines: ${lines.size}, Visible: $isVisible")
        lines.forEachIndexed { index, line ->
            debug("  Line ${index + 1}: '${line.take(20)}${if (line.length > 20) "..." else ""}'")
        }

        // Trigger redraw
        invalidate()
    }

    /**
     * Set the guide rectangle bounds for positioning the overlay
     */
    fun setGuideRect(rect: Rect) {
        guideRect = rect
        // Recalculate text size when guide rect changes
        recalculateTextSize()
        debug("Guide rect updated: $rect, calculated text size: $calculatedTextSize")
        invalidate()
    }

    /**
     * Calculate the optimal text size to fit MRZ text within the guide rectangle
     * Uses the guide rectangle width as reference for proportional scaling
     */
    private fun recalculateTextSize() {
        if (guideRect.isEmpty) {
            calculatedTextSize = MRZScanConfig.overlayTextSize * resources.displayMetrics.density
            return
        }

        // Target: text should fill ~92% of guide rectangle width
        val targetWidthFraction = 0.92f
        val targetWidth = guideRect.width() * targetWidthFraction

        // Reference MRZ line (TD3 passport has 44 chars, TD1 ID card has 30 chars)
        // Use TD3 as base since it has more characters
        val referenceText = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" // 44 chars

        // Binary search for optimal text size
        var lowSize = 4f
        var highSize = 100f
        var optimalSize = lowSize

        textPaint.typeface = getOcrBTypeface()

        while (highSize - lowSize > 0.5f) {
            val midSize = (lowSize + highSize) / 2
            textPaint.textSize = midSize
            val measuredWidth = textPaint.measureText(referenceText)

            if (measuredWidth <= targetWidth) {
                optimalSize = midSize
                lowSize = midSize
            } else {
                highSize = midSize
            }
        }

        calculatedTextSize = optimalSize
        debug("Calculated text size: $calculatedTextSize for guide width: ${guideRect.width()}")
    }

    /**
     * Clear the overlay
     */
    fun clearOverlay() {
        mrzLines = emptyList()
        documentType = DocumentType.UNKNOWN
        isVisible = false
        showPlaceholder = true // Show placeholder when no MRZ is detected
        debug("MRZ overlay cleared, showing placeholder")
        invalidate()
    }

    /**
     * Manually control placeholder visibility
     */
    fun setPlaceholderVisible(visible: Boolean) {
        if (showPlaceholder != visible) {
            showPlaceholder = visible
            debug("Placeholder visibility set to: $visible")
            invalidate()
        }
    }

    /**
     * Set the document type for placeholder display
     */
    fun setPlaceholderDocumentType(documentType: String?) {
        val newType = when (documentType?.uppercase()) {
            "TD1", "ID_CARD", "RESIDENCE_PERMIT" -> DocumentType.TD1
            "TD3", "PASSPORT" -> DocumentType.TD3
            else -> DocumentType.TD3 // Default to TD3
        }

        if (placeholderDocumentType != newType) {
            placeholderDocumentType = newType
            debug("Placeholder document type set to: $newType")
            invalidate()
        }
    }

    /**
     * Set confirmation mode for enhanced background visibility
     */
    fun setConfirmationMode(enabled: Boolean) {
        if (isConfirmationMode != enabled) {
            isConfirmationMode = enabled
            debug("Confirmation mode set to: $enabled")
            invalidate()
        }
    }

    /**
     * Detect document type based on line count and content
     */
    private fun detectDocumentType(lines: List<String>): DocumentType {
        return when {
            lines.size >= 3 && lines.take(3).all { it.length >= 25 } -> {
                debug("Detected TD1 format (3+ lines)")
                DocumentType.TD1
            }
            lines.size >= 2 && lines.take(2).all { it.length >= 35 } -> {
                debug("Detected TD3 format (2+ lines)")
                DocumentType.TD3
            }
            else -> {
                debug("Unknown document format")
                DocumentType.UNKNOWN
            }
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (guideRect.isEmpty || !MRZScanConfig.enableMRZOverlay) {
            return
        }

        // Determine what to draw: actual MRZ or placeholder
        val (linesToDraw, paintToUse) = when {
            isVisible && mrzLines.isNotEmpty() -> {
                // Draw actual MRZ lines
                val lines = when (documentType) {
                    DocumentType.TD1 -> mrzLines.take(3)
                    DocumentType.TD3 -> mrzLines.take(2)
                    DocumentType.UNKNOWN -> mrzLines.take(2)
                }
                Pair(lines, textPaint)
            }
            showPlaceholder && MRZScanConfig.showPlaceholderMRZ -> {
                // Draw placeholder MRZ based on selected document type
                val placeholderLines = when (placeholderDocumentType) {
                    DocumentType.TD1 -> PLACEHOLDER_TD1
                    DocumentType.TD3 -> PLACEHOLDER_TD3
                    DocumentType.UNKNOWN -> PLACEHOLDER_TD3 // Default to TD3
                }
                Pair(placeholderLines, placeholderPaint)
            }
            else -> {
                return // Nothing to draw
            }
        }

        if (linesToDraw.isEmpty()) return

        // Recalculate text size if not yet calculated
        if (calculatedTextSize <= 0f) {
            recalculateTextSize()
        }

        // Determine the active document type for sizing
        val activeDocType = if (showPlaceholder) placeholderDocumentType else documentType

        // Calculate text size and line spacing based on document type
        // TD1 (30 chars) needs larger text than TD3 (44 chars) to fill the same width
        val textSizeMultiplier = when (activeDocType) {
            DocumentType.TD1 -> 44f / 30f  // Scale up for shorter lines (30 chars vs 44 chars)
            DocumentType.TD3 -> 1.0f       // Base size calculated for 44 char lines
            DocumentType.UNKNOWN -> 1.0f
        }

        // Apply calculated text size with document-type multiplier
        paintToUse.textSize = calculatedTextSize * textSizeMultiplier

        // Line spacing as a fraction of text size for proportional scaling
        val lineSpacingFraction = when (activeDocType) {
            DocumentType.TD1 -> 0.45f  // Tighter spacing for 3-line TD1
            DocumentType.TD3 -> 0.9f   // More spacing for 2-line TD3
            DocumentType.UNKNOWN -> 0.9f
        }
        val lineSpacing = paintToUse.textSize * lineSpacingFraction

        // Calculate text metrics
        val textBounds = Rect()
        paintToUse.getTextBounds("M", 0, 1, textBounds) // Use 'M' as reference character

        val lineHeight = textBounds.height() + lineSpacing // Add spacing between lines
        val totalTextHeight = lineHeight * linesToDraw.size - lineSpacing // Subtract last line's spacing

        // Center the text block vertically within the guide rectangle
        // Add textBounds.height() for baseline positioning (drawText uses baseline, not top)
        val startY = guideRect.centerY() - (totalTextHeight / 2) + textBounds.height()

        // Calculate text box dimensions with adjusted size
        val textWidth = getMaxLineWidth(linesToDraw, paintToUse)
        val textBoxWidth = textWidth + 16f // Add padding

        // Center the text box within the guide rectangle
        val textBoxStartX = guideRect.centerX() - (textBoxWidth / 2)
        val textStartX = textBoxStartX + 8f // Left-align text within the centered box

        // Draw background rectangle for better readability
        val shouldDrawBackground = (isVisible && mrzLines.isNotEmpty()) || isConfirmationMode
        if (shouldDrawBackground) {
            // Use the entire guide rectangle as background during confirmation mode
            val backgroundRect = if (isConfirmationMode) {
                // Full guide rectangle for confirmation mode
                Rect(guideRect.left, guideRect.top, guideRect.right, guideRect.bottom)
            } else {
                // Just around text for normal mode
                Rect(
                    textBoxStartX.toInt(),
                    (startY - lineHeight - 4).toInt(),
                    (textBoxStartX + textBoxWidth).toInt(),
                    (startY + totalTextHeight + 4).toInt()
                )
            }

            // Use more opaque background during confirmation mode
            if (isConfirmationMode) {
                val confirmationBackgroundPaint = Paint().apply {
                    color = Color.argb(200, 0, 0, 0) // 78% opacity for better readability
                    isAntiAlias = true
                }
                canvas.drawRect(backgroundRect, confirmationBackgroundPaint)
                debug("Drew confirmation mode background covering entire guide rectangle")
            } else {
                canvas.drawRect(backgroundRect, backgroundPaint)
            }
        }

        // Draw each line of MRZ text with field highlighting
        linesToDraw.forEachIndexed { index, line ->
            val y = startY + (index * lineHeight)

            if (isVisible && !showPlaceholder && isConfirmationMode) {
                // Draw with highlighting in confirmation mode for actual MRZ
                drawLineWithHighlighting(canvas, line, textStartX, y, index, paintToUse)
            } else {
                // Draw normally (for placeholder and regular MRZ display)
                canvas.drawText(line, textStartX, y, paintToUse)
            }

            if (showPlaceholder) {
                debug("Drew placeholder line ${index + 1} at (${textStartX.toInt()}, ${y.toInt()})")
            } else {
                debug("Drew line ${index + 1} at (${textStartX.toInt()}, ${y.toInt()}): '${line.take(10)}...'")
            }
        }
    }

    /**
     * Calculate the maximum width needed for the text lines
     */
    private fun getMaxLineWidth(lines: List<String>, paint: Paint = textPaint): Float {
        return lines.maxOfOrNull { paint.measureText(it) } ?: 0f
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // Recalculate text size when view size changes
        recalculateTextSize()
    }

    /**
     * Draw a line with character-level highlighting for important fields
     */
    private fun drawLineWithHighlighting(canvas: Canvas, line: String, startX: Float, y: Float, lineIndex: Int, basePaint: Paint) {
        if (line.isEmpty()) return

        // Get highlight ranges based on document type and line index
        val highlightRanges = getHighlightRanges(lineIndex, line.length)

        var currentX = startX

        // Draw each character with appropriate paint
        line.forEachIndexed { charIndex, char ->
            val paint = when {
                highlightRanges.importantFieldRanges.any { charIndex in it } ||
                highlightRanges.checkDigitRanges.any { charIndex in it } -> {
                    // Keep normal opacity for highlighted fields
                    basePaint.textSize = basePaint.textSize
                    basePaint
                }
                else -> {
                    // Use dimmed paint for non-highlighted characters
                    dimmedTextPaint.textSize = basePaint.textSize
                    dimmedTextPaint
                }
            }

            // Draw the character
            canvas.drawText(char.toString(), currentX, y, paint)

            // Move to next character position
            currentX += paint.measureText(char.toString())
        }

        debug("Drew line with opacity highlighting: ${highlightRanges.importantFieldRanges.size} important fields, ${highlightRanges.checkDigitRanges.size} check digits highlighted (normal opacity), others dimmed")
    }

    /**
     * Data class to hold highlight ranges
     */
    private data class HighlightRanges(
        val importantFieldRanges: List<IntRange>,
        val checkDigitRanges: List<IntRange>
    )

    /**
     * Get highlight ranges for important fields based on document type and line
     */
    private fun getHighlightRanges(lineIndex: Int, lineLength: Int): HighlightRanges {
        val importantFieldRanges = mutableListOf<IntRange>()
        val checkDigitRanges = mutableListOf<IntRange>()

        when (documentType) {
            DocumentType.TD3 -> {
                // TD3 format (passport, 2 lines)
                when (lineIndex) {
                    1 -> { // Second line (index 1)
                        // Document number: positions 0-8
                        importantFieldRanges.add(0..8)
                        // Document number check digit: position 9
                        checkDigitRanges.add(9..9)

                        // Date of birth: positions 13-18
                        importantFieldRanges.add(13..18)
                        // DOB check digit: position 19
                        checkDigitRanges.add(19..19)

                        // Date of expiry: positions 21-26
                        importantFieldRanges.add(21..26)
                        // Expiry check digit: position 27
                        checkDigitRanges.add(27..27)
                    }
                }
            }
            DocumentType.TD1 -> {
                // TD1 format (ID card, 3 lines)
                when (lineIndex) {
                    0 -> { // First line
                        // Check if extended document number format
                        val line = mrzLines.getOrNull(0)
                        if (line != null && lineLength > 14) {
                            val checkChar = line.getOrNull(14)
                            if (checkChar == '<') {
                                // Extended format: document number spans positions 5-13 and continues from 15 until '<' or end
                                importantFieldRanges.add(5..13)

                                // Find where extended document number ends (last non-'<' character before position 30)
                                var extendedEndPos = 14
                                for (i in 15 until minOf(30, lineLength)) {
                                    if (line[i] != '<') {
                                        extendedEndPos = i
                                    } else {
                                        break
                                    }
                                }

                                if (extendedEndPos > 14) {
                                    // Add extended part (excluding the check digit at the end)
                                    importantFieldRanges.add(15 until extendedEndPos)
                                    // Extended document number check digit is at the end of extended part
                                    checkDigitRanges.add(extendedEndPos..extendedEndPos)
                                }
                            } else {
                                // Standard format: document number positions 5-13, check digit at 14
                                importantFieldRanges.add(5..13)
                                if (checkChar != null && checkChar != '<') {
                                    checkDigitRanges.add(14..14)
                                }
                            }
                        } else {
                            // Fallback: standard format
                            importantFieldRanges.add(5..13)
                        }
                    }
                    1 -> { // Second line
                        // Date of birth: positions 0-5
                        importantFieldRanges.add(0..5)
                        // DOB check digit: position 6
                        checkDigitRanges.add(6..6)

                        // Date of expiry: positions 8-13
                        importantFieldRanges.add(8..13)
                        // Expiry check digit: position 14
                        checkDigitRanges.add(14..14)
                    }
                }
            }
            DocumentType.UNKNOWN -> {
                // Try to detect format based on line content and apply TD3 rules as default
                if (lineIndex == 1 && lineLength >= 44) {
                    // Assume TD3 format
                    importantFieldRanges.add(0..8)   // Document number
                    checkDigitRanges.add(9..9)       // Doc check digit
                    importantFieldRanges.add(13..18) // DOB
                    checkDigitRanges.add(19..19)     // DOB check digit
                    importantFieldRanges.add(21..26) // Expiry
                    checkDigitRanges.add(27..27)     // Expiry check digit
                }
            }
        }

        debug("Highlight ranges for line $lineIndex (${documentType}): important=${importantFieldRanges.size}, checks=${checkDigitRanges.size}")

        return HighlightRanges(importantFieldRanges, checkDigitRanges)
    }
}
