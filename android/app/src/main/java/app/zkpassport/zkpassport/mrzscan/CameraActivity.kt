/*
 * Copyright 2017 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package app.zkpassport.zkpassport.mrzscan

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

import org.jmrtd.lds.icao.MRZInfo

import app.zkpassport.zkpassport.R

class CameraActivity : AppCompatActivity(), CameraMLKitFragment.CameraMLKitCallback {
    // Indicates if the MRZ has been seen at least once
    private var mrzSeen = false
    // Indicates if the MRZ has been fully detected and parsed
    private var mrzDetected = false
    private var processing = false

    // Handler and runnable management for proper cleanup
    private val mainHandler = Handler(Looper.getMainLooper())
    private val pendingRunnables = mutableSetOf<Runnable>()

    // Timeout runnable reference
    private var timeoutRunnable: Runnable? = null

    /**
     * Post a delayed runnable with proper tracking for cleanup
     */
    private fun postDelayedManaged(action: () -> Unit, delayMillis: Long): Runnable {
        val runnable = object : Runnable {
            override fun run() {
                // Remove from tracking when executed
                synchronized(pendingRunnables) {
                    pendingRunnables.remove(this)
                }
                // Execute the action only if activity is still processing
                if (processing && !isFinishing && !isDestroyed) {
                    action()
                }
            }
        }

        synchronized(pendingRunnables) {
            pendingRunnables.add(runnable)
        }

        mainHandler.postDelayed(runnable, delayMillis)
        return runnable
    }

    /**
     * Cancel all pending handlers and clear tracking
     */
    private fun cancelAllPendingHandlers() {
        synchronized(pendingRunnables) {
            pendingRunnables.forEach { runnable ->
                mainHandler.removeCallbacks(runnable)
            }
            pendingRunnables.clear()
        }
        debug("Canceled all pending handlers")
    }

    /**
     * Keep screen awake during camera scanning to prevent sleep interruption
     */
    private fun keepScreenAwake(awake: Boolean) {
        if (awake) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            debug("Screen wake lock enabled - screen will stay awake during scanning")
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            debug("Screen wake lock disabled - normal sleep behavior restored")
        }
    }

    /**
     * Clean up screen wake lock if it was enabled
     */
    private fun cleanupScreenWakeLock() {
        if (MRZScanConfig.keepScreenAwake) {
            keepScreenAwake(false)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_camera)

        // Keep screen awake during MRZ scanning (if enabled in config)
        if (MRZScanConfig.keepScreenAwake) {
            keepScreenAwake(true)
        }

        // Configure MRZ scanning
        MRZScanConfig.enableDebugLogging = false
        MRZScanConfig.showDebugImageView = false


        mrzDetected = false
        processing = true
        adaptiveConfiguration()

        // Extract document type for placeholder configuration
        val documentType = intent.getStringExtra(IntentData.KEY_DOCUMENT_TYPE)

        // Use Camera fragment
        val fragment = CameraMLKitFragment.newInstance(documentType)

        supportFragmentManager.beginTransaction()
                .replace(R.id.container, fragment)
                .commit()

        // Start 60-second timeout timer
        startScanTimeout()
    }

    /**
     * Start a 60-second timeout timer for MRZ scanning
     * If no MRZ is detected within 60 seconds, exit with timeout result
     */
    private fun startScanTimeout() {
        timeoutRunnable = Runnable {
            if (!mrzDetected && processing) {
                debug("MRZ scan timeout reached (60 seconds)")
                onScanTimeout()
            }
        }
        timeoutRunnable?.let { runnable ->
            mainHandler.postDelayed(runnable, 60000)
            debug("Started 60-second timeout timer for MRZ scanning")
        }
    }

    /**
     * Cancel the scan timeout timer
     */
    private fun cancelScanTimeout() {
        timeoutRunnable?.let { runnable ->
            mainHandler.removeCallbacks(runnable)
            timeoutRunnable = null
            debug("Canceled scan timeout timer")
        }
    }

    /**
     * Reset the scan timeout timer - called when a valid MRZ frame is detected
     * This ensures the timeout only triggers after 60 seconds of no valid frames
     */
    private fun resetScanTimeout() {
        cancelScanTimeout()
        startScanTimeout()
        debug("Reset scan timeout - valid MRZ frame detected")
    }

    /**
     * Handle scan timeout - exit camera and return timeout result
     */
    private fun onScanTimeout() {
        processing = false
        cleanupScreenWakeLock()
        cancelAllPendingHandlers()
        cancelScanTimeout()

        val fragment = supportFragmentManager.findFragmentById(R.id.container) as? CameraMLKitFragment
        if (fragment != null) {
            fragment.showTimeoutState {
                finishWithTimeoutResult()
            }
        } else {
            finishWithTimeoutResult()
        }
    }

    private fun finishWithTimeoutResult() {
        val intent = Intent()
        intent.putExtra(IntentData.KEY_TIMEOUT, true)
        setResult(IntentData.RESULT_CODE_TIMEOUT, intent)
        finish()
    }

    private fun waitUntilMRZSeen(callback: () -> Unit){
        postDelayedManaged({
            debug("MRZ seen: $mrzSeen, processing: $processing")
            if (!mrzSeen && processing) {
                debug("MRZ not seen, looping")
                waitUntilMRZSeen(callback)
            } else if(mrzSeen && processing) {
                debug("MRZ seen, calling callback")
                callback()
            }
        }, 2000)
    }

    private fun switchToLowConfidenceMode() {
        if (!mrzDetected && processing) {
            debug("Switching to binarized low confidence mode")
            MRZScanConfig.applyBinarizedLowConfidenceMode()
        }

        // After 20 seconds, recurse to start again with binarized
        postDelayedManaged({
            if (!mrzDetected && processing) {
                debug("Switching back to binarized low confidence mode")
                switchToLowConfidenceMode()
            }
        }, 20000)
    }


    private fun adaptiveConfiguration() {
        // Start with low confidence mode WITH binarization (consensus mode for best accuracy)
        debug("Starting with binarized low confidence mode (consensus mode)")
        MRZScanConfig.applyBinarizedLowConfidenceMode()

        // As soon as the MRZ is seen, start the timers
        waitUntilMRZSeen {

            // After 20 seconds, cycle back to binarized low confidence mode
            postDelayedManaged({
                if (!mrzDetected && processing) {
                    debug("Cycling back to binarized low confidence mode")
                    switchToLowConfidenceMode()
                }
            }, 20000)
        }

        debug("""
                MRZ Scan Configuration:
                - Preprocessing: ${MRZScanConfig.enablePreprocessing}
                - Multi-frame: ${MRZScanConfig.enableMultiFrame}
                - Advanced correction: ${MRZScanConfig.enableAdvancedCorrection}
                - ML Kit alternation: ${MRZScanConfig.enableMLKitAlternation}
                - Min confidence: ${MRZScanConfig.minConfidence}
                - Max frames: ${MRZScanConfig.maxProcessingFrames}
                - Debug view: ${MRZScanConfig.showDebugImageView}
                - Debug logging: ${MRZScanConfig.enableDebugLogging}
                - Image rotation: ${MRZScanConfig.imageRotation}°
                - Use highest resolution: ${MRZScanConfig.useHighestAvailableResolution}
                - Camera resolution: ${MRZScanConfig.cameraResolutionWidth}x${MRZScanConfig.cameraResolutionHeight}
                - Max resolution: ${MRZScanConfig.maxCameraResolutionWidth}x${MRZScanConfig.maxCameraResolutionHeight}
                - Keep screen awake: ${MRZScanConfig.keepScreenAwake}
                - Haptic feedback: ${MRZScanConfig.enableHapticFeedback}
                - MRZ overlay: ${MRZScanConfig.enableMRZOverlay}
                - Overlay text size: ${MRZScanConfig.overlayTextSize}sp
                - Show placeholder: ${MRZScanConfig.showPlaceholderMRZ}
            """.trimIndent())
    }

    override fun onBackPressed() {
        setResult(Activity.RESULT_CANCELED)
        processing = false
        cleanupScreenWakeLock()
        cancelAllPendingHandlers()
        cancelScanTimeout()
        finish()
    }

    override fun onPassportRead(mrz: String, confidence: Float) {
        debug("MRZ read with confidence: ${(confidence * 100).toInt()}%")
        mrzDetected = true
        val intent = Intent()
        intent.putExtra(IntentData.KEY_MRZ, mrz)
        intent.putExtra(IntentData.KEY_CONFIDENCE, confidence)
        setResult(Activity.RESULT_OK, intent)
        processing = false
        cleanupScreenWakeLock()
        cancelAllPendingHandlers()
        cancelScanTimeout()
        finish()
    }

    override fun onMRZSeen() {
        mrzSeen = true // Mark MRZ as seen
    }

    override fun onError(message: String?) {
        Log.e(TAG, "MRZ reading error: $message")
        processing = false
        cleanupScreenWakeLock()
        cancelAllPendingHandlers()
        cancelScanTimeout()
        onBackPressed()
    }

    override fun onProcessingUpdate(status: String) {
        debug("Processing status: $status")
        // Could update UI with processing status if needed
    }

    override fun onScanProgress(currentFrames: Int, requiredFrames: Int) {
        // Every time we see a valid frame, reset the timeout
        if (currentFrames > 0) {
            resetScanTimeout()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        processing = false
        cleanupScreenWakeLock()
        cancelAllPendingHandlers()
        cancelScanTimeout()

        // Clean up Tesseract engine if this is the last activity being destroyed
        if (isFinishing) {
            debug("Activity finishing, scheduling Tesseract cleanup")
            TesseractEngineManager.forceCleanup()
            debug("Tesseract engine cleanup completed")
        }

        debug("Activity destroyed, screen wake lock cleaned up, all handlers canceled")
    }

    override fun onPause() {
        super.onPause()
        // Cancel handlers when activity is paused to avoid background processing
        if (isFinishing) {
            processing = false
            cleanupScreenWakeLock()
            cancelAllPendingHandlers()
            cancelScanTimeout()
            debug("Activity finishing, screen wake lock cleaned up, handlers canceled in onPause")
        }
    }

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    companion object {
        private val TAG = CameraActivity::class.java.simpleName
    }
}
