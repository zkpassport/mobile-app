package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

class CornerBracketView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint().apply {
        color = 0xFFFFFFFF.toInt() // White
        strokeWidth = 7f
        style = Paint.Style.STROKE
        isAntiAlias = true
        strokeCap = Paint.Cap.ROUND
    }

    private var horizontalLength = 40f // Length of horizontal bracket lines
    private var verticalLength = 40f // Length of vertical bracket lines
    private var horizontalOffset = 0f // Horizontal offset for positioning

    fun setBracketDimensions(horizontal: Float, vertical: Float, offset: Float = 0f) {
        horizontalLength = horizontal
        verticalLength = vertical
        horizontalOffset = offset
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        val halfStroke = paint.strokeWidth / 2f // Half stroke width to prevent cropping at edges

        // Top-left corner
        canvas.drawLine(horizontalOffset + halfStroke, verticalLength, horizontalOffset + halfStroke, halfStroke, paint)
        canvas.drawLine(horizontalOffset + halfStroke, halfStroke, horizontalOffset + horizontalLength, halfStroke, paint)

        // Top-right corner
        canvas.drawLine(w - horizontalOffset - horizontalLength, halfStroke, w - horizontalOffset - halfStroke, halfStroke, paint)
        canvas.drawLine(w - horizontalOffset - halfStroke, halfStroke, w - horizontalOffset - halfStroke, verticalLength, paint)

        // Bottom-left corner
        canvas.drawLine(horizontalOffset + halfStroke, h - verticalLength, horizontalOffset + halfStroke, h - halfStroke, paint)
        canvas.drawLine(horizontalOffset + halfStroke, h - halfStroke, horizontalOffset + horizontalLength, h - halfStroke, paint)

        // Bottom-right corner
        canvas.drawLine(w - horizontalOffset - horizontalLength, h - halfStroke, w - horizontalOffset - halfStroke, h - halfStroke, paint)
        canvas.drawLine(w - horizontalOffset - halfStroke, h - verticalLength, w - horizontalOffset - halfStroke, h - halfStroke, paint)
    }
}
