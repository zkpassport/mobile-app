package com.passportreader


import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.AsyncTask
import android.util.Base64
import android.util.Log

import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

import net.sf.scuba.smartcards.CardFileInputStream
import net.sf.scuba.smartcards.CardService

import org.jmrtd.BACKey
import org.jmrtd.BACKeySpec
import org.jmrtd.PassportService
import org.jmrtd.lds.icao.COMFile
import org.jmrtd.lds.CardAccessFile
import org.jmrtd.lds.icao.DG1File
import org.jmrtd.lds.icao.DG2File
import org.jmrtd.lds.icao.DG3File
import org.jmrtd.lds.icao.DG5File
import org.jmrtd.lds.icao.DG6File
import org.jmrtd.lds.icao.DG7File
import org.jmrtd.lds.icao.DG11File
import org.jmrtd.lds.icao.DG12File
import org.jmrtd.lds.icao.DG14File
import org.jmrtd.lds.icao.DG15File
import org.jmrtd.lds.iso19794.FaceImageInfo
import org.jmrtd.lds.iso19794.FaceInfo
import org.jmrtd.lds.iso19794.FingerInfo
import org.jmrtd.lds.iso19794.FingerImageInfo
//import org.jmrtd.lds.LDS
import org.jmrtd.lds.icao.MRZInfo
import org.jmrtd.lds.SecurityInfo
import org.jmrtd.lds.PACEInfo
import org.jmrtd.lds.SODFile
import org.jmrtd.lds.SignedDataUtil
import org.spongycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.asn1.ASN1Encoding
import org.bouncycastle.asn1.cms.ContentInfo
import org.bouncycastle.asn1.x509.AlgorithmIdentifier
import org.bouncycastle.asn1.ASN1ObjectIdentifier
import org.bouncycastle.asn1.icao.LDSVersionInfo
import org.bouncycastle.asn1.icao.LDSSecurityObject
import org.bouncycastle.asn1.icao.DataGroupHash
import org.bouncycastle.asn1.DEROctetString

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.IOException
import java.io.InputStream
import java.security.PublicKey
import java.security.Security
import java.util.ArrayList
import java.util.Arrays
import java.util.Collection
import java.util.HashMap
import java.util.List
import java.util.Map
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.security.interfaces.ECPublicKey
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import android.os.Handler
import android.os.HandlerThread
import android.os.Vibrator
import android.os.VibrationEffect
import android.content.Context
import java.lang.reflect.Method
import android.os.Build
import android.os.Bundle
import android.app.ActivityOptions

import com.google.gson.Gson

/**
 * Custom exception to signal that the NFC tag was lost and we need to wait
 * for a new tag detection (user needs to reposition phone).
 */
class TagLostNeedRedetectionException(message: String) : IOException(message)

class PassportReaderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener, RetryEventListener {

