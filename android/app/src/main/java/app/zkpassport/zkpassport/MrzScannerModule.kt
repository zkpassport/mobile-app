package app.zkpassport.zkpassport

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import app.zkpassport.zkpassport.mrzscan.CameraActivity
import app.zkpassport.zkpassport.mrzscan.IntentData
import org.jmrtd.lds.icao.MRZInfo

class MrzScannerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var promise: Promise? = null

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == 1) {
                when (resultCode) {
                    Activity.RESULT_OK -> {
                        val mrz = data?.getSerializableExtra(IntentData.KEY_MRZ) as? String
                        val confidence = data?.getFloatExtra(IntentData.KEY_CONFIDENCE, 0f) ?: 0f

                        if (mrz != null) {
                            // Create a result map with MRZ info and confidence
                            val result = Arguments.createMap().apply {
                                putString("mrz", mrz)
                                putDouble("confidence", confidence.toDouble())
                            }
                            promise?.resolve(result)
                        } else {
                            promise?.reject("ERROR", "MRZ info not found")
                        }
                    }
                    Activity.RESULT_CANCELED -> {
                        promise?.reject("CANCELLED", "Camera activity cancelled")
                    }
                    IntentData.RESULT_CODE_TIMEOUT -> {
                        // MRZ scan timeout reached (60 seconds)
                        promise?.reject("TIMEOUT", "MRZ scan timeout - no code detected within 60 seconds")
                    }
                }
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "MrzScannerModule"

    @ReactMethod
    fun scan(options: ReadableMap?, promise: Promise) {
        this.promise = promise
        val intent = Intent(reactContext, CameraActivity::class.java)
        
        // Extract document type from options if provided
        options?.let { opts ->
            if (opts.hasKey("documentType")) {
                val documentType = opts.getString("documentType")
                intent.putExtra(IntentData.KEY_DOCUMENT_TYPE, documentType)
            }
        }
        
        currentActivity?.startActivityForResult(intent, 1)
    }
}