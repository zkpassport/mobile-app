package app.zkpassport.zkpassport

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Map
import java.util.HashMap
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.Arguments
import androidx.annotation.NonNull
import android.net.Uri
import com.facebook.react.bridge.Promise
import java.io.IOException
import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import android.content.res.AssetManager
import java.io.InputStream

import android.util.Log
import com.google.gson.Gson
import com.noirandroid.lib.Circuit
import com.noirandroid.lib.Noir
import android.os.Environment
import android.os.StatFs
import kotlin.math.max

class NoirModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "NoirModule"
    var circuits: HashMap<String, Circuit> = HashMap()

    companion object {
        const val MAX_SRS_CIRCUIT_SIZE: Int = 2097152 // 2^21
        var globalSrsNumPoints: Int = 0
        val srsLock = Any()
    }

    fun setupGlobalSrsIfNeeded(srsPath: String?): Int {
        synchronized(srsLock) {
            if (globalSrsNumPoints == 0) {
                globalSrsNumPoints = Noir.setup_srs(MAX_SRS_CIRCUIT_SIZE, srsPath)
            }
            return globalSrsNumPoints
        }
    }

    fun getFreeDiskSpace(): Long {
        val stat = StatFs(Environment.getDataDirectory().path)
        return stat.availableBytes
    }

    fun loadCircuit(circuitData: String, size: Int, lowMemoryMode: Boolean, promise: Promise): String? {
        try {
            // Get free disk space and subtract 1GB to leave some margin space
            val freeDiskSpace = if (lowMemoryMode) max(0, getFreeDiskSpace() - 1024 * 1024 * 1024) else 0
            val circuit = Circuit.fromJsonManifest(circuitData, size, lowMemoryMode && freeDiskSpace > 0, freeDiskSpace)
            val id = circuit.manifest.hash.toLong().toString()
            circuits.put(id, circuit)
            return id
        } catch (e: Exception){
            Log.d("CIRCUIT_LOAD_FAIL", e.toString());
            promise.reject("CIRCUIT_LOAD_FAIL", "Unable to load circuit. Please check the circuit was compiled with the correct version of Noir")
        }
        return null
    }


    /**
     * Write a raw resource to a file in the app's internal storage
     * We need to do that since noir_rs expects a path to the srs file
     * and we can't get a path to a resource
     * @param resourceId The resource id of the file to write to storage
     * @param fileName The name of the file to write to storage
     */
    fun writeRawResourceToFile(resourceId: Int, fileName: String): String {
        val inputStream = reactApplicationContext.resources.openRawResource(resourceId)
        val file = File(reactApplicationContext.filesDir, fileName)
        val fileOutputStream = FileOutputStream(file)

        try {
            val buffer = ByteArray(1024)
            var length: Int
  
            while (inputStream.read(buffer).also { length = it } != -1) {
                fileOutputStream.write(buffer, 0, length)
            }
  
            return file.absolutePath
        } finally {
            fileOutputStream.close()
            inputStream.close()
        }
    }

    fun getLocalSrsPathFromAssetManager(): String? {
        val file = File(reactApplicationContext.filesDir, "local_srs_21")
        if (file.exists()) {
            Log.d("SRS_FILE_FOUND", "Found srs_21.local via asset manager: $file.absolutePath, size: ${file.length()} bytes")
            return file.absolutePath
        }
        val assetManager: AssetManager = reactApplicationContext.assets
        val stream: InputStream = assetManager.open("srs_21.local")
        val fileOutputStream = FileOutputStream(file)
        stream.copyTo(fileOutputStream)
        fileOutputStream.close()
        stream.close()
        Log.d("SRS_FILE_WRITTEN", "srs_21.local file written to internal storage")
        return file.absolutePath
    }
    
    fun getLocalSrsPath(): String? {
        // First, check if SRS is available via Play Asset Delivery
        try {
            val srsPath = getLocalSrsPathFromAssetManager()
            return srsPath
        } catch (e: Exception) {
            Log.d("SRS_ASSET_DELIVERY", "Play Asset Delivery not available or asset pack not downloaded: ${e.message}")
        }

        // Fallback: Try to load from bundled resources (for development/testing)
        val resId = reactApplicationContext.resources.getIdentifier("srs_21", "raw", reactApplicationContext.packageName)
        if (resId == 0) {
            Log.d("SRS_FILE_NOT_FOUND", "srs_21.local file not found in Play Asset Delivery or bundled, reverting to online SRS")
            return null
        }

        Log.d("SRS_FILE_BUNDLED", "Using bundled srs_21.local from resources (development mode)")

        // Delete old srs file to free up space
        val oldSrsFile = File(reactApplicationContext.filesDir, "local_srs")
        if (oldSrsFile.exists()) {
            oldSrsFile.delete()
            Log.d("SRS_FILE_DELETED", "old srs file deleted")
        }

        val srsFile = File(reactApplicationContext.filesDir, "local_srs_21")
        if (srsFile.exists()) {
            val srsSize = srsFile.length()
            Log.d("SRS_FILE_SIZE", "srs.local found in internal storage is " + srsSize.toString() + " bytes")
            return srsFile.absolutePath
        }
        val srsPath = writeRawResourceToFile(resId, "local_srs_21")
        Log.d("SRS_FILE_WRITTEN", "srs.local file written to internal storage")
        return srsPath
    }

    @ReactMethod fun prepareSrs(promise: Promise) {
        Thread {
            getLocalSrsPath()
            
            var result = Arguments.createMap()
            result.putBoolean("success", true)
            promise.resolve(result)
        }.start()
    }

    @ReactMethod fun setupCircuit(circuitData: String, size: Int, lowMemoryMode: Boolean, promise: Promise) {
        Thread {
            val circuitId = loadCircuit(circuitData, size, lowMemoryMode, promise)
            if (circuitId == null) {
                promise.reject("CIRCUIT_LOAD_FAIL", "Unable to load circuit. Please check the circuit was compiled with the correct version of Noir")
                return@Thread
            }

            val circuit = circuits.get(circuitId)

            val localSrs = getLocalSrsPath()

            circuit?.num_points = setupGlobalSrsIfNeeded(localSrs)

            var result: WritableMap = Arguments.createMap()
            result.putString("circuitId", circuitId)
            promise.resolve(result)
        }.start()
     }

    @ReactMethod fun prove(inputs: ReadableMap, circuitId: String, vk: String, promise: Promise) {
        Thread {
            val circuit = circuits.get(circuitId)
            if (circuit == null) {
                promise.reject("CIRCUIT_NOT_LOADED", "Circuit not loaded. Please load the circuit before generating a proof")
                return@Thread
            }

            try {
                // Convert to non-nullable map
                val inputMap = inputs.toHashMap().mapValues { it.value ?: "" }
                var proof: String? = circuit.prove(inputMap, vk)

                var result: WritableMap = Arguments.createMap()
                result.putString("proof", proof)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.d("PROOF_GENERATION_ERROR", e.toString())
                promise.reject("PROOF_GENERATION_ERROR", "Unable to generate the proof")
            }
        }.start()
    }

    @ReactMethod fun verify(proof: String, circuitId: String, vk: String, promise: Promise) {
        Thread {
            val circuit = circuits.get(circuitId)
            if (circuit == null) {
                promise.reject("CIRCUIT_NOT_LOADED", "Circuit not loaded. Please load the circuit before verifying a proof")
                return@Thread
            }

            try {
                var verified: Boolean? = circuit.verify(proof, vk)

                var result: WritableMap = Arguments.createMap()
                result.putBoolean("verified", verified!!)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.d("PROOF_VERIFICATION_ERROR", e.toString())
                promise.reject("PROOF_VERIFICATION_ERROR", "Unable to verify the proof. Check the proof is formatted correctly")
            }
        }.start()
    }

    @ReactMethod fun execute(inputs: ReadableMap, circuitId: String, promise: Promise) {
        Thread {
            val circuit = circuits.get(circuitId)
            if (circuit == null) {
                promise.reject("CIRCUIT_NOT_LOADED", "Circuit not loaded. Please load the circuit before executing")
                return@Thread
            }

            // Convert to non-nullable map
            val inputMap = inputs.toHashMap().mapValues { it.value ?: "" }
            var witness: Array<String>? = circuit.execute(inputMap)  
            var witnessArray: WritableArray = Arguments.createArray()
            witness?.forEach { witnessArray.pushString(it) }

            var result: WritableMap = Arguments.createMap()
            result.putArray("witness", witnessArray)
            promise.resolve(result)
        }.start()
    }

    @ReactMethod fun clearCircuit(circuitId: String, promise: Promise) {
        circuits.remove(circuitId)
        var result: WritableMap = Arguments.createMap()
        result.putBoolean("success", true)
        promise.resolve(result)
    }

    @ReactMethod fun clearAllCircuits(promise: Promise) {
        circuits.clear()
        var result: WritableMap = Arguments.createMap()
        result.putBoolean("success", true)
        promise.resolve(result)
    }
}