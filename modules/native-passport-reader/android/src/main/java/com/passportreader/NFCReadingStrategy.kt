package com.passportreader

import android.util.Log

/**
 * Data class representing retry event information for UI feedback.
 */
data class RetryEventInfo(
    val operationName: String,
    val currentAttempt: Int,
    val maxAttempts: Int,
    val estimatedWaitMs: Long,
    val errorMessage: String?
)

/**
 * Result of an operation with retry metadata.
 */
sealed class OperationResult<T> {
    data class Success<T>(val value: T, val attemptsTaken: Int) : OperationResult<T>()
    data class Failure<T>(val exception: Exception, val attemptsTaken: Int, val wasConnectionLost: Boolean) : OperationResult<T>()
}

/**
 * Callback interface for retry events to enable UI feedback.
 */
interface RetryEventListener {
    fun onRetryAttempt(info: RetryEventInfo)
    fun onOperationSuccess(operationName: String, attemptsTaken: Int)
    fun onOperationFailure(operationName: String, attemptsTaken: Int, isFatal: Boolean)
}

/**
 * Enhanced utility class to manage adaptive NFC reading strategies.
 * Provides intelligent retry management with UI feedback capabilities.
 */
class NFCReadingStrategy {
    
    companion object {
        private const val TAG = "NFCReadingStrategy"
        
        // Data reading sizes in order of preference (most reliable first)
        private val DATA_LENGTHS = intArrayOf(160, 224, 256) // 0xA0, 0xE0, 0xFF
        
        // Timeout configurations for different operations (initial values)
        private val TIMEOUT_CONFIGS = mapOf(
            "authentication" to 8000,   // 8 seconds for auth - faster initial response
            "data_reading" to 10000,    // 10 seconds for data reading
            "connection" to 5000,       // 5 seconds for initial connection
            "optional" to 5000          // 5 seconds for optional data groups
        )
        
        // Maximum timeout escalation
        private const val MAX_TIMEOUT_ESCALATION = 20000 // 20 seconds max
        
        // Retry configuration
        private const val BASE_RETRY_DELAY_MS = 300L    // Reduced from 500ms
        private const val MAX_RETRY_DELAY_MS = 3000L    // Reduced from 8000ms
        private const val JITTER_RANGE_MS = 100L        // Reduced from 200ms
        
        // Fast failure thresholds
        private const val CONSECUTIVE_OPTIONAL_FAILURES_THRESHOLD = 2
        private const val CONNECTION_LOST_THRESHOLD = 2
    }
    
    private var currentDataLengthIndex = 0
    private var successfulReads = 0
    private var failedReads = 0
    private var devicePerformanceScore = 100 // 0-100, higher is better
    private var consecutiveOptionalFailures = 0
    private var consecutiveConnectionLosses = 0
    private var retryEventListener: RetryEventListener? = null
    
    /**
     * Set a listener for retry events (for UI feedback)
     */
    fun setRetryEventListener(listener: RetryEventListener?) {
        retryEventListener = listener
    }
    
    /**
     * Get the current recommended data length for reading operations
     */
    fun getCurrentDataLength(): Int {
        return DATA_LENGTHS[currentDataLengthIndex]
    }
    
    /**
     * Get initial timeout for specific operation type
     */
    fun getInitialTimeout(operationType: String): Int {
        return TIMEOUT_CONFIGS[operationType] ?: 8000
    }
    
    /**
     * Get escalated timeout based on retry attempt
     */
    fun getEscalatedTimeout(operationType: String, attempt: Int): Int {
        val baseTimeout = getInitialTimeout(operationType)
        // Escalate timeout by 50% for each retry attempt
        val escalatedTimeout = (baseTimeout * (1 + (attempt * 0.5))).toInt()
        return minOf(escalatedTimeout, MAX_TIMEOUT_ESCALATION)
    }
    
    /**
     * Calculate retry delay with reduced exponential backoff
     */
    fun calculateRetryDelay(attempt: Int, useExponentialBackoff: Boolean = true): Long {
        if (!useExponentialBackoff) {
            return BASE_RETRY_DELAY_MS + (Math.random() * JITTER_RANGE_MS).toLong()
        }
        
        // Faster exponential backoff: base * 1.5^attempt + jitter
        val exponentialDelay = (BASE_RETRY_DELAY_MS * Math.pow(1.5, (attempt - 1).toDouble())).toLong()
        val delayWithCap = minOf(exponentialDelay, MAX_RETRY_DELAY_MS)
        val jitter = (Math.random() * JITTER_RANGE_MS).toLong()
        
        return delayWithCap + jitter
    }
    