    companion object {
        private const val SCAN_REQUEST_CODE = 8735738
        private const val E_NOT_SUPPORTED = "E_NOT_SUPPORTED"
        private const val E_NOT_ENABLED = "E_NOT_ENABLED"
        private const val E_SCAN_CANCELED = "E_SCAN_CANCELED"
        private const val E_SCAN_FAILED = "E_SCAN_FAILED"
        private const val E_SCAN_FAILED_DISCONNECT = "E_SCAN_FAILED_DISCONNECT"
        private const val E_SCAN_FAILED_AUTH = "E_SCAN_FAILED_AUTH"
        private const val E_ONE_REQ_AT_A_TIME = "E_ONE_REQ_AT_A_TIME"
        private const val KEY_IS_SUPPORTED = "isSupported"
        private const val KEY_FIRST_NAME = "firstName"
        private const val KEY_LAST_NAME = "lastName"
        private const val KEY_GENDER = "gender"
        private const val KEY_ISSUER = "issuer"
        private const val KEY_NATIONALITY = "nationality"
        private const val KEY_PHOTO = "photo"
        private const val PARAM_DOC_NUM = "documentNumber"
        private const val PARAM_DOB = "dateOfBirth"
        private const val PARAM_DOE = "dateOfExpiry"
        private const val TAG = "passportreader"
        private const val JPEG_DATA_URI_PREFIX = "data:image/jpeg;base64,"
        
        // NFC Connection constants - optimized for faster response
        private const val NFC_TIMEOUT_INITIAL = 8000   // 8 seconds initial (faster failure detection)
        private const val NFC_TIMEOUT_EXTENDED = 15000 // 15 seconds for complex operations
        private const val NFC_TIMEOUT_MAX = 20000      // 20 seconds maximum after retries
        private const val WATCHDOG_REFRESH_INTERVAL = 100L // 100ms
        private const val MAX_WATCHDOG_RUNTIME = 25000L // 25 seconds (reduced from 30)
        private const val TECHNOLOGY_ISO_DEP = 3
        
        // Reduced retry delays for faster UX
        private const val CONNECTION_RECOVERY_DELAY = 500L // Reduced from 1500ms
        private const val FAST_RETRY_DELAY = 200L      // Very fast retry for transient errors

        // Circuit breaker configuration
        private const val CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3
        private const val CIRCUIT_BREAKER_RECOVERY_TIMEOUT = 5000L // Reduced from 10s

        private fun exceptionStack(exception: Throwable): String {
            val s = StringBuilder()
            exception.message?.let {
                s.append(it)
                s.append(" - ")
            }
            s.append(exception.javaClass.simpleName)
            val stack = exception.stackTrace

            if (stack.isNotEmpty()) {
                var count = 3
                var first = true
                var skip = false
                var file = ""
                s.append(" (")
                for (element in stack) {
                    if (count > 0 && element.className.startsWith("com.passportreader")) {
                        if (!first) {
                            s.append(" < ")
                        } else {
                            first = false
                        }
    
                    if (skip) {
                        s.append("... < ")
                        skip = false
                    }

                    if (file == element.fileName) {
                        s.append("*")
                    } else {
                            file = element.fileName ?: ""
                            s.append(file.removeSuffix(".kt"))
                            count--
                        }
                        s.append(":").append(element.lineNumber)
                    } else {
                        skip = true
                    }
                }
                if (skip) {
                    if (!first) {
                        s.append(" < ")
                    }
                    s.append("...")
                }
                s.append(")")
            }
            return s.toString()
        }

        private fun toBase64(bitmap: Bitmap, quality: Int): String {
            val byteArrayOutputStream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, byteArrayOutputStream)
            val byteArray = byteArrayOutputStream.toByteArray()
            return JPEG_DATA_URI_PREFIX + Base64.encodeToString(byteArray, Base64.NO_WRAP)
        }
    }

    private var scanPromise: Promise? = null
    private var opts: ReadableMap? = null
    private var readTask: ReadTask? = null
    private var watchdogHandler: Handler? = null
    private var watchdogThread: HandlerThread? = null
    private var watchdogRunnable: WatchdogRefresher? = null
    private val isReading = AtomicBoolean(false)

    // Adaptive reading strategy for intelligent parameter adjustment
    private val readingStrategy = NFCReadingStrategy()

    // Circuit breaker state for preventing cascading failures
    private var consecutiveFailures = 0
    private var lastFailureTime = 0L
    private var isCircuitBreakerOpen = false

    // Haptic feedback control
    private var hapticFeedbackEnabled = true

    /**
     * Enhanced Retry System Features:
     * 1. Faster exponential backoff with reduced delays for responsive UX
     * 2. Adaptive strategy integration for intelligent parameter adjustment
     * 3. Real-time retry event emissions for UI feedback
     * 4. Smart optional DG skipping after consecutive failures
     * 5. Circuit breaker pattern to prevent cascading failures
     * 6. Connection recovery with reduced delays
     * 7. Escalating timeouts based on retry attempts
     */

    // Retry strategy enum for different operation types
    private enum class RetryStrategy(
        val isCritical: Boolean, 
        val isOptional: Boolean,
        val useExponentialBackoff: Boolean, 
        val allowConnectionRecovery: Boolean
    ) {
        CRITICAL(true, false, true, true),      // Authentication, COM, SOD - most important
        STANDARD(false, false, true, true),     // DG1, DG2 - required data groups
        OPTIONAL(false, true, false, false),    // Optional data groups - fast fail
        CONNECTION(true, false, true, true)     // Connection establishment - foundational
    }

    // RetryEventListener implementation for UI feedback
    override fun onRetryAttempt(info: RetryEventInfo) {
        val eventData = Arguments.createMap().apply {
            putString("type", "RETRY_ATTEMPT")
            putString("operation", info.operationName)
            putInt("attempt", info.currentAttempt)
            putInt("maxAttempts", info.maxAttempts)
            putDouble("estimatedWaitMs", info.estimatedWaitMs.toDouble())
            putString("error", info.errorMessage ?: "")
        }
        emitDetailedEvent("PassportReaderRetry", eventData)
        
        // Also emit simple event for backward compatibility
        eventMessageEmitter("RETRY_${info.operationName.uppercase()}_${info.currentAttempt}")
    }

    override fun onOperationSuccess(operationName: String, attemptsTaken: Int) {
        if (attemptsTaken > 1) {
            Log.d(TAG, "Operation $operationName succeeded after $attemptsTaken attempts")
        }
    }

    override fun onOperationFailure(operationName: String, attemptsTaken: Int, isFatal: Boolean) {
        val eventData = Arguments.createMap().apply {
            putString("type", "OPERATION_FAILED")
            putString("operation", operationName)
            putInt("attempts", attemptsTaken)
            putBoolean("isFatal", isFatal)
        }
        emitDetailedEvent("PassportReaderFailure", eventData)
    }

    private fun emitDetailedEvent(eventName: String, data: WritableMap) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
        }
    }

    init {
        Security.insertProviderAt(BouncyCastleProvider(), 1)
        reactContext.addLifecycleEventListener(this)
        readingStrategy.setRetryEventListener(this)
    }

    override fun getName(): String = "PassportReader"

    override fun getConstants(): MutableMap<String, Any>? {
        val constants = mutableMapOf<String, Any>()
        val hasNFC = reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC)
        constants[KEY_IS_SUPPORTED] = hasNFC
        constants["readerModeEnabled"] = true
        constants["enhancedRetryEnabled"] = true
        constants["circuitBreakerThreshold"] = CIRCUIT_BREAKER_FAILURE_THRESHOLD
        constants["nfcTimeoutMs"] = NFC_TIMEOUT_EXTENDED
        constants["hapticFeedbackEnabled"] = true
        return constants
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        try {
            Log.d(TAG, "Cancel requested")
            isReading.set(false)
            
            // Disable Reader Mode first
            val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
            currentActivity?.let { activity ->
                try {
                    // Check if activity is still valid before trying to disable Reader Mode
                    if (!activity.isDestroyed && !activity.isFinishing) {
                        mNfcAdapter?.disableReaderMode(activity)
                        Log.d(TAG, "NFC Reader Mode disabled")
                    } else {
                        Log.d(TAG, "Activity destroyed/finishing - skipping Reader Mode disable in cancel")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error disabling Reader Mode in cancel: ${e.message}")
                }
            }
            
            // Stop watchdog and pulsing vibration
            stopWatchdog()
            stopPulsingVibration()
            
            readTask?.let { task ->
                // Cancel the AsyncTask first
                task.cancel(true)
                
                // Perform immediate cleanup
                try {
                    task.cleanup()
                } catch (e: Exception) {
                    Log.w(TAG, "Error during cleanup: ${exceptionStack(e)}")
                }
            }
            
            // Immediately reject any pending scan promise
            scanPromise?.reject(E_SCAN_CANCELED, "Scan was canceled")
            
            // Reset state immediately (without trying to disable Reader Mode again)
            isReading.set(false)
            scanPromise = null
            opts = null
            readTask = null
            
            promise.resolve(null)
        } catch (e: Exception) {
            Log.w(TAG, "Error during cancel: ${exceptionStack(e)}")
            // Still reset state and resolve to ensure we don't get stuck
            isReading.set(false)
            scanPromise = null
            opts = null
            readTask = null
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun scan(opts: ReadableMap, promise: Promise) {
        val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
        when {
            mNfcAdapter == null -> {
                promise.reject(E_NOT_SUPPORTED, "NFC chip reading not supported")
                return
            }
            !mNfcAdapter.isEnabled -> {
                promise.reject(E_NOT_ENABLED, "NFC chip reading not enabled")
                return
            }
            scanPromise != null || isReading.get() -> {
                promise.reject(E_ONE_REQ_AT_A_TIME, "Already running a scan")
                return
            }
        }

        this.opts = opts
        this.scanPromise = promise
        isReading.set(true)
        resetCircuitBreaker() // Reset circuit breaker for each new scan
        resetReconnectState() // Reset reconnect state for new scan
        resetDataGroupCache() // Reset data group cache for new scan
        
        // Enable Reader Mode immediately when scan is requested
        currentActivity?.let { activity ->
            val flags = NfcAdapter.FLAG_READER_NFC_A or 
                       NfcAdapter.FLAG_READER_NFC_B or 
                       NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
                       NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
            
            mNfcAdapter.enableReaderMode(activity, { tag ->
                Log.d(TAG, "NFC tag detected via Reader Mode: ${tag.techList?.joinToString()}")
                handleNfcTag(tag)
            }, flags, null)
            
            Log.d(TAG, "Scan requested, NFC Reader Mode enabled and ready")
        } ?: run {
            promise.reject(E_SCAN_FAILED, "No current activity available")
            resetState()
        }
    }

    @ReactMethod
    fun isNFCEnabled(promise: Promise) {
        try {
            Log.d(TAG, "isNFCEnabled")
            val nfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
            val isEnabled = nfcAdapter?.isEnabled ?: false
            promise.resolve(isEnabled)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking NFC status: ${exceptionStack(e)}")
            promise.resolve(false) // Return false as safe default
        }
    }

    @ReactMethod
    fun goToNfcSetting(promise: Promise) {
        try {
            Log.d(TAG, "goToNfcSetting")
            val currentActivity = currentActivity
            if (currentActivity == null) {
                promise.reject("NO_ACTIVITY", "No current activity available")
                return
            }

            val intent = Intent(android.provider.Settings.ACTION_NFC_SETTINGS)
            currentActivity.startActivity(intent)
            promise.resolve(true)
        } catch (ex: Exception) {
            Log.e(TAG, "Error opening NFC settings: ${exceptionStack(ex)}")
            promise.reject("SETTINGS_ERROR", "Failed to open NFC settings", ex)
        }
    }

    private fun resetState() {
        isReading.set(false)
        scanPromise = null
        opts = null
        readTask = null
        stopWatchdog()
        stopPulsingVibration()
        resetReconnectState()
        resetDataGroupCache() // Clear cache when resetting state
        
        // Disable Reader Mode when resetting state (only if activity is still valid)
        val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
        currentActivity?.let { activity ->
            try {
                // Check if activity is still valid before trying to disable Reader Mode
                if (!activity.isDestroyed && !activity.isFinishing) {
                    mNfcAdapter?.disableReaderMode(activity)
                    Log.d(TAG, "Reader Mode disabled during state reset")
                } else {
                    Log.d(TAG, "Activity is destroyed/finishing - skipping Reader Mode disable")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error disabling Reader Mode during state reset: ${e.message}")
            }
        }
    }

    private fun resetCircuitBreaker() {
        consecutiveFailures = 0
        lastFailureTime = 0L
        isCircuitBreakerOpen = false
        readingStrategy.resetForNewScan()
        Log.d(TAG, "Circuit breaker and reading strategy reset")
    }

    // Haptic feedback for better UX - Standardized patterns matching iOS
    // 1. While searching for NFC: no haptic feedback
    // 2. When chip detected: soft pulsing vibration (150ms every 1s) to guide user to "stay in position"
    // 3. When new data group is read: short vibration (50-100ms) to indicate state change
    // 4. On error: double short vibration (2×100ms, 100ms gap)
    private fun vibratePattern(pattern: VibrationPattern) {
        if (!hapticFeedbackEnabled) return
        
        try {
            val vibrator = reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator?.let { vib ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    when (pattern) {
                        VibrationPattern.CHIP_DETECTED -> {
                            // Start pulsing vibration (150ms every 1s) to guide user to "stay in position"
                            startPulsingVibration(vib)
                        }
                        VibrationPattern.DATA_GROUP_READ -> {
                            // Stop pulsing (if still running) and play short vibration (50-100ms)
                            stopPulsingVibration()
                            val effect = VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE)
                            vib.vibrate(effect)
                        }
                        VibrationPattern.ERROR -> {
                            // Stop pulsing and play double short vibration (2×100ms, 100ms gap) for errors
                            stopPulsingVibration()
                            val effect = VibrationEffect.createWaveform(longArrayOf(0, 100, 100, 100), -1)
                            vib.vibrate(effect)
                        }
                        VibrationPattern.COMPLETION -> {
                            // Stop pulsing and play success pattern
                            stopPulsingVibration()
                            val effect = VibrationEffect.createWaveform(longArrayOf(0, 100, 50, 100, 50, 150), -1)
                            vib.vibrate(effect)
                        }
                        VibrationPattern.STOP_PULSING -> {
                            // Just stop the pulsing vibration
                            stopPulsingVibration()
                        }
                    }
                } else {
                    // Fallback for older Android versions
                    @Suppress("DEPRECATION")
                    when (pattern) {
                        VibrationPattern.CHIP_DETECTED -> startPulsingVibrationLegacy(vib)
                        VibrationPattern.DATA_GROUP_READ -> {
                            stopPulsingVibration()
                            vib.vibrate(80)
                        }
                        VibrationPattern.ERROR -> {
                            stopPulsingVibration()
                            vib.vibrate(longArrayOf(0, 100, 100, 100), -1)
                        }
                        VibrationPattern.COMPLETION -> {
                            stopPulsingVibration()
                            vib.vibrate(longArrayOf(0, 100, 50, 100, 50, 150), -1)
                        }
                        VibrationPattern.STOP_PULSING -> stopPulsingVibration()
                    }
                }
                Log.d(TAG, "Vibration triggered: $pattern")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to trigger vibration: ${e.message}")
        }
    }
    
    // Start pulsing vibration (150ms every 1s) for chip detected
    private fun startPulsingVibration(vibrator: Vibrator) {
        stopPulsingVibration() // Stop any existing pulsing
        
        isPulsing = true
        
        // Trigger initial vibration immediately
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE)
            vibrator.vibrate(effect)
        }
        
        // Set up handler for pulsing every 1 second
        val handlerThread = HandlerThread("PulsingVibrationThread").apply { start() }
        pulsingHandler = Handler(handlerThread.looper)
        pulsingRunnable = object : Runnable {
            override fun run() {
                if (isPulsing && hapticFeedbackEnabled) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val effect = VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE)
                            vibrator.vibrate(effect)
                        }
                        pulsingHandler?.postDelayed(this, 1000) // Repeat every 1 second
                    } catch (e: Exception) {
                        Log.w(TAG, "Error in pulsing vibration: ${e.message}")
                    }
                }
            }
        }
        pulsingHandler?.postDelayed(pulsingRunnable!!, 1000) // Start after 1 second
        
        Log.d(TAG, "Started pulsing vibration")
    }
    
    @Suppress("DEPRECATION")
    private fun startPulsingVibrationLegacy(vibrator: Vibrator) {
        stopPulsingVibration() // Stop any existing pulsing
        
        isPulsing = true
        
        // Trigger initial vibration immediately
        vibrator.vibrate(150)
        
        // Set up handler for pulsing every 1 second
        val handlerThread = HandlerThread("PulsingVibrationThread").apply { start() }
        pulsingHandler = Handler(handlerThread.looper)
        pulsingRunnable = object : Runnable {
            override fun run() {
                if (isPulsing && hapticFeedbackEnabled) {
                    try {
                        vibrator.vibrate(150)
                        pulsingHandler?.postDelayed(this, 1000) // Repeat every 1 second
                    } catch (e: Exception) {
                        Log.w(TAG, "Error in pulsing vibration: ${e.message}")
                    }
                }
            }
        }
        pulsingHandler?.postDelayed(pulsingRunnable!!, 1000) // Start after 1 second
        
        Log.d(TAG, "Started pulsing vibration (legacy)")
    }
    
    // Stop pulsing vibration
    private fun stopPulsingVibration() {
        isPulsing = false
        pulsingRunnable?.let { runnable ->
            pulsingHandler?.removeCallbacks(runnable)
        }
        pulsingHandler?.looper?.quitSafely()
        pulsingHandler = null
        pulsingRunnable = null
        Log.d(TAG, "Stopped pulsing vibration")
    }

    private enum class VibrationPattern {
        CHIP_DETECTED,    // Start pulsing vibration (150ms every 1s) when chip is detected
        DATA_GROUP_READ,  // Short vibration (50-100ms) when a new data group is read
        ERROR,            // Double short vibration (2×100ms, 100ms gap) for errors
        COMPLETION,       // Success pattern for scan completion
        STOP_PULSING      // Stop the pulsing vibration
    }
    
    // Handler for pulsing vibration timer
    private var pulsingHandler: Handler? = null
    private var pulsingRunnable: Runnable? = null
    private var isPulsing = false
    
    // MARK: - Connection Loss Recovery State
    // Track whether we're waiting for a new tag after connection loss
    private var isWaitingForTagReconnect = false
    private var reconnectAttemptCount = 0
    private val maxReconnectAttempts = 3
    
    // MARK: - Data Group Caching for Connection Recovery
    // Cache successfully read data groups to avoid re-reading them on reconnection
    private var cachedDataGroupIds: MutableSet<Int> = mutableSetOf()
    private var cachedComFile: COMFile? = null
    private var cachedSodFile: SODFile? = null
    private var cachedDg1File: DG1File? = null
    private var cachedDg2File: DG2File? = null
    private var cachedDataGroupValues: MutableMap<Int, ByteArray> = mutableMapOf()
    private var cachedBitmap: Bitmap? = null
    
    /**
     * Handle connection loss by keeping Reader Mode active and waiting for new tag detection.
     * Unlike iOS's restartPolling(), Android's Reader Mode is already continuously polling,
     * so we just need to clean up the current task and wait for the callback to fire again.
     */
    private fun handleConnectionLossAndWaitForRetag(reason: String): Boolean {
        if (reconnectAttemptCount >= maxReconnectAttempts) {
            Log.w(TAG, "Max reconnect attempts ($maxReconnectAttempts) reached - giving up")
            return false
        }
        
        reconnectAttemptCount++
        isWaitingForTagReconnect = true
        
        Log.i(TAG, "Connection lost: $reason - waiting for tag re-detection (attempt $reconnectAttemptCount/$maxReconnectAttempts)")
        
        // Stop pulsing vibration and trigger error haptic
        vibratePattern(VibrationPattern.ERROR)
        
        // Emit event for UI feedback
        val eventData = Arguments.createMap().apply {
            putString("type", "CONNECTION_LOST_WAITING_RETAG")
            putInt("attempt", reconnectAttemptCount)
            putInt("maxAttempts", maxReconnectAttempts)
            putString("reason", reason)
        }
        emitDetailedEvent("PassportReaderConnectionLost", eventData)
        eventMessageEmitter("CONNECTION_LOST_RETAG_$reconnectAttemptCount")
        
        // Clean up current read task (but DON'T disable Reader Mode - we want it to keep polling)
        readTask?.let { task ->
            task.cancel(true)
            try {
                task.cleanup()
            } catch (e: Exception) {
                Log.w(TAG, "Error during task cleanup for reconnect: ${e.message}")
            }
        }
        readTask = null
        stopWatchdog()
        
        // Reader Mode is still active, so when the user repositions the phone,
        // handleNfcTag() will be called again automatically
        
        Log.d(TAG, "Waiting for user to reposition phone for new tag detection...")
        return true
    }
    
    /**
     * Reset reconnect state - called when starting a new scan or after successful read
     */
    private fun resetReconnectState() {
        isWaitingForTagReconnect = false
        reconnectAttemptCount = 0
    }
    
    /**
     * Reset data group cache - called when starting a new scan
     * This clears all cached data groups so we start fresh
     */
    private fun resetDataGroupCache() {
        Log.d(TAG, "Resetting data group cache for new scan")
        cachedDataGroupIds.clear()
        cachedComFile = null
        cachedSodFile = null
        cachedDg1File = null
        cachedDg2File = null
        cachedDataGroupValues.clear()
        cachedBitmap = null
    }
    
    /**
     * Log which data groups are cached (for debugging)
     */
    private fun logCachedDataGroups() {
        if (cachedDataGroupIds.isNotEmpty()) {
            val cachedNames = cachedDataGroupIds.map { 
                when (it) {
                    0 -> "COM"
                    -1 -> "SOD" // Using -1 to represent SOD since it's not a numbered DG
                    999 -> "Photo" // Using 999 to represent the extracted photo
                    else -> "DG$it"
                }
            }.joinToString(", ")
            Log.i(TAG, "Cached data groups that will be skipped: $cachedNames")
        }
    }
    
    private fun startWatchdog(isoDep: IsoDep) {
        try {
            stopWatchdog() // Ensure any existing watchdog is stopped
            
            watchdogThread = HandlerThread("NFCWatchdogThread").apply { start() }
            watchdogHandler = Handler(watchdogThread!!.looper)
            watchdogRunnable = WatchdogRefresher(isoDep)
            
            watchdogHandler?.post(watchdogRunnable!!)
            Log.d(TAG, "NFC Watchdog started")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start watchdog: ${exceptionStack(e)}")
        }
    }
    
    private fun stopWatchdog() {
        try {
            watchdogRunnable?.let { runnable ->
                watchdogHandler?.removeCallbacks(runnable)
            }
            watchdogHandler?.removeCallbacksAndMessages(null)
            watchdogHandler = null
            watchdogRunnable = null
            
            watchdogThread?.quit()
            watchdogThread = null
            
            Log.d(TAG, "NFC Watchdog stopped")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping watchdog: ${exceptionStack(e)}")
        }
    }

    override fun onHostResume() {
        Log.d(TAG, "onHostResume - checking if Reader Mode needs restoration")
        val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext) ?: return
        val activity = currentActivity ?: return

        // Only re-enable Reader Mode if we have an active scan and it's not already active
        // This handles cases where the app was paused during scanning
        if (scanPromise != null && isReading.get()) {
            try {
                // Check if activity is still valid before trying to enable Reader Mode
                if (!activity.isDestroyed && !activity.isFinishing) {
                    val flags = NfcAdapter.FLAG_READER_NFC_A or 
                               NfcAdapter.FLAG_READER_NFC_B or 
                               NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
                               NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
                    
                    mNfcAdapter.enableReaderMode(activity, { tag ->
                        Log.d(TAG, "NFC tag detected via Reader Mode (resumed): ${tag.techList?.joinToString()}")
                        handleNfcTag(tag)
                    }, flags, null)
                    
                    Log.d(TAG, "Reader Mode restored after app resume")
                } else {
                    Log.d(TAG, "Activity destroyed/finishing - cannot restore Reader Mode")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to restore Reader Mode on resume: ${e.message}")
            }
        } else {
            Log.d(TAG, "No active scan - Reader Mode not needed")
        }
    }

    override fun onHostPause() {
        Log.d(TAG, "onHostPause - preserving active scans")
        // For passport reading, we typically want to keep scans active even during brief pauses
        // Only disable Reader Mode if explicitly requested or if there's no active scan
        
        if (scanPromise == null || !isReading.get()) {
            // No active scan, safe to disable Reader Mode
            val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
            currentActivity?.let { activity ->
                try {
                    // Check if activity is still valid before trying to disable Reader Mode
                    if (!activity.isDestroyed && !activity.isFinishing) {
                        mNfcAdapter?.disableReaderMode(activity)
                        Log.d(TAG, "Reader Mode disabled - no active scan")
                    } else {
                        Log.d(TAG, "Activity destroyed/finishing - skipping Reader Mode disable on pause")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error disabling Reader Mode on pause: ${e.message}")
                }
            }
        } else {
            Log.d(TAG, "Active scan detected - keeping Reader Mode active during pause")
            // Keep Reader Mode active during brief app pauses to maintain scan continuity
            // This is important for passport reading where users might get notifications
        }
    }

    override fun onHostDestroy() {
        Log.w(TAG, "onHostDestroy - performing critical cleanup")
        isReading.set(false)
        
        // Always disable Reader Mode on destroy
        val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
        currentActivity?.let { activity ->
            try {
                // Check if activity is still valid before trying to disable Reader Mode
                if (!activity.isDestroyed && !activity.isFinishing) {
                    mNfcAdapter?.disableReaderMode(activity)
                    Log.d(TAG, "Reader Mode disabled on destroy")
                } else {
                    Log.d(TAG, "Activity already destroyed/finishing - skipping Reader Mode disable")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error disabling Reader Mode on destroy: ${e.message}")
            }
        }
        
        // Critical cleanup
        stopWatchdog()
        stopPulsingVibration()
        readTask?.cleanup()
        
        // Cancel any pending promises to prevent memory leaks
        scanPromise?.reject(E_SCAN_CANCELED, "App destroyed during scan")
        
        // Reset state without trying to disable Reader Mode again (already done above)
        scanPromise = null
        opts = null
        readTask = null
        
        Log.d(TAG, "Critical cleanup completed")
    }

    private fun getActivityOptionsBundle(): Bundle? {
        val activityOptions = ActivityOptions.makeBasic()
        activityOptions.setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
        return activityOptions.toBundle()
    }

    private fun handleNfcTag(tag: Tag) {
        Log.d(TAG, "Processing NFC tag")
        
        // Ensure we're expecting a scan
        if (scanPromise == null || !isReading.get()) {
            Log.d(TAG, "Ignoring NFC tag - not currently scanning")
            return
        }

        // Check if tag supports IsoDep
        if (!tag.techList.contains(IsoDep::class.java.name)) {
            Log.w(TAG, "Tag does not support IsoDep: ${tag.techList?.joinToString()}")
            vibratePattern(VibrationPattern.ERROR)
            // Don't fail immediately if we're waiting for reconnect - user might have tapped wrong tag
            if (isWaitingForTagReconnect) {
                Log.d(TAG, "Wrong tag during reconnect wait - continuing to wait for passport")
                eventMessageEmitter("WRONG_TAG_RETAG")
                return
            }
            scanPromise?.reject(E_SCAN_FAILED, "Detected tag does not support passport reading (IsoDep required)")
            resetState()
            return
        }

        // If we were waiting for reconnect, log the recovery
        if (isWaitingForTagReconnect) {
            Log.i(TAG, "Tag re-detected after connection loss - resuming scan (attempt $reconnectAttemptCount)")
            Log.i(TAG, "Will skip ${cachedDataGroupIds.size} already cached data groups")
            logCachedDataGroups()
            eventMessageEmitter("TAG_RECONNECTED_$reconnectAttemptCount")
            val eventData = Arguments.createMap().apply {
                putString("type", "TAG_RECONNECTED")
                putInt("attempt", reconnectAttemptCount)
                putInt("cachedDataGroups", cachedDataGroupIds.size)
            }
            emitDetailedEvent("PassportReaderReconnected", eventData)
            isWaitingForTagReconnect = false
            // Don't reset reconnectAttemptCount here - we track total attempts across the session
        }

        Log.d(TAG, "Valid passport tag detected: ${tag.techList?.joinToString()}")
        
        // Vibrate to confirm chip detection
        vibratePattern(VibrationPattern.CHIP_DETECTED)

        try {
            val bacKey = BACKey(
                opts?.getString(PARAM_DOC_NUM) ?: "",
                opts?.getString(PARAM_DOB) ?: "",
                opts?.getString(PARAM_DOE) ?: ""
            )
            Log.d(TAG, "Created BAC key for authentication")

            val nfc = IsoDep.get(tag)
            Log.d(TAG, "Got IsoDep instance: $nfc")
            
            // Configure NFC connection with faster initial timeout for responsive UX
            nfc.timeout = NFC_TIMEOUT_INITIAL
            Log.d(TAG, "Set initial NFC timeout: ${nfc.timeout}ms")

            // Start the enhanced read task
            readTask = ReadTask(nfc, bacKey)
            Log.d(TAG, "Created ReadTask: $readTask")
            readTask?.execute()
            Log.d(TAG, "Started ReadTask execution")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error handling NFC tag: ${exceptionStack(e)}")
            vibratePattern(VibrationPattern.ERROR)
            scanPromise?.reject(E_SCAN_FAILED, "Failed to initialize passport reading: ${e.message}")
            resetState()
        }
    }

    fun fromArrayToWritableArray(array: ByteArray): WritableArray {
        val writableArray = Arguments.createArray()
        for (byte in array) {
            writableArray.pushInt(byte.toInt())
        }
        return writableArray
    }
    
    // Watchdog class to keep NFC connection alive
    private inner class WatchdogRefresher(private val isoDep: IsoDep) : Runnable {
        private var currentRuntime = 0L
        private val startTime = System.currentTimeMillis()
        
        override fun run() {
            if (!isReading.get() || currentRuntime >= MAX_WATCHDOG_RUNTIME) {
                Log.d(TAG, "Watchdog stopping: reading=${isReading.get()}, runtime=$currentRuntime")
                return
            }
            
            try {
                val tag = isoDep.tag
                if (tag != null && isoDep.isConnected) {
                    // Use reflection to call the internal connect method to refresh the watchdog
                    val getTagService = Tag::class.java.getMethod("getTagService")
                    val tagService = getTagService.invoke(tag)
                    val getServiceHandle = Tag::class.java.getMethod("getServiceHandle")
                    val serviceHandle = getServiceHandle.invoke(tag)
                    val connect = tagService.javaClass.getMethod("connect", Int::class.java, Int::class.java)
                    val result = connect.invoke(tagService, serviceHandle, TECHNOLOGY_ISO_DEP)
                    
                    if (result == 0) {
                        Log.v(TAG, "NFC Watchdog refresh successful")
                    }
                }
                
                // Schedule next refresh
                currentRuntime = System.currentTimeMillis() - startTime
                if (isReading.get() && currentRuntime < MAX_WATCHDOG_RUNTIME) {
                    watchdogHandler?.postDelayed(this, WATCHDOG_REFRESH_INTERVAL)
                }
            } catch (e: Exception) {
                Log.d(TAG, "Watchdog refresh failed: ${exceptionStack(e)}")
                // Continue trying unless we're stopped externally
                if (isReading.get() && currentRuntime < MAX_WATCHDOG_RUNTIME) {
                    watchdogHandler?.postDelayed(this, WATCHDOG_REFRESH_INTERVAL)
                }
            }
        }
    }
    
    private inner class ReadTask(private val isoDep: IsoDep, private val bacKey: BACKeySpec) : AsyncTask<Void, Void, Exception?>() {

        private lateinit var comFile: COMFile
        private lateinit var sodFile: SODFile
        // Data group containing the MRZ info
        private lateinit var dg1File: DG1File
        // Data group containing the photo info
        private lateinit var dg2File: DG2File
        // Data group containing the fingerprint details
        private lateinit var dg3File: DG3File
        // Data group containing the personal details
        private lateinit var dg11File: DG11File
        // Data group containing additional document details
        private lateinit var dg12File: DG12File
        // Data group containing the security info
        private lateinit var dg14File: DG14File
        private lateinit var dataGroupValues: MutableMap<Int, ByteArray>

        private var bitmap: Bitmap? = null
        private var authenticationSucceeded = false  // Track if auth was successful for early exit
        
        // Initialize from cache if available
        init {
            // Restore cached data groups
            cachedComFile?.let { comFile = it }
            cachedSodFile?.let { sodFile = it }
            cachedDg1File?.let { dg1File = it }
            cachedDg2File?.let { dg2File = it }
            cachedBitmap?.let { bitmap = it }
            
            // Initialize dataGroupValues from cache or empty
            dataGroupValues = cachedDataGroupValues.toMutableMap()
            
            if (cachedDataGroupIds.isNotEmpty()) {
                Log.d(TAG, "ReadTask initialized with ${cachedDataGroupIds.size} cached data groups")
            }
        }
        
        /**
         * Cache a successfully read data group for potential reconnection recovery
         */
        private fun cacheDataGroup(dgNumber: Int, description: String) {
            cachedDataGroupIds.add(dgNumber)
            Log.d(TAG, "$description cached successfully (total cached: ${cachedDataGroupIds.size})")
        }
        
        /**
         * Check if a data group is already cached
         */
        private fun isDataGroupCached(dgNumber: Int): Boolean {
            return cachedDataGroupIds.contains(dgNumber)
        }

        // Add a cleanup method that can be called externally
        fun cleanup() {
            try {
                stopWatchdog()
                if (isoDep.isConnected) {
                    try {
                        isoDep.close()
                        Log.d(TAG, "IsoDep closed")
                    } catch (e: Exception) {
                        Log.w(TAG, "Error closing IsoDep: ${exceptionStack(e)}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error during cleanup: ${exceptionStack(e)}")
            }
        }

        private fun updateCircuitBreakerState(success: Boolean, operationName: String = "unknown") {
            if (success) {
                consecutiveFailures = 0
                isCircuitBreakerOpen = false
                readingStrategy.reportSuccess(operationName)
                Log.d(TAG, "Circuit breaker reset - $operationName succeeded")
            } else {
                consecutiveFailures++
                if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
                    isCircuitBreakerOpen = true
                    lastFailureTime = System.currentTimeMillis()
                    Log.w(TAG, "Circuit breaker opened after $consecutiveFailures consecutive failures")
                }
            }
        }

        private fun shouldCircuitBreakerAllow(): Boolean {
            if (!isCircuitBreakerOpen) return true
            
            val timeSinceLastFailure = System.currentTimeMillis() - lastFailureTime
            if (timeSinceLastFailure > CIRCUIT_BREAKER_RECOVERY_TIMEOUT) {
                isCircuitBreakerOpen = false
                consecutiveFailures = 0
                Log.d(TAG, "Circuit breaker closed - recovery timeout elapsed")
                return true
            }
            
            Log.w(TAG, "Circuit breaker is open - rejecting operation")
            return false
        }

        /**
         * Attempt to recover the NFC connection by closing and reopening IsoDep.
         * If this fails, it means the tag is no longer in range and we need a new tag detection.
         * @throws TagLostNeedRedetectionException if the tag is lost and needs re-detection
         */
        private fun performConnectionRecovery(isoDep: IsoDep, attempt: Int): Boolean {
            Log.d(TAG, "Attempting connection recovery (attempt $attempt)...")
            vibratePattern(VibrationPattern.ERROR)
            eventMessageEmitter("CONNECTION_RECOVERY_STARTED")
            
            // Close existing connection
            if (isoDep.isConnected) {
                try {
                    isoDep.close()
                    Thread.sleep(CONNECTION_RECOVERY_DELAY)
                } catch (e: Exception) {
                    Log.w(TAG, "Error closing connection during recovery: ${e.message}")
                }
            }
            
            // Try to re-establish connection
            try {
                isoDep.connect()
                isoDep.timeout = readingStrategy.getEscalatedTimeout("connection", attempt)
                
                // Restart watchdog
                stopWatchdog()
                startWatchdog(isoDep)
                
                Log.d(TAG, "Connection recovery successful")
                eventMessageEmitter("CONNECTION_RECOVERY_SUCCEEDED")
                return true
            } catch (connectException: Exception) {
                Log.w(TAG, "IsoDep.connect() failed - tag is no longer in range: ${connectException.message}")
                eventMessageEmitter("CONNECTION_RECOVERY_FAILED_TAG_LOST")
                
                // Tag is lost - throw special exception to signal we need new tag detection
                throw TagLostNeedRedetectionException(
                    "Tag lost during connection recovery. Please keep phone close to passport."
                )
            }
        }

        private fun performOperationWithEnhancedRetry(
            operation: () -> Unit, 
            operationName: String, 
            strategy: RetryStrategy,
            isoDep: IsoDep? = null
        ) {
            if (!shouldCircuitBreakerAllow()) {
                readingStrategy.notifyOperationFailure(operationName, 0, true)
                throw IOException("Circuit breaker is open - operation blocked")
            }

            // Early exit for optional DGs if we've had too many failures
            if (strategy.isOptional && readingStrategy.shouldSkipOptionalDataGroups()) {
                Log.d(TAG, "Skipping $operationName due to previous optional DG failures")
                throw IOException("Skipping optional data group after previous failures")
            }

            // Check if connection is likely lost
            if (readingStrategy.isConnectionLikelyLost() && !strategy.allowConnectionRecovery) {
                Log.w(TAG, "Connection appears lost - fast failing $operationName")
                readingStrategy.notifyOperationFailure(operationName, 0, true)
                throw IOException("Connection lost - unable to continue")
            }

            val maxRetries = readingStrategy.getRecommendedRetryCount(strategy.isCritical, strategy.isOptional)
            var attempts = 0
            var lastException: Exception? = null
            var connectionRecoveryAttempted = false

            while (attempts < maxRetries && !Thread.currentThread().isInterrupted) {
                attempts++
                
                // Escalate timeout on retries
                if (attempts > 1 && isoDep != null && isoDep.isConnected) {
                    try {
                        val operationType = if (strategy.isCritical) "authentication" else if (strategy.isOptional) "optional" else "data_reading"
                        isoDep.timeout = readingStrategy.getEscalatedTimeout(operationType, attempts)
                        Log.d(TAG, "Escalated timeout to ${isoDep.timeout}ms for attempt $attempts")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to escalate timeout: ${e.message}")
                    }
                }
                
                try {
                    Log.d(TAG, "$operationName - attempt $attempts/$maxRetries")
                    operation()
                    updateCircuitBreakerState(true, operationName)
                    readingStrategy.notifyOperationSuccess(operationName, attempts)
                    Log.d(TAG, "$operationName succeeded on attempt $attempts")
                    return // Success
                    
                } catch (e: Exception) {
                    lastException = e
                    val exceptionType = readingStrategy.classifyException(e)
                    
                    Log.w(TAG, "$operationName failed on attempt $attempts: ${e.message} (type: $exceptionType)")
                    readingStrategy.reportFailure(e, operationName, strategy.isOptional)
                    
                    // Emit retry event for UI feedback
                    if (attempts < maxRetries) {
                        val retryDelay = readingStrategy.calculateRetryDelay(attempts, strategy.useExponentialBackoff)
                        readingStrategy.notifyRetryAttempt(operationName, attempts, maxRetries, retryDelay, e.message)
                        // No haptic feedback for retry - only on error
                    }
                    
                    // Check if we should retry based on exception type
                    when (exceptionType) {
                        NFCReadingStrategy.ExceptionType.NON_RETRYABLE -> {
                            Log.w(TAG, "$operationName failed with non-retryable error")
                            updateCircuitBreakerState(false, operationName)
                            readingStrategy.notifyOperationFailure(operationName, attempts, true)
                            throw e
                        }
                        NFCReadingStrategy.ExceptionType.CONNECTION_LOST -> {
                            if (strategy.allowConnectionRecovery && isoDep != null && !connectionRecoveryAttempted) {
                                Log.d(TAG, "Attempting connection recovery for $operationName (connection lost)")
                                try {
                                    if (performConnectionRecovery(isoDep, attempts)) {
                                        connectionRecoveryAttempted = true
                                        // Don't count connection recovery as a regular attempt
                                        attempts--
                                        continue
                                    }
                                } catch (tagLostEx: TagLostNeedRedetectionException) {
                                    // Tag is lost - propagate this exception to trigger re-detection flow
                                    Log.w(TAG, "Tag lost during $operationName - needs re-detection")
                                    readingStrategy.notifyOperationFailure(operationName, attempts, true)
                                    throw tagLostEx
                                }
                            }
                            // If recovery failed or wasn't attempted, check if we should fast-fail
                            if (readingStrategy.isConnectionLikelyLost()) {
                                Log.w(TAG, "Connection permanently lost - aborting $operationName")
                                readingStrategy.notifyOperationFailure(operationName, attempts, true)
                                throw e
                            }
                        }
                        NFCReadingStrategy.ExceptionType.PROTOCOL_ERROR -> {
                            // PICC/protocol errors often require connection reset to clear chip state
                            if (strategy.allowConnectionRecovery && isoDep != null) {
                                Log.d(TAG, "Attempting connection recovery for $operationName (protocol error: PICC/chip state)")
                                vibratePattern(VibrationPattern.ERROR)
                                // Always attempt recovery for protocol errors, even if attempted before
                                // because the chip state needs to be reset
                                try {
                                    if (performConnectionRecovery(isoDep, attempts)) {
                                        // For protocol errors, we DO count this as an attempt since the error is chip-related
                                        // But we give it a fresh connection to work with
                                        Log.d(TAG, "Connection recovered - retrying $operationName with fresh connection")
                                        continue
                                    } else {
                                        Log.w(TAG, "Connection recovery failed for protocol error")
                                    }
                                } catch (tagLostEx: TagLostNeedRedetectionException) {
                                    // Tag is lost - propagate this exception to trigger re-detection flow
                                    Log.w(TAG, "Tag lost during $operationName protocol error recovery - needs re-detection")
                                    readingStrategy.notifyOperationFailure(operationName, attempts, true)
                                    throw tagLostEx
                                }
                            }
                        }
                        else -> {
                            // Continue with retry logic for retryable exceptions
                        }
                    }
                    
                    // If this is our last attempt, don't wait
                    if (attempts >= maxRetries) {
                        break
                    }
                    
                    // Calculate and apply retry delay (reduced for faster UX)
                    val retryDelay = readingStrategy.calculateRetryDelay(attempts, strategy.useExponentialBackoff)
                    Log.d(TAG, "$operationName - waiting ${retryDelay}ms before retry ${attempts + 1}")
                    
                    try {
                        Thread.sleep(retryDelay)
                    } catch (ie: InterruptedException) {
                        Thread.currentThread().interrupt()
                        Log.w(TAG, "$operationName interrupted during retry delay")
                        throw e
                    }
                }
            }
            
            // All retries exhausted
            updateCircuitBreakerState(false, operationName)
            val isFatal = strategy.isCritical || !strategy.isOptional
            readingStrategy.notifyOperationFailure(operationName, attempts, isFatal)
            
            val finalException = lastException ?: IOException("$operationName failed after $attempts attempts")
            Log.e(TAG, "$operationName failed after $attempts attempts: ${exceptionStack(finalException)}")
            throw finalException
        }

        override fun doInBackground(vararg params: Void): Exception? {
            Log.w(TAG, "doInBackground")
            var cardService: CardService? = null
            var service: PassportService? = null
            val startTime = System.currentTimeMillis()

            try {
                eventMessageEmitter("SCAN_STARTED")
                
                if (isCancelled) return null

                // Establish connection with retries - use initial timeout for faster failure detection
                performOperationWithEnhancedRetry({
                    if (!isoDep.isConnected) {
                        isoDep.connect()
                    }
                    isoDep.timeout = readingStrategy.getInitialTimeout("connection")
                }, "Initial connection", RetryStrategy.CONNECTION, isoDep)

                if (isCancelled) {
                    cleanup()
                    return null
                }
                
                // Start watchdog to keep connection alive
                if (readingStrategy.shouldUseWatchdog()) {
                    startWatchdog(isoDep)
                }

                cardService = CardService.getInstance(isoDep)
                service = PassportService(
                    cardService, 
                    PassportService.EXTENDED_MAX_TRANCEIVE_LENGTH, 
                    readingStrategy.getCurrentDataLength(), // Use adaptive data length from strategy
                    true, 
                    true
                )

                performOperationWithEnhancedRetry({
                    cardService.open()
                }, "CardService open", RetryStrategy.CRITICAL)

                if (isCancelled) {
                    service.close()
                    cardService.close()
                    return null
                }

                performOperationWithEnhancedRetry({
                    service.open()
                }, "PassportService open", RetryStrategy.CRITICAL)

                if (isCancelled) {
                    service.close()
                    cardService.close()
                    return null
                }

                var paceSucceeded = false
                var paceInfo: PACEInfo? = null

                Log.w(TAG, "Trying PACE...")
                eventMessageEmitter("PACE_STARTED")
                
                // Step 1: Try to read the card access file with retries for transient errors
                try {
                    performOperationWithEnhancedRetry({
                        val cardAccessFile = CardAccessFile(service.getInputStream(PassportService.EF_CARD_ACCESS))
                        val paceInfos = cardAccessFile.securityInfos
                        if (paceInfos != null && paceInfos.isNotEmpty()) {
                            paceInfo = paceInfos.first() as PACEInfo
                        }
                    }, "Reading PACE info", RetryStrategy.STANDARD, isoDep)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to read PACE info: ${e.message}")
                    // This might mean PACE is not supported or there was a persistent error
                    // Continue to try BAC
                }
                
                // Step 2: If PACE info was found, attempt PACE authentication with retries
                if (paceInfo != null) {
                    try {
                        performOperationWithEnhancedRetry({
                            service.doPACE(bacKey, paceInfo!!.objectIdentifier, PACEInfo.toParameterSpec(paceInfo!!.parameterId))
                        }, "PACE authentication", RetryStrategy.CRITICAL, isoDep)
                        paceSucceeded = true
                        authenticationSucceeded = true
                        Log.w(TAG, "PACE succeeded")
                        // Continue pulsing - no specific haptic for auth success
                        eventMessageEmitter("PACE_SUCCEEDED")
                    } catch (e: Exception) {
                        Log.w(TAG, "PACE authentication failed after retries: ${e.message}")
                        eventMessageEmitter("PACE_FAILED")
                        paceSucceeded = false
                        // PACE failure is not fatal - we'll try BAC
                    }
                } else {
                    Log.w(TAG, "PACE not supported by document - will try BAC")
                    eventMessageEmitter("PACE_NOT_SUPPORTED")
                    paceSucceeded = false
                }

                performOperationWithEnhancedRetry({
                    service.sendSelectApplet(paceSucceeded)
                }, "Select applet", RetryStrategy.CRITICAL, isoDep)

                if (!paceSucceeded) {
                    Log.w(TAG, "Getting EF COM...")
                    try {
                        service.getInputStream(PassportService.EF_COM).read()
                        authenticationSucceeded = true // COM readable without BAC means auth not needed
                    } catch (e: Exception) {
                        Log.w(TAG, "Trying BAC...")
                        eventMessageEmitter("BAC_STARTED")
                        try {
                            performOperationWithEnhancedRetry({
                                service.doBAC(bacKey)
                            }, "BAC authentication", RetryStrategy.CRITICAL, isoDep)
                            authenticationSucceeded = true
                            // Continue pulsing - no specific haptic for auth success
                            eventMessageEmitter("BAC_SUCCEEDED")
                        } catch (bacError: Exception) {
                            // BAC failed - this is likely a credential issue
                            Log.e(TAG, "BAC authentication failed: ${bacError.message}")
                            eventMessageEmitter("BAC_FAILED")
                            authenticationSucceeded = false
                            vibratePattern(VibrationPattern.ERROR)
                            // Re-throw with more informative message
                            throw IOException("Authentication failed. Please verify MRZ data (document number, birth date, expiry date).", bacError)
                        }
                    }
                }

                // Early exit if authentication completely failed
                if (!authenticationSucceeded) {
                    throw IOException("Failed to authenticate with passport. Please check MRZ data.")
                }

                // Read data groups with improved error handling
                // Check cache for COM (using 0 as identifier)
                if (isDataGroupCached(0)) {
                    Log.i(TAG, "COM already cached, skipping read")
                    eventMessageEmitter("GET_COM_CACHED")
                } else {
                    eventMessageEmitter("GET_COM_STARTED")
                    performOperationWithEnhancedRetry({
                        val comIn = service.getInputStream(PassportService.EF_COM)
                        comFile = COMFile(comIn)
                    }, "Reading COM file", RetryStrategy.STANDARD, isoDep)
                    // Cache COM
                    cachedComFile = comFile
                    cacheDataGroup(0, "COM")
                    vibratePattern(VibrationPattern.DATA_GROUP_READ)
                    eventMessageEmitter("GET_COM_SUCCEEDED")
                }

                // Check cache for SOD (using -1 as identifier)
                if (isDataGroupCached(-1)) {
                    Log.i(TAG, "SOD already cached, skipping read")
                    eventMessageEmitter("GET_SOD_CACHED")
                } else {
                    eventMessageEmitter("GET_SOD_STARTED")
                    performOperationWithEnhancedRetry({
                        val sodIn = service.getInputStream(PassportService.EF_SOD)
                        sodFile = SODFile(sodIn)
                    }, "Reading SOD file", RetryStrategy.CRITICAL, isoDep)
                    // Cache SOD
                    cachedSodFile = sodFile
                    cacheDataGroup(-1, "SOD")
                    vibratePattern(VibrationPattern.DATA_GROUP_READ)
                    eventMessageEmitter("GET_SOD_SUCCEEDED")
                }

                // Initialize dataGroupValues if not already from cache
                if (!::dataGroupValues.isInitialized) {
                    dataGroupValues = mutableMapOf<Int, ByteArray>()
                }

                // DG1 and DG2 are always present (required data groups)
                // Check cache for DG1
                if (isDataGroupCached(1)) {
                    Log.i(TAG, "DG1 already cached, skipping read")
                    eventMessageEmitter("GET_DG1_CACHED")
                } else {
                    eventMessageEmitter("GET_DG1_STARTED")
                    performOperationWithEnhancedRetry({
                        val dg1In = service.getInputStream(PassportService.EF_DG1)
                        dg1File = DG1File(dg1In)
                        dataGroupValues[1] = dg1File.encoded
                    }, "Reading DG1", RetryStrategy.STANDARD, isoDep)
                    // Cache DG1
                    cachedDg1File = dg1File
                    cachedDataGroupValues[1] = dataGroupValues[1]!!
                    cacheDataGroup(1, "DG1")
                    vibratePattern(VibrationPattern.DATA_GROUP_READ)
                    eventMessageEmitter("GET_DG1_SUCCEEDED")
                }
                
                // Transform the base64 string into an InputStream
                /*val base64InputStream: InputStream? = if (base64DG2.isNotEmpty()) {
                    val decodedBytes = Base64.decode(base64DG2, Base64.DEFAULT)
                    ByteArrayInputStream(decodedBytes)
                } else {
                    null
                }*/

                // Check cache for DG2
                if (isDataGroupCached(2)) {
                    Log.i(TAG, "DG2 already cached, skipping read")
                    eventMessageEmitter("GET_DG2_CACHED")
                } else {
                    eventMessageEmitter("GET_DG2_STARTED")
                    performOperationWithEnhancedRetry({
                        val dg2In = service.getInputStream(PassportService.EF_DG2)
                        dg2File = DG2File(dg2In)
                        //dg2File = DG2File(base64InputStream)
                        dataGroupValues[2] = dg2File.encoded
                    }, "Reading DG2", RetryStrategy.STANDARD, isoDep)
                    // Cache DG2
                    cachedDg2File = dg2File
                    cachedDataGroupValues[2] = dataGroupValues[2]!!
                    cacheDataGroup(2, "DG2")
                    vibratePattern(VibrationPattern.DATA_GROUP_READ)
                    eventMessageEmitter("GET_DG2_SUCCEEDED")
                }

                // Read optional data groups with smart skipping after consecutive failures
                eventMessageEmitter("OPTIONAL_DG_STARTED")
                // Skip DG5, DG6, DG7 - they are not really useful for us
                //tryReadOptionalDataGroup(service, 5, "DG5", isoDep)
                //tryReadOptionalDataGroup(service, 6, "DG6", isoDep)
                //tryReadOptionalDataGroup(service, 7, "DG7", isoDep)
                // These could be useful for us, but we don't need them for now
                tryReadOptionalDataGroup(service, 11, "DG11", isoDep)
                tryReadOptionalDataGroup(service, 12, "DG12", isoDep)
                tryReadOptionalDataGroup(service, 14, "DG14", isoDep)
                tryReadOptionalDataGroup(service, 15, "DG15", isoDep)
                eventMessageEmitter("OPTIONAL_DG_COMPLETED")

                // Check if photo is already cached (we use 999 as identifier for photo)
                if (bitmap != null && isDataGroupCached(999)) {
                    Log.i(TAG, "Photo already cached, skipping extraction")
                    eventMessageEmitter("GET_PHOTO_CACHED")
                } else {
                    eventMessageEmitter("GET_PHOTO_STARTED")
                    if (isCancelled) {
                        service.close()
                        cardService.close()
                        return null
                    }
                    
                    val allFaceImageInfos = mutableListOf<FaceImageInfo>()
                    val faceInfos = dg2File.faceInfos
                    for (faceInfo in faceInfos) {
                        allFaceImageInfos.addAll(faceInfo.faceImageInfos)
                    }

                    if (allFaceImageInfos.isNotEmpty()) {
                        val faceImageInfo = allFaceImageInfos.first()

                        val imageLength = faceImageInfo.imageLength
                        Log.d(TAG, "DG2 Image extraction: imageLength from JMRTD = $imageLength")
                        Log.d(TAG, "DG2 Image extraction: mimeType = ${faceImageInfo.mimeType}")
                        Log.d(TAG, "DG2 Image extraction: width = ${faceImageInfo.width}, height = ${faceImageInfo.height}")
                        
                        val dataInputStream = DataInputStream(faceImageInfo.imageInputStream)
                        val buffer = ByteArray(imageLength)
                        dataInputStream.readFully(buffer, 0, imageLength)
                        
                        // Log first and last bytes to compare with iOS
                        Log.d(TAG, "DG2 Image data: first 20 bytes = ${buffer.take(20).map { String.format("%02X", it) }}")
                        Log.d(TAG, "DG2 Image data: last 20 bytes = ${buffer.takeLast(20).map { String.format("%02X", it) }}")

                        // Use ImageUtil's trimming method which includes logging
                        val inputStream = ImageUtil.trimTrailingZerosAndCreateStream(buffer, imageLength)

                        bitmap = ImageUtil.decodeImage(reactContext, faceImageInfo.mimeType, inputStream)
                        
                        // Cache the photo
                        cachedBitmap = bitmap
                        cacheDataGroup(999, "Photo")
                    }

                    if (!isCancelled) {
                        vibratePattern(VibrationPattern.DATA_GROUP_READ)
                        eventMessageEmitter("GET_PHOTO_SUCCEEDED")
                    }
                }

            } catch (tagLostEx: TagLostNeedRedetectionException) {
                // Tag was lost and needs re-detection - this is a recoverable error
                Log.w(TAG, "Tag lost during read - needs re-detection: ${tagLostEx.message}")
                if (!isCancelled) {
                    eventMessageEmitter("TAG_LOST_NEED_REDETECTION")
                    return tagLostEx // Return this special exception for handling in onPostExecute
                }
            } catch (e: Exception) {
                if (!isCancelled) {
                    eventMessageEmitter("PASSPORT_READ_FAILED")
                    return e
                }
            } finally {
                try {
                    // Always clean up resources
                    service?.close()
                    cardService?.close()
                } catch (e: Exception) {
                    Log.w(TAG, "Error closing services: ${exceptionStack(e)}")
                }
                stopWatchdog()
            }
            return null
        }
        
        private fun tryReadOptionalDataGroup(service: PassportService, dgNumber: Int, dgName: String, isoDep: IsoDep) {
            if (isCancelled) return
            
            // Check if this data group is already cached
            if (isDataGroupCached(dgNumber)) {
                Log.i(TAG, "$dgName already cached, skipping read")
                eventMessageEmitter("GET_${dgName}_CACHED")
                return
            }
            
            // Smart skipping: if we've had too many consecutive optional DG failures, skip remaining ones
            if (readingStrategy.shouldSkipOptionalDataGroups()) {
                Log.d(TAG, "Skipping $dgName due to previous failures")
                eventMessageEmitter("GET_${dgName}_SKIPPED")
                return
            }
            
            // Also check if connection is likely lost - don't waste time on optional DGs
            if (readingStrategy.isConnectionLikelyLost()) {
                Log.d(TAG, "Skipping $dgName - connection appears lost")
                eventMessageEmitter("GET_${dgName}_SKIPPED")
                return
            }
            
            try {
                eventMessageEmitter("GET_${dgName}_STARTED")
                val efId = when (dgNumber) {
                    5 -> PassportService.EF_DG5
                    6 -> PassportService.EF_DG6
                    7 -> PassportService.EF_DG7
                    11 -> PassportService.EF_DG11
                    12 -> PassportService.EF_DG12
                    14 -> PassportService.EF_DG14
                    15 -> PassportService.EF_DG15
                    else -> return
                }
                
                performOperationWithEnhancedRetry({
                    val dgIn = service.getInputStream(efId)
                    val dgData = when (dgNumber) {
                        5 -> DG5File(dgIn).encoded
                        6 -> DG6File(dgIn).encoded
                        7 -> DG7File(dgIn).encoded
                        11 -> DG11File(dgIn).encoded
                        12 -> DG12File(dgIn).encoded
                        14 -> DG14File(dgIn).encoded
                        15 -> DG15File(dgIn).encoded
                        else -> return@performOperationWithEnhancedRetry
                    }
                    dataGroupValues[dgNumber] = dgData
                }, "Reading $dgName", RetryStrategy.OPTIONAL, isoDep)
                
                // Cache this optional data group
                cachedDataGroupValues[dgNumber] = dataGroupValues[dgNumber]!!
                cacheDataGroup(dgNumber, dgName)
                vibratePattern(VibrationPattern.DATA_GROUP_READ)
                eventMessageEmitter("GET_${dgName}_SUCCEEDED")
            } catch (e: Exception) {
                // For optional data groups, failures are acceptable
                val exceptionType = readingStrategy.classifyException(e)
                when (exceptionType) {
                    NFCReadingStrategy.ExceptionType.NON_RETRYABLE -> {
                        Log.d(TAG, "$dgName not available: ${e.message}")
                    }
                    NFCReadingStrategy.ExceptionType.CONNECTION_LOST -> {
                        Log.w(TAG, "$dgName skipped - connection issue: ${e.message}")
                    }
                    NFCReadingStrategy.ExceptionType.PROTOCOL_ERROR -> {
                        Log.w(TAG, "$dgName skipped - protocol/chip error: ${e.message}")
                    }
                    else -> {
                        Log.d(TAG, "$dgName failed: ${e.message}")
                    }
                }
                eventMessageEmitter("GET_${dgName}_FAILED")
            }
        }

        override fun onCancelled(result: Exception?) {
            super.onCancelled(result)
            cleanup()
            resetState()
        }

        private fun indexOf(outerArray: ByteArray, smallerArray: ByteArray): Int {
            for (i in 0..outerArray.size - smallerArray.size) {
                var found = true
                for (j in smallerArray.indices) {
                    if (outerArray[i + j] != smallerArray[j]) {
                        found = false
                        break
                    }
                }
                if (found) return i
            }
            return -1
        }

        override fun onPostExecute(result: Exception?) {
            if (scanPromise == null) return

            if (result != null) {
                Log.w(TAG, exceptionStack(result))
                
                // Check if this is a tag lost exception that can be recovered with re-detection
                if (result is TagLostNeedRedetectionException) {
                    Log.i(TAG, "Tag lost - attempting re-detection recovery")
                    // Don't vibrate error here - handleConnectionLossAndWaitForRetag will do it
                    if (handleConnectionLossAndWaitForRetag(result.message ?: "Tag lost")) {
                        // Successfully initiated re-detection flow
                        // DON'T reset state or reject promise - we're waiting for new tag
                        Log.d(TAG, "Waiting for user to reposition phone for tag re-detection")
                        return
                    } else {
                        // Max attempts reached - fail the scan
                        Log.w(TAG, "Max re-detection attempts reached - failing scan")
                        vibratePattern(VibrationPattern.ERROR)
                        scanPromise?.reject(E_SCAN_FAILED_DISCONNECT, 
                            "Lost connection to passport chip after multiple attempts. Please try the scan again.")
                        eventMessageEmitter("CONNECTION_LOST_MAX_RETRIES")
                        resetState()
                        return
                    }
                }
                
                vibratePattern(VibrationPattern.ERROR)
                
                // Provide more specific error codes and messages
                val errorMessage = result.message ?: "Unknown error"
                val isAuthError = errorMessage.lowercase().let { 
                    it.contains("authentication") || it.contains("bac") || 
                    it.contains("pace") || it.contains("mrz") 
                }
                val isConnectionError = result is IOException || errorMessage.lowercase().let {
                    it.contains("connection") || it.contains("lost") || 
                    it.contains("disconnect") || it.contains("tag")
                }
                
                when {
                    isAuthError -> {
                        scanPromise?.reject(E_SCAN_FAILED_AUTH, "Authentication failed. Please verify document details (number, birth date, expiry date).")
                        eventMessageEmitter("AUTH_FAILED")
                    }
                    isConnectionError -> {
                        // For generic connection errors, also try re-detection if we haven't maxed out
                        if (handleConnectionLossAndWaitForRetag(errorMessage)) {
                            Log.d(TAG, "Connection error - waiting for tag re-detection")
                            return
                        }
                        scanPromise?.reject(E_SCAN_FAILED_DISCONNECT, "Lost connection to passport chip. Please hold the phone steady and try again.")
                        eventMessageEmitter("CONNECTION_LOST")
                    }
                    else -> {
                        scanPromise?.reject(E_SCAN_FAILED, "Scan failed: $errorMessage")
                    }
                }

                resetState()
                return
            }

            val mrzInfo = dg1File.mrzInfo

            val gson = Gson()

            val passport = Arguments.createMap()

            eventMessageEmitter("PREP_DATA")

            try {
                val docSigningCertificate = sodFile.docSigningCertificate

                Log.w(TAG, "DataGroupHashes hashing algorithm: ${sodFile.digestAlgorithm}")

                val signatureAlgorithm = docSigningCertificate.sigAlgName
                passport.putString("sodSignatureAlgorithm", signatureAlgorithm)
                passport.putArray("tbsCertificate", fromArrayToWritableArray(docSigningCertificate.tbsCertificate))
                passport.putArray("dscSignature", fromArrayToWritableArray(docSigningCertificate.signature))
                passport.putString("dscSignatureAlgorithm", docSigningCertificate.sigAlgName)

                passport.putString("mrz", mrzInfo.toString())
                passport.putString("dataGroupHashes", gson.toJson(sodFile.dataGroupHashes))
                passport.putString("dataGroupValues", gson.toJson(dataGroupValues))
                passport.putArray("signedAttributes", fromArrayToWritableArray(sodFile.eContent))
                passport.putArray("sodSignature", fromArrayToWritableArray(sodFile.encryptedDigest))
                passport.putArray("sod", fromArrayToWritableArray(sodFile.encoded))
                passport.putString("LDSVersion", comFile.ldsVersion)

                val digestAlgorithmIdentifier = AlgorithmIdentifier(ASN1ObjectIdentifier(SignedDataUtil.lookupOIDByMnemonic("SHA256")))
                val securityObject: LDSSecurityObject
                val dataGroupHashes = sodFile.dataGroupHashes
                val dataGroupHashesArray = dataGroupHashes.map { (dataGroupNumber, hashBytes) ->
                    DataGroupHash(dataGroupNumber, DEROctetString(hashBytes))
                }.toTypedArray()

                securityObject = if (sodFile.ldsVersion == null || sodFile.unicodeVersion == null) {
                    LDSSecurityObject(digestAlgorithmIdentifier, dataGroupHashesArray)
                } else {
                    val ldsVersionInfo = LDSVersionInfo(sodFile.ldsVersion, sodFile.unicodeVersion)
                    LDSSecurityObject(digestAlgorithmIdentifier, dataGroupHashesArray, ldsVersionInfo)
                }

                // hash of all the data groups with some padding
                val encodedSecurityObject = securityObject.encoded
                // The first bytes of encodedSecurityObject are the padding provided used when
                // generating the final hash contained in eContent
                // It varies from document to document so we are retrieving it in order to provide as
                // input to the circuit
                // However, the padding coming before each data group hash is the same for all documents
                /*val prehashPaddingEndSequence = byteArrayOf(48, 37, 2, 1, 1, 4, 32)
                val prehashPaddingEndSequenceIndex = indexOf(encodedSecurityObject, prehashPaddingEndSequence)
                val prehashPadding = encodedSecurityObject.copyOfRange(0, prehashPaddingEndSequenceIndex)

                passport.putArray("prehashPadding", fromArrayToWritableArray(prehashPadding))*/

                val publicKey = docSigningCertificate.publicKey
                if (publicKey is RSAPublicKey) {
                    passport.putArray("modulus", fromArrayToWritableArray(publicKey.modulus.toByteArray()))
                    passport.putArray("exponent", fromArrayToWritableArray(publicKey.publicExponent.toByteArray()))
                } else if (publicKey is ECPublicKey) {
                    passport.putArray("publicKeyX", fromArrayToWritableArray(publicKey.w.affineX.toByteArray()))
                    passport.putArray("publicKeyY", fromArrayToWritableArray(publicKey.w.affineY.toByteArray()))
                    passport.putString("curveA", publicKey.params.curve.a.toString())
                    passport.putString("curveB", publicKey.params.curve.b.toString())
                    passport.putString("curveField", publicKey.params.curve.field.toString())
                }
            } catch (e: Exception) {
                Log.e(TAG, "error fetching the Document Signing Certificate: $e")
            }

            val quality = if (opts?.hasKey("quality") == true) {
                (opts?.getDouble("quality")!! * 100).toInt()
            } else {
                100
            }

            var photo = Arguments.createMap()
            if (bitmap != null) {
                val base64 = toBase64(bitmap!!, quality)
                photo.putString("base64", base64)
                photo.putInt("width", bitmap!!.width)
                photo.putInt("height", bitmap!!.height)
            } else {
                photo.putString("base64", "")
                photo.putInt("width", 0)
                photo.putInt("height", 0)
            }

            // Try to get name from DG11 first, fallback to MRZ
            var firstName: String
            var lastName: String
            var fullName: String
            
            try {
                if (dataGroupValues.containsKey(11)) {
                    val dg11Stream = ByteArrayInputStream(dataGroupValues[11])
                    val dg11 = DG11File(dg11Stream)
                    val nameOfHolder = dg11.nameOfHolder
                    
                    if (!nameOfHolder.isNullOrBlank()) {
                        // DG11 nameOfHolder format is typically "LAST<<FIRST<MIDDLE" or just the full name
                        if (nameOfHolder.contains("<<")) {
                            val parts = nameOfHolder.split("<<")
                            lastName = parts[0].replace("<", " ").trim()
                            firstName = if (parts.size > 1) parts[1].replace("<", " ").trim() else ""
                        } else if (nameOfHolder.contains("<")) {
                            // Format might be "LAST<FIRST<MIDDLE"
                            val parts = nameOfHolder.split("<")
                            lastName = parts[0].trim()
                            firstName = parts.drop(1).joinToString(" ").trim()
                        } else {
                            // Just a plain name, try to split by space
                            val nameParts = nameOfHolder.trim().split(" ")
                            if (nameParts.size > 1) {
                                firstName = nameParts.dropLast(1).joinToString(" ")
                                lastName = nameParts.last()
                            } else {
                                firstName = nameOfHolder.trim()
                                lastName = ""
                            }
                        }
                        fullName = "${firstName} ${lastName}".trim()
                        Log.d(TAG, "Using name from DG11: $fullName")
                    } else {
                        throw Exception("DG11 nameOfHolder is empty")
                    }
                } else {
                    throw Exception("DG11 not available")
                }
            } catch (e: Exception) {
                // Fallback to MRZ info
                Log.d(TAG, "Falling back to MRZ for name: ${e.message}")
                firstName = mrzInfo.secondaryIdentifier.replace("<", " ").trim()
                lastName = mrzInfo.primaryIdentifier.replace("<", " ").trim()
                fullName = "${firstName} ${lastName}".trim()
            }

            passport.putMap(KEY_PHOTO, photo)
            // Only take the first of the given names
            passport.putString(KEY_FIRST_NAME, if (firstName.isNotBlank()) firstName.split(" ")[0] else "")
            passport.putString(KEY_LAST_NAME, if (lastName.isNotBlank()) lastName else "")
            passport.putString(KEY_NATIONALITY, mrzInfo.nationality)
            passport.putString(KEY_GENDER, mrzInfo.gender.toString())
            passport.putString(KEY_ISSUER, mrzInfo.issuingState)
            passport.putString("fullname", fullName)

            passport.putString("documentType", mrzInfo.documentCode)
            passport.putString("documentNumber", mrzInfo.documentNumber)
            passport.putString("documentExpiryDate", mrzInfo.dateOfExpiry)
            passport.putString("dateOfBirth", mrzInfo.dateOfBirth)
            
            // Extract dateOfIssue from DG12 if available
            var dateOfIssue = ""
            try {
                if (dataGroupValues.containsKey(12)) {
                    val dg12Stream = ByteArrayInputStream(dataGroupValues[12])
                    val dg12 = DG12File(dg12Stream)
                    dateOfIssue = dg12.dateOfIssue ?: ""
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to extract dateOfIssue from DG12: ${e.message}")
            }
            passport.putString("dateOfIssue", dateOfIssue)

            // Vibrate for successful completion
            vibratePattern(VibrationPattern.COMPLETION)
            scanPromise?.resolve(passport)
            resetState()
        }
    }

    private fun eventMessageEmitter(message: String) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("PassportReaderEvent", message)
        } else {
            Log.d(TAG, "Error")
        }
    }

    @ReactMethod
    fun getNfcStatus(promise: Promise) {
        val mNfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
        val status = Arguments.createMap()
        
        status.putBoolean("isSupported", mNfcAdapter != null)
        status.putBoolean("isEnabled", mNfcAdapter?.isEnabled == true)
        status.putBoolean("isReading", isReading.get())
        status.putBoolean("hasActivePromise", scanPromise != null)
        status.putBoolean("isCircuitBreakerOpen", isCircuitBreakerOpen)
        status.putBoolean("hapticFeedbackEnabled", hapticFeedbackEnabled)
        
        promise.resolve(status)
    }

    @ReactMethod
    fun setHapticFeedback(enabled: Boolean, promise: Promise) {
        hapticFeedbackEnabled = enabled
        Log.d(TAG, "Haptic feedback ${if (enabled) "enabled" else "disabled"}")
        promise.resolve(enabled)
    }

    @ReactMethod
    fun testVibration(pattern: String, promise: Promise) {
        try {
            val vibrationPattern = when (pattern.uppercase()) {
                "CHIP_DETECTED" -> VibrationPattern.CHIP_DETECTED
                "DATA_GROUP_READ" -> VibrationPattern.DATA_GROUP_READ
                "COMPLETION" -> VibrationPattern.COMPLETION
                "ERROR" -> VibrationPattern.ERROR
                "STOP_PULSING" -> VibrationPattern.STOP_PULSING
                else -> {
                    promise.reject("INVALID_PATTERN", "Invalid vibration pattern: $pattern. Valid patterns: CHIP_DETECTED, DATA_GROUP_READ, COMPLETION, ERROR, STOP_PULSING")
                    return
                }
            }
            vibratePattern(vibrationPattern)
            promise.resolve("Vibration test completed")
        } catch (e: Exception) {
            promise.reject("VIBRATION_ERROR", "Failed to test vibration: ${e.message}")
        }
    }

    @ReactMethod
    fun getReadingStrategyStatus(promise: Promise) {
        try {
            val status = Arguments.createMap().apply {
                putInt("currentDataLength", readingStrategy.getCurrentDataLength())
                putBoolean("shouldSkipOptionalDGs", readingStrategy.shouldSkipOptionalDataGroups())
                putBoolean("isConnectionLikelyLost", readingStrategy.isConnectionLikelyLost())
                putBoolean("shouldUseWatchdog", readingStrategy.shouldUseWatchdog())
                putInt("recommendedRetryCount", readingStrategy.getRecommendedRetryCount())
                putDouble("recommendedRetryDelay", readingStrategy.getRecommendedRetryDelay().toDouble())
            }
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", "Failed to get reading strategy status: ${e.message}")
        }
    }
}
