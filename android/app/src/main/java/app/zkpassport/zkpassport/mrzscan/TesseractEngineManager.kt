package app.zkpassport.zkpassport.mrzscan

import android.app.ActivityManager
import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Singleton manager for TesseractOcrEngine pool with adaptive sizing based on available memory.
 * Uses multiple engine instances for parallel OCR processing to improve performance.
 */
object TesseractEngineManager {
    private const val TAG = "TesseractEngineManager"
    
    // Memory thresholds for pool sizing (in bytes)
    private const val MEMORY_THRESHOLD_4_ENGINES = 400_000_000L  // 400MB
    private const val MEMORY_THRESHOLD_3_ENGINES = 200_000_000L  // 200MB
    private const val MEMORY_THRESHOLD_2_ENGINES = 100_000_000L  // 100MB
    
    // Estimated memory per Tesseract engine instance (conservative estimate)
    private const val ESTIMATED_MEMORY_PER_ENGINE = 80_000_000L  // 80MB
    
    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }
    
    private fun info(message: String) {
        Log.i(TAG, message)
    }
    
    // Engine pool
    private val enginePool = mutableListOf<TesseractOcrEngine>()
    private var engineQueue: LinkedBlockingQueue<TesseractOcrEngine>? = null
    private var executor: ThreadPoolExecutor? = null
    
    private var isInitialized: Boolean = false
    private var referenceCount: Int = 0
    private var poolSize: Int = 0
    
    /**
     * Get memory information and calculate available memory
     * @param context Context needed to access ActivityManager for system memory info
     */
    private fun getMemoryInfo(context: Context): MemoryInfo {
        // JVM Heap Memory (App-specific)
        val runtime = Runtime.getRuntime()
        val maxMemory = runtime.maxMemory()
        val totalMemory = runtime.totalMemory()
        val freeMemory = runtime.freeMemory()
        val usedMemory = totalMemory - freeMemory
        val availableMemory = maxMemory - usedMemory

        // System Memory (Device-wide)
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val systemMemInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(systemMemInfo)

        val systemAvailableMem = systemMemInfo.availMem
        val systemTotalMem = systemMemInfo.totalMem
        val isLowMemory = systemMemInfo.lowMemory
        val threshold = systemMemInfo.threshold

        return MemoryInfo(
            maxMemory = maxMemory,
            totalMemory = totalMemory,
            usedMemory = usedMemory,
            freeMemory = freeMemory,
            availableMemory = availableMemory,
            systemAvailableMemory = systemAvailableMem,
            systemTotalMemory = systemTotalMem,
            isLowMemory = isLowMemory,
            lowMemoryThreshold = threshold
        )
    }
    
    /**
     * Calculate optimal pool size based on available memory and config settings
     */
    private fun calculateOptimalPoolSize(availableMemory: Long): Int {
        // If parallel OCR is disabled, always use single engine
        if (!MRZScanConfig.enableParallelOCR) {
            info("Parallel OCR disabled, using single engine")
            return 1
        }
        
        val memoryBasedSize = when {
            availableMemory > MEMORY_THRESHOLD_4_ENGINES -> 4
            availableMemory > MEMORY_THRESHOLD_3_ENGINES -> 3
            availableMemory > MEMORY_THRESHOLD_2_ENGINES -> 2
            else -> 1
        }
        
        // Respect min and max pool size from config
        val poolSize = memoryBasedSize.coerceIn(
            MRZScanConfig.minOcrPoolSize,
            MRZScanConfig.maxOcrPoolSize
        )
        
        info("Memory-based pool sizing: ${availableMemory / 1_000_000}MB available -> " +
             "$memoryBasedSize engines (capped to $poolSize by config)")
        return poolSize
    }
    
    /**
     * Log detailed memory usage
     */
    private fun logMemoryUsage(prefix: String, context: Context) {
        val memInfo = getMemoryInfo(context)
        
        info("$prefix - JVM Heap Memory: " +
             "Max=${memInfo.maxMemory / 1_000_000}MB, " +
             "Total=${memInfo.totalMemory / 1_000_000}MB, " +
             "Used=${memInfo.usedMemory / 1_000_000}MB, " +
             "Free=${memInfo.freeMemory / 1_000_000}MB, " +
             "Available=${memInfo.availableMemory / 1_000_000}MB")
        
        info("$prefix - Device RAM: " +
             "Total=${memInfo.systemTotalMemory / 1_000_000}MB, " +
             "Available=${memInfo.systemAvailableMemory / 1_000_000}MB, " +
             "Low Memory=${memInfo.isLowMemory}, " +
             "Threshold=${memInfo.lowMemoryThreshold / 1_000_000}MB")
    }
    
    /**
     * Get a shared TesseractEngine instance, initializing pool if necessary
     * Returns a pool-managed engine for backward compatibility
     */
    fun getEngine(context: Context): TesseractOcrEngine? {
        synchronized(this) {
            if (!isInitialized || enginePool.isEmpty()) {
                logMemoryUsage("Before engine pool initialization", context)
                
                val memInfo = getMemoryInfo(context)
                val optimalPoolSize = calculateOptimalPoolSize(memInfo.availableMemory)
                
                if (!initializePool(context, optimalPoolSize)) {
                    Log.e(TAG, "Failed to initialize engine pool")
                    return null
                }
                
                logMemoryUsage("After engine pool initialization", context)
            }
            
            referenceCount++
            debug("TesseractEngine acquired, reference count: $referenceCount, pool size: $poolSize")
            
            // Return the first engine for backward compatibility
            // The pool is used internally by recognizeAsync
            return enginePool.firstOrNull()
        }
    }
    
    /**
     * Initialize the engine pool with specified size
     */
    private fun initializePool(context: Context, size: Int): Boolean {
        try {
            debug("Initializing Tesseract engine pool with size: $size")
            
            // Clean up any existing pool first
            cleanupPool()
            
            poolSize = size
            enginePool.clear()
            
            // Create engines
            repeat(size) { index ->
                debug("Creating engine ${index + 1}/$size")
                val engine = TesseractOcrEngine(context.applicationContext)
                
                if (engine.initialize()) {
                    enginePool.add(engine)
                    debug("Engine ${index + 1} initialized successfully")
                    logMemoryUsage("After engine ${index + 1} initialization", context)
                } else {
                    Log.e(TAG, "Failed to initialize engine ${index + 1}")
                    // Clean up partially initialized pool
                    cleanupPool()
                    return false
                }
            }
            
            // Create queue with all engines
            engineQueue = LinkedBlockingQueue(enginePool)
            
            // Create thread pool executor
            executor = ThreadPoolExecutor(
                size,  // core pool size
                size,  // max pool size
                60L,   // keep alive time
                TimeUnit.SECONDS,
                LinkedBlockingQueue<Runnable>()
            ).apply {
                // Allow core threads to timeout
                allowCoreThreadTimeOut(true)
            }
            
            isInitialized = true
            info("Tesseract engine pool initialized successfully with $size engines")
            
            // Update adaptive processing interval based on pool size
            MRZScanConfig.updateIntervalForPoolSize(size)
            
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing engine pool", e)
            cleanupPool()
            return false
        }
    }
    
    /**
     * Get an engine from the pool for async processing
     * Blocks until an engine is available
     */
    internal fun acquireEngine(): TesseractOcrEngine? {
        val queue = engineQueue ?: return null
        return try {
            queue.take().also {
                debug("Engine acquired from pool, ${queue.size} engines remaining")
            }
        } catch (e: InterruptedException) {
            debug("Interrupted while waiting for engine")
            Thread.currentThread().interrupt()
            null
        }
    }
    
    /**
     * Return an engine to the pool after processing
     */
    internal fun releaseEngineToPool(engine: TesseractOcrEngine) {
        try {
            val queue = engineQueue
            if (queue != null) {
                queue.offer(engine)
                debug("Engine returned to pool, ${queue.size} engines available")
            } else {
                debug("Engine queue is null, dropping returned engine")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error returning engine to pool: ${e.message}")
        }
    }
    
    /**
     * Get the thread pool executor for async tasks
     */
    internal fun getExecutor(): ThreadPoolExecutor? {
        return executor
    }
    
    /**
     * Release a reference to the TesseractEngine pool
     * The pool is only closed when all references are released
     */
    fun releaseEngine() {
        synchronized(this) {
            referenceCount--
            debug("TesseractEngine released, reference count: $referenceCount")
            
            // Immediately cleanup when no references remain to prevent race conditions
            if (referenceCount <= 0) {
                referenceCount = 0
                debug("No more references, performing immediate cleanup")
                forceCleanup()
            }
        }
    }
    
    /**
     * Force cleanup of the TesseractEngine pool (e.g., on app termination or memory pressure)
     */
    fun forceCleanup(context: Context? = null) {
        synchronized(this) {
            debug("Force cleanup of TesseractEngine pool")
            context?.let { logMemoryUsage("Before pool cleanup", it) }
            
            cleanupPool()
            
            context?.let { logMemoryUsage("After pool cleanup", it) }
            
            // Request garbage collection to help reclaim memory
            System.gc()
        }
    }
    
    /**
     * Internal cleanup of pool resources
     */
    private fun cleanupPool() {
        // Shutdown executor first
        val exec = executor
        var executorTerminated = true
        if (exec != null) {
            try {
                if (!exec.isShutdown) {
                    exec.shutdown()
                }
                if (!exec.awaitTermination(5, TimeUnit.SECONDS)) {
                    Log.w(TAG, "Executor did not terminate within timeout, forcing shutdown")
                    exec.shutdownNow()
                    if (!exec.awaitTermination(5, TimeUnit.SECONDS)) {
                        Log.w(TAG, "Executor still running after forced shutdown")
                        executorTerminated = false
                    }
                }
                if (executorTerminated && exec.isTerminated) {
                    debug("Executor shutdown completed")
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                executorTerminated = false
                Log.w(TAG, "Interrupted while shutting down executor")
            } catch (e: Exception) {
                executorTerminated = false
                Log.w(TAG, "Error shutting down executor: ${e.message}")
            } finally {
                executor = null
            }
        } else {
            executor = null
        }
        
        if (!executorTerminated) {
            Log.w(TAG, "Skipping engine close because executor threads are still running")
            return
        }

        // Also shutdown the static executor in TesseractOcrEngine
        try {
            TesseractOcrEngine.shutdownExecutor()
        } catch (e: Exception) {
            Log.w(TAG, "Error shutting down OCR executor: ${e.message}")
        }
        
        // Close all engines
        enginePool.forEach { engine ->
            try {
                engine.close()
            } catch (e: Exception) {
                Log.w(TAG, "Error closing engine: ${e.message}")
            }
        }
        
        enginePool.clear()
        engineQueue?.clear()
        engineQueue = null
        isInitialized = false
        poolSize = 0
        
        debug("Pool cleanup completed")
    }
    
    
    /**
     * Get engine status for debugging
     */
    fun getStatus(context: Context? = null): String {
        synchronized(this) {
            return if (context != null) {
                val memInfo = getMemoryInfo(context)
                "Pool Size: $poolSize, " +
                       "Initialized: $isInitialized, " +
                       "References: $referenceCount, " +
                       "Available Engines: ${engineQueue?.size ?: 0}, " +
                       "Active Tasks: ${executor?.activeCount ?: 0}, " +
                       "JVM Available: ${memInfo.availableMemory / 1_000_000}MB, " +
                       "Device Available: ${memInfo.systemAvailableMemory / 1_000_000}MB"
            } else {
                "Pool Size: $poolSize, " +
                       "Initialized: $isInitialized, " +
                       "References: $referenceCount, " +
                       "Available Engines: ${engineQueue?.size ?: 0}, " +
                       "Active Tasks: ${executor?.activeCount ?: 0}"
            }
        }
    }
    
    /**
     * Data class for memory information
     */
    data class MemoryInfo(
        // JVM Heap Memory (App-specific)
        val maxMemory: Long,
        val totalMemory: Long,
        val usedMemory: Long,
        val freeMemory: Long,
        val availableMemory: Long,
        
        // System Memory (Device-wide)
        val systemAvailableMemory: Long,
        val systemTotalMemory: Long,
        val isLowMemory: Boolean,
        val lowMemoryThreshold: Long
    )
}