    /**
     * Report a successful read operation
     */
    fun reportSuccess(operationName: String = "unknown") {
        successfulReads++
        consecutiveOptionalFailures = 0
        consecutiveConnectionLosses = 0
        
        // If we're having consistent success, try to optimize for speed
        if (successfulReads >= 3 && devicePerformanceScore > 80) {
            optimizeForSpeed()
        }
        
        updateDeviceScore()
        Log.d(TAG, "Success reported for $operationName. Current strategy: dataLength=${getCurrentDataLength()}, score=$devicePerformanceScore")
    }
    
    /**
     * Report a failed read operation with the specific error
     */
    fun reportFailure(error: Exception, operationName: String = "unknown", isOptional: Boolean = false) {
        failedReads++
        
        if (isOptional) {
            consecutiveOptionalFailures++
        }
        
        if (isConnectionError(error)) {
            consecutiveConnectionLosses++
        } else {
            consecutiveConnectionLosses = 0
        }
        
        // Analyze the error and adjust strategy
        when {
            isTimeoutError(error) -> handleTimeoutError()
            isConnectionError(error) -> handleConnectionError()
            isAuthenticationError(error) -> handleAuthenticationError()
            isDataError(error) -> handleDataError()
            else -> handleGenericError()
        }
        
        updateDeviceScore()
        Log.w(TAG, "Failure reported for $operationName: ${error.message}. Adjusted strategy: dataLength=${getCurrentDataLength()}, score=$devicePerformanceScore")
    }
    
    /**
     * Check if we should skip remaining optional data groups
     */
    fun shouldSkipOptionalDataGroups(): Boolean {
        return consecutiveOptionalFailures >= CONSECUTIVE_OPTIONAL_FAILURES_THRESHOLD
    }
    
    /**
     * Check if connection appears to be lost permanently
     */
    fun isConnectionLikelyLost(): Boolean {
        return consecutiveConnectionLosses >= CONNECTION_LOST_THRESHOLD
    }
    
    /**
     * Reset strategy to most conservative settings
     */
    fun resetToConservative() {
        currentDataLengthIndex = 0
        devicePerformanceScore = 50
        consecutiveOptionalFailures = 0
        consecutiveConnectionLosses = 0
        Log.d(TAG, "Strategy reset to conservative mode")
    }
    
    /**
     * Full reset for new scan session
     */
    fun resetForNewScan() {
        currentDataLengthIndex = 0
        successfulReads = 0
        failedReads = 0
        devicePerformanceScore = 100
        consecutiveOptionalFailures = 0
        consecutiveConnectionLosses = 0
        Log.d(TAG, "Strategy reset for new scan")
    }
    
    /**
     * Get recommended retry count based on current performance and operation type
     */
    fun getRecommendedRetryCount(isCritical: Boolean = false, isOptional: Boolean = false): Int {
        return when {
            isOptional -> 1 // Fast fail for optional DGs
            isCritical -> when {
                devicePerformanceScore >= 80 -> 3
                devicePerformanceScore >= 60 -> 4
                else -> 5
            }
            else -> when {
                devicePerformanceScore >= 80 -> 2
                devicePerformanceScore >= 60 -> 3
                else -> 3
            }
        }
    }
    
    /**
     * Get recommended retry delay based on current performance
     */
    fun getRecommendedRetryDelay(): Long {
        return when {
            devicePerformanceScore >= 80 -> 300L   // 0.3 seconds
            devicePerformanceScore >= 60 -> 500L   // 0.5 second
            else -> 800L                           // 0.8 seconds
        }
    }
    
    /**
     * Check if watchdog should be used based on device performance
     */
    fun shouldUseWatchdog(): Boolean {
        return devicePerformanceScore < 90 // Use watchdog for less reliable devices
    }
    
    /**
     * Notify listener of a retry attempt
     */
    fun notifyRetryAttempt(operationName: String, currentAttempt: Int, maxAttempts: Int, waitMs: Long, errorMessage: String?) {
        retryEventListener?.onRetryAttempt(
            RetryEventInfo(operationName, currentAttempt, maxAttempts, waitMs, errorMessage)
        )
    }
    
    /**
     * Notify listener of operation success
     */
    fun notifyOperationSuccess(operationName: String, attemptsTaken: Int) {
        retryEventListener?.onOperationSuccess(operationName, attemptsTaken)
    }
    
    /**
     * Notify listener of operation failure
     */
    fun notifyOperationFailure(operationName: String, attemptsTaken: Int, isFatal: Boolean) {
        retryEventListener?.onOperationFailure(operationName, attemptsTaken, isFatal)
    }
    
