package app.zkpassport.zkpassport.mrzscan

import android.graphics.Bitmap
import android.util.Log
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import org.opencv.android.OpenCVLoader
import org.opencv.core.CvType

/**
 * OpenCV-based image preprocessing pipeline for MRZ OCR
 * Simplified approach optimized for centered MRZ regions
 */
class OpenCVImagePreprocessor(private val documentType: String? = null) {

    companion object {
        private const val TAG = "OpenCVImagePreprocessor"
        private var openCVLoaded = false

        // Target dimensions for MRZ processing
        // 300 DPI is the gold standard for OCR
        // MRZ character height is ~3mm (0.12"), at 300 DPI = ~36px per char
        private const val TARGET_MRZ_HEIGHT_TD3 = 200   // Passports (2-line)
        private const val TARGET_MRZ_HEIGHT_TD1 = 160   // ID cards (3-line)
        private const val MAX_MRZ_HEIGHT = 240          // Prevent extreme upscaling

        init {
            try {
                System.loadLibrary("opencv_java4")
                openCVLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                openCVLoaded = false
            } catch (e: Exception) {
                openCVLoaded = false
            }
        }

        fun isAvailable(): Boolean = openCVLoaded
    }

    data class PreprocessingConfig(
        val convertToGrayscale: Boolean = true,
        val binarize: Boolean = true,               // Adaptive threshold
        val scaleToDPI: Boolean = true,
        val applyMorphology: Boolean = true,
    )

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    /**
     * Main preprocessing pipeline using OpenCV (Simplified Option B)
     */
    fun preprocessImage(
        bitmap: Bitmap,
        config: PreprocessingConfig = PreprocessingConfig(),
        frameNumber: Int = 0
    ): Bitmap {
        if (!openCVLoaded) {
            Log.w(TAG, "OpenCV not available, returning original bitmap")
            return bitmap
        }

        // Convert Android Bitmap to OpenCV Mat
        val src = Mat()
        Utils.bitmapToMat(bitmap, src)

        var processed = src

        try {

            // Step 1: Convert to grayscale
            if (config.convertToGrayscale) {
                val gray = Mat()
                // https://docs.opencv.org/4.x/d8/d01/group__imgproc__color__conversions.html#gaf86c09fe702ed037c03c2bc603ceab14
                Imgproc.cvtColor(processed, gray, Imgproc.COLOR_BGR2GRAY)
                processed.release()
                processed = gray
            }

            // Step 4: Scale to optimal DPI for OCR
            if (config.scaleToDPI) {
                val originalSize = "${processed.cols()}x${processed.rows()}"
                val scaled = scaleToOptimalSize(processed)
                processed.release()
                processed = scaled
            }

            // Step 7: Adaptive thresholding (binarization)
            if (config.binarize) {
                try {      
                    // Ensure input is valid 8-bit grayscale
                    if (processed.channels() != 1 || processed.depth() != CvType.CV_8U) {
                        debug("⚠️ Step 7: Converting to 8-bit grayscale before binarization (channels=${processed.channels()}, depth=${processed.depth()})")
                        val gray = Mat()
                        if (processed.channels() > 1) {
                            Imgproc.cvtColor(processed, gray, Imgproc.COLOR_BGR2GRAY)
                        } else {
                            processed.convertTo(gray, CvType.CV_8U)
                        }
                        processed.release()
                        processed = gray
                    }

                    val binary = Mat()
                    // Alternate between three sets of values based on frame number
                    // The third value is essentially equivalent to a non-binarized image (i.e. pure grayscale)
                    val blockSizes = listOf(53, 65)
                    val constants = listOf(32.0, 44.0)
                    // Skip the third iteration (i.e. pure grayscale)
                    if (frameNumber % blockSizes.size != 2) {
                        val blockSize = blockSizes[frameNumber % blockSizes.size]
                        val constantC = constants[frameNumber % constants.size]
                        
                        debug("Frame $frameNumber: Using adaptive threshold values - blockSize=$blockSize, C=$constantC")
                        
                        Imgproc.adaptiveThreshold(
                            processed,
                            binary,
                            255.0,                                      // maxValue
                            Imgproc.ADAPTIVE_THRESH_MEAN_C,            // adaptiveMethod (better for MRZ)
                            Imgproc.THRESH_BINARY,                     // thresholdType
                            blockSize,                                  // blockSize alternates between 53 and 65
                            constantC,                                  // C alternates between 32.0 and 44.0
                        )
                        processed.release()
                        processed = binary
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Step 7: Adaptive thresholding failed - ${e.message}", e)
                }
            } else {
                debug("⚠️ Step 7: Binarization skipped (config.binarize = false)")
            }

            // Step 8: Morphological close to reinforce strokes and remove noise
            if (config.applyMorphology && processed.channels() == 1) {
                val morph = Mat()
                val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0))
                Imgproc.morphologyEx(processed, morph, Imgproc.MORPH_CLOSE, kernel)
                processed.release()
                processed = morph
            }

            // Convert OpenCV Mat back to Android Bitmap
            // If Mat is 1-channel (binary/grayscale), convert to BGRA first for proper display
            val finalMat = if (processed.channels() == 1) {
                val bgra = Mat()
                Imgproc.cvtColor(processed, bgra, Imgproc.COLOR_GRAY2RGBA)
                processed.release()
                bgra
            } else {
                processed
            }

            val result = Bitmap.createBitmap(
                finalMat.cols(),
                finalMat.rows(),
                Bitmap.Config.ARGB_8888
            )
            Utils.matToBitmap(finalMat, result)

            if (finalMat != processed) {
                finalMat.release()
            }

            return result

        } catch (e: Exception) {
            Log.e(TAG, "Error in OpenCV preprocessing", e)
            return bitmap
        } finally {
            // Only release if not already released in the conversion logic
            if (!processed.empty()) {
                processed.release()
            }
            src.release()
        }
    }

    /**
     * Scale image to optimal size for OCR
     * Target: ~200px height for TD3, ~160px for TD1, with upper clamp to avoid oversized mats
     */
    private fun scaleToOptimalSize(mat: Mat): Mat {
        val currentHeight = mat.rows()
        val currentWidth = mat.cols()
        val targetHeight = when (documentType?.uppercase()) {
            "TD1" -> TARGET_MRZ_HEIGHT_TD1
            else -> TARGET_MRZ_HEIGHT_TD3
        }

        if (currentHeight < targetHeight) {
            val scaleFactor = targetHeight.toDouble() / currentHeight
            val newWidth = (currentWidth * scaleFactor).toInt()
            val newHeight = targetHeight

            val scaled = Mat()
            Imgproc.resize(
                mat,
                scaled,
                Size(newWidth.toDouble(), newHeight.toDouble()),
                0.0,
                0.0,
                Imgproc.INTER_CUBIC  // High-quality interpolation
            )

            debug("Upscaled ${currentWidth}x${currentHeight} -> ${newWidth}x${newHeight} (factor: ${"%.2f".format(scaleFactor)})")
            return scaled
        }

        if (currentHeight > MAX_MRZ_HEIGHT) {
            val scaleFactor = MAX_MRZ_HEIGHT.toDouble() / currentHeight
            val newWidth = (currentWidth * scaleFactor).toInt()
            val newHeight = MAX_MRZ_HEIGHT

            val scaled = Mat()
            Imgproc.resize(
                mat,
                scaled,
                Size(newWidth.toDouble(), newHeight.toDouble()),
                0.0,
                0.0,
                Imgproc.INTER_AREA  // Downscale preserves detail
            )
            debug("Downscaled ${currentWidth}x${currentHeight} -> ${newWidth}x${newHeight} (factor: ${"%.2f".format(scaleFactor)})")
            return scaled
        }

        debug("No scaling needed (height=$currentHeight within target range)")
        return mat.clone()
    }
}
