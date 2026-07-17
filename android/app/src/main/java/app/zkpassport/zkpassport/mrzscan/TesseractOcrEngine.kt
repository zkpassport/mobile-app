package app.zkpassport.zkpassport.mrzscan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.googlecode.tesseract.android.TessBaseAPI
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Lightweight OCR engine based on Tesseract4Android tuned for OCR-B/MRZ
 * Exposes line-level results with confidence and bounding boxes to plug into existing pipeline.
 */
class TesseractOcrEngine(private val context: Context) {

    data class RecognizedLine(
        val text: String,
        val confidence: Float,
        // Kept for future use, not used in the current implementation
        // as there's no native way to get the bounding box from Tesseract
        val boundingBox: Rect?
    )

    private var tess: TessBaseAPI? = null
    private var dataPath: String = ""
    private var isInitialized: Boolean = false
    
    // Shared thread pool for async OCR operations to prevent thread accumulation
    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }
    
    companion object {
        private const val TAG = "TesseractOcrEngine"
        private var ocrExecutor: ThreadPoolExecutor? = null
        
        /**
         * Get or create the OCR executor
         * Using single thread to prevent excessive CPU usage and memory pressure
         */
        private fun getOrCreateExecutor(): ThreadPoolExecutor {
            if (ocrExecutor == null || ocrExecutor!!.isShutdown || ocrExecutor!!.isTerminated) {
                Log.d(TAG, "Creating new OCR executor with single thread")
                // Use only 1 thread to reduce CPU/memory pressure (was 2)
                ocrExecutor = Executors.newFixedThreadPool(1) as ThreadPoolExecutor
            }
            return ocrExecutor!!
        }
        
        /**
         * Shutdown the OCR executor and cancel all pending tasks
         */
        fun shutdownExecutor() {
            try {
                ocrExecutor?.let { executor ->
                    if (!executor.isShutdown) {
                        executor.shutdownNow() // Cancel running tasks and prevent new ones
                        if (!executor.awaitTermination(2, java.util.concurrent.TimeUnit.SECONDS)) {
                            Log.w(TAG, "OCR executor did not terminate within timeout")
                        }
                        Log.d(TAG, "OCR executor shutdown completed")
                    }
                }
                ocrExecutor = null
            } catch (e: Exception) {
                Log.e(TAG, "Error shutting down OCR executor: ${e.message}")
            }
        }
    }

    fun initialize(): Boolean {
        // Skip initialization if already initialized
        if (isInitialized && tess != null) {
            debug("Tesseract already initialized, skipping")
            return true
        }
        
        return try {
            // Clean up any existing instance first
            close()
            
            dataPath = File(context.filesDir, "tesseract").absolutePath
            ensureTrainedData()

            val api = TessBaseAPI()
            val language = when {
                // trained data from this repo: https://github.com/Shreeshrii/tessdata_ocrb/tree/master
                //File(File(dataPath, "tessdata"), "ocrb.traineddata").exists() -> "ocrb"
                //https://github.com/DoubangoTelecom/tesseractMRZ/blob/master/tessdata_best/mrz.traineddata
                File(File(dataPath, "tessdata"), "mrz.traineddata").exists() -> "mrz"
                else -> "eng"
            }

            debug("Tesseract language: $language")

            if (!api.init(dataPath, language, TessBaseAPI.OEM_LSTM_ONLY)) {
                Log.e(TAG, "Failed to init Tesseract with language: $language")
                isInitialized = false
                return false
            }

            // Whitelist MRZ character set
            api.setVariable(TessBaseAPI.VAR_CHAR_WHITELIST, "ABCDEFGHIJKLMNOPQRSTUVWXYZ<0123456789")
            // Page segmentation optimized for a block of text (MRZ lines)
            api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO_OSD)
            // api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)


            tess = api
            isInitialized = true
            debug("Tesseract successfully initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing Tesseract", e)
            isInitialized = false
            false
        }
    }

    // Returns each line above the confidence level and their confidence
    private fun getLinesAboveConfidence(minConfidence: Int): List<Pair<String, Float>> {
        val api = tess ?: return emptyList()
        val lines = mutableListOf<Pair<String, Float>>()
    
        var iterator: com.googlecode.tesseract.android.ResultIterator? = null
        try {
            iterator = api.getResultIterator()
            if (iterator == null) {
                Log.w(TAG, "Failed to get result iterator from TessBaseAPI")
                return emptyList()
            }
            
            iterator.begin()

            // Iterate to first instance of the target level
            while (!iterator.isAtBeginningOf(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)) {
                if (!iterator.next(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)) {
                    // End of the page, no data
                    return emptyList()
                }
            }

            while (true) {
                try {
                    if (iterator.isAtBeginningOf(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)) {
                        var text = iterator.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)

                        // Trim text of unwanted trailing spaces and line endings
                        text = text?.trimEnd() ?: ""

                        // Add the line if it's above the confidence threshold
                        val confidence = iterator.confidence(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)
                        if (confidence >= minConfidence && text.isNotEmpty()) {
                            lines.add(Pair(text, confidence / 100f))
                        }
                    }

                    if (!iterator.next(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)) {
                        // End of the page, exit the loop
                        break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error during iterator processing: ${e.message}")
                    break // Exit loop on any iterator error
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in getLinesAboveConfidence: ${e.message}")
        } finally {
            // Enhanced cleanup with error handling
            try {
                iterator?.delete()
            } catch (e: Exception) {
                Log.w(TAG, "Error deleting result iterator: ${e.message}")
            }
        }
        return lines
    }

    fun recognize(bitmap: Bitmap, documentType: String? = null): List<RecognizedLine> {
        // Check if engine is still valid before processing
        val api = tess
        if (api == null || !isInitialized) {
            Log.w(TAG, "Tesseract engine not initialized or has been cleaned up")
            return emptyList()
        }

        return try {
            api.setImage(bitmap)

            // Needed to enable the recognition of the lines
            val hocrText = api.getHOCRText(0)
            debug("HOCR text length: ${hocrText?.length ?: 0}")

            // Get raw UTF8 text for debugging
            val rawText = api.utF8Text
            debug("Raw OCR text: '${rawText?.take(200) ?: "(null)"}'")
            debug("Raw text length: ${rawText?.length ?: 0}")


            // Get the lines above the confidence threshold
            // Uses 30% confidence so we can detect better when a potential MRZ has been seen
            // before we can even verify it
            val lines = getLinesAboveConfidence(10)
            debug("Lines above confidence (10%): $lines")

            val results = mutableListOf<RecognizedLine>()
            lines.forEach { line ->
                // For MRZ, we don't have individual line bounding boxes easily accessible
                // We'll use the mean confidence for all lines
                results.add(RecognizedLine(line.first, line.second, null))
            }

            results
        } catch (e: Exception) {
            Log.e(TAG, "Error during Tesseract recognition", e)
            emptyList()
        } finally {
            // Aggressively clear memory after each recognition
            try { 
                if (tess != null && isInitialized) {
                    api.stop()
                    api.clear()
                    debug("Tesseract memory cleared")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error clearing Tesseract memory: ${e.message}")
            }
            
            // Request garbage collection to help with memory pressure
            System.gc()
        }
    }

    /**
     * Async recognition method to match interface expected by EnhancedMRZProcessor
     * Uses pool-based processing for parallel OCR execution
     * @param bitmap The image to recognize
     * @param documentType Optional hint about document type ("TD1" or "TD3")
     * @param callback Callback to receive results
     */
    fun recognizeAsync(bitmap: Bitmap, documentType: String? = null, callback: (List<RecognizedLine>) -> Unit) {
        try {
            // Get executor from the pool manager
            val executor = TesseractEngineManager.getExecutor()
            
            if (executor == null || executor.isShutdown) {
                // Fallback to old behavior if pool executor is not available
                Log.w(TAG, "Pool executor not available, using fallback")
                val fallbackExecutor = getOrCreateExecutor()
                submitRecognitionTask(fallbackExecutor, this, bitmap, documentType, callback)
                return
            }
            
            // Submit task to pool executor
            executor.submit {
                try {
                    // Check for thread interruption (task cancellation)
                    if (Thread.currentThread().isInterrupted) {
                        debug("OCR task was cancelled")
                        return@submit
                    }
                    
                    // Acquire an engine from the pool
                    val pooledEngine = TesseractEngineManager.acquireEngine()
                    
                    if (pooledEngine == null) {
                        Log.w(TAG, "Failed to acquire engine from pool, dropping OCR request")
                        callback(emptyList())
                        return@submit
                    }
                    
                    try {
                        // Use the pooled engine for recognition
                        val results = pooledEngine.recognize(bitmap, documentType)
                        
                        // Check interruption again before callback
                        if (!Thread.currentThread().isInterrupted) {
                            callback(results)
                        }
                    } finally {
                        // Always return the engine to the pool
                        TesseractEngineManager.releaseEngineToPool(pooledEngine)
                    }
                    
                } catch (e: InterruptedException) {
                    debug("OCR task was interrupted")
                    Thread.currentThread().interrupt() // Restore interrupted status
                } catch (e: Exception) {
                    if (!Thread.currentThread().isInterrupted) {
                        Log.e(TAG, "Error in async recognition", e)
                        callback(emptyList())
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit OCR task to pool", e)
            callback(emptyList())
        }
    }
    
    /**
     * Helper method to submit recognition task to an executor
     */
    private fun submitRecognitionTask(
        executor: ThreadPoolExecutor,
        engine: TesseractOcrEngine,
        bitmap: Bitmap,
        documentType: String?,
        callback: (List<RecognizedLine>) -> Unit
    ) {
        executor.submit {
            try {
                if (Thread.currentThread().isInterrupted) {
                    debug("OCR task was cancelled")
                    return@submit
                }
                
                val results = engine.recognize(bitmap, documentType)
                
                if (!Thread.currentThread().isInterrupted) {
                    callback(results)
                }
            } catch (e: InterruptedException) {
                debug("OCR task was interrupted")
                Thread.currentThread().interrupt()
            } catch (e: Exception) {
                if (!Thread.currentThread().isInterrupted) {
                    Log.e(TAG, "Error in async recognition", e)
                    callback(emptyList())
                }
            }
        }
    }

    fun close() {
        if (!isInitialized && tess == null) {
            debug("Tesseract already closed or never initialized")
            return
        }
        
        try { 
            tess?.let { api ->
                debug("Recycling TessBaseAPI")
                api.recycle()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error recycling TessBaseAPI: ${e.message}")
        } finally {
            tess = null
            isInitialized = false
            debug("Tesseract closed and state reset")
        }
    }

    /**
     * Copies traineddata files from assets/tessdata into app files dir if missing.
     * Looks for ocrb.traineddata
     */
    private fun ensureTrainedData() {
        val tessDataDir = File(File(dataPath), "tessdata")
        if (!tessDataDir.exists()) tessDataDir.mkdirs()

        copyIfMissing("tessdata/mrz.traineddata", File(tessDataDir, "mrz.traineddata"))
        //copyIfMissing("tessdata/ocrb.traineddata", File(tessDataDir, "ocrb.traineddata"))
    }

    private fun copyIfMissing(assetPath: String, outFile: File) {
        if (outFile.exists()) return
        try {
            context.assets.open(assetPath).use { input ->
                FileOutputStream(outFile).use { output ->
                    val buffer = ByteArray(8 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                    }
                    output.flush()
                }
            }
            debug("Copied asset $assetPath to ${outFile.absolutePath}")
        } catch (e: Exception) {
            // Asset might not be packaged; log and proceed (engine may fallback)
            Log.w(TAG, "Traineddata asset not found: $assetPath")
        }
    }

}