    /**
     * Classify an exception for retry decision making
     */
    fun classifyException(error: Exception): ExceptionType {
        return when {
            isConnectionError(error) -> ExceptionType.CONNECTION_LOST
            isProtocolError(error) -> ExceptionType.PROTOCOL_ERROR  // PICC errors need connection reset
            isTimeoutError(error) -> ExceptionType.RETRYABLE_IO
            isAuthenticationError(error) -> ExceptionType.RETRYABLE_AUTH
            isNonRetryableError(error) -> ExceptionType.NON_RETRYABLE
            else -> ExceptionType.RETRYABLE_TRANSIENT
        }
    }
    
    enum class ExceptionType {
        RETRYABLE_IO,           // Network timeouts, temporary communication issues
        RETRYABLE_AUTH,         // Authentication failures that might succeed on retry
        RETRYABLE_TRANSIENT,    // Other transient errors that may resolve
        PROTOCOL_ERROR,         // PICC/chip protocol errors - need connection recovery
        NON_RETRYABLE,          // Permanent failures, wrong credentials, invalid data
        CONNECTION_LOST         // Connection issues requiring recovery
    }
    
    private fun optimizeForSpeed() {
        // Only optimize if we're not already at the fastest setting
        if (currentDataLengthIndex < DATA_LENGTHS.size - 1) {
            currentDataLengthIndex++
            Log.d(TAG, "Optimizing for speed: dataLength=${getCurrentDataLength()}")
        }
    }
    
    private fun optimizeForReliability() {
        // Move to more conservative settings
        if (currentDataLengthIndex > 0) {
            currentDataLengthIndex--
            Log.d(TAG, "Optimizing for reliability: dataLength=${getCurrentDataLength()}")
        }
    }
    
    private fun handleTimeoutError() {
        // Timeout issues usually mean we need smaller data chunks or longer timeouts
        optimizeForReliability()
        devicePerformanceScore = maxOf(20, devicePerformanceScore - 15)
    }
    
    private fun handleConnectionError() {
        // Connection issues are more serious
        optimizeForReliability()
        devicePerformanceScore = maxOf(10, devicePerformanceScore - 25)
    }
    
    private fun handleAuthenticationError() {
        // Authentication errors might be recoverable but indicate issues
        devicePerformanceScore = maxOf(30, devicePerformanceScore - 20)
    }
    
    private fun handleDataError() {
        // Data reading issues might benefit from smaller chunks
        optimizeForReliability()
        devicePerformanceScore = maxOf(30, devicePerformanceScore - 10)
    }
    
    private fun handleGenericError() {
        // Conservative response to unknown errors
        optimizeForReliability()
        devicePerformanceScore = maxOf(40, devicePerformanceScore - 5)
    }
    
    private fun updateDeviceScore() {
        val totalOperations = successfulReads + failedReads
        if (totalOperations > 0) {
            val successRate = (successfulReads.toFloat() / totalOperations) * 100
            // Weighted average: 70% current score, 30% recent success rate
            devicePerformanceScore = ((devicePerformanceScore * 0.7) + (successRate * 0.3)).toInt()
            devicePerformanceScore = devicePerformanceScore.coerceIn(0, 100)
        }
    }
    
    private fun isTimeoutError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("timeout") || 
               message.contains("time out") ||
               message.contains("timed out")
    }
    
    private fun isConnectionError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("connection") ||
               message.contains("disconnect") ||
               message.contains("lost") ||
               message.contains("closed") ||
               message.contains("tag was lost") ||
               message.contains("transceive") ||
               error.javaClass.simpleName.contains("IOException")
    }
    
    private fun isAuthenticationError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("authentication") ||
               message.contains("bac") ||
               message.contains("access denied") ||
               message.contains("security")
        // Note: "pace" removed - PACE errors are handled by isProtocolError for connection recovery
    }
    
    private fun isProtocolError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("picc") ||                    // PICC side exceptions
               message.contains("key agreement") ||           // Key agreement failures
               message.contains("key exchange") ||            // Key exchange failures
               message.contains("secure messaging") ||        // Secure messaging errors
               message.contains("mac verification") ||        // MAC check failures
               message.contains("apdu") ||                    // APDU transmission errors
               message.contains("pace") ||                    // PACE protocol errors
               message.contains("chip") ||                    // Chip-related errors
               message.contains("card") ||                    // Card-related errors
               message.contains("status word") ||             // Status word errors
               message.contains("sw1") ||                     // Status word component
               message.contains("sw2")                        // Status word component
    }
    
    private fun isDataError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("data") ||
               message.contains("read") ||
               message.contains("parse") ||
               message.contains("decode")
    }
    
    private fun isNonRetryableError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: ""
        return message.contains("invalid") ||
               message.contains("wrong") ||
               message.contains("unsupported") ||
               message.contains("not found") ||
               message.contains("file not found") ||
               error is IllegalArgumentException
    }
} 