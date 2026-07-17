package app.zkpassport.zkpassport

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
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
import android.util.Log
import java.math.BigInteger
import kotlinx.coroutines.*
import java.util.concurrent.Executors

class NativeOperationsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "NativeOperationsModule"
    
    // Use a shared thread pool for better resource management
    private val computationScope = CoroutineScope(
        Dispatchers.Default + SupervisorJob()
    )
    
    // Cache for recently computed trees (LRU with max 10 trees)
    private val treeCache = linkedMapOf<String, Triple<MerkleTree, List<String?>, Int>>()
    private val maxCacheSize = 10

    @ReactMethod fun computeMerkleProof(leaves: ReadableArray, index: Int, height: Int, promise: Promise) {
        computationScope.launch {
            try {
                // Convert leaves array to List<String?> efficiently
                val leafList = (0 until leaves.size()).map { leaves.getString(it) }
                
                // Create cache key
                val cacheKey = "$height:${leafList.joinToString(",")}"
                
                val merkleTree = synchronized(treeCache) {
                    // Check if we have a valid cached tree
                    treeCache[cacheKey]?.let { (cachedTree, cachedLeaves, cachedHeight) ->
                        if (cachedLeaves == leafList && cachedHeight == height) {
                            // Move to end (LRU)
                            treeCache.remove(cacheKey)
                            treeCache[cacheKey] = Triple(cachedTree, cachedLeaves, cachedHeight)
                            return@synchronized cachedTree
                        }
                    }
                    
                    // Not in cache, compute new tree
                    val newTree = MerkleTree(height)
                    
                    // Add to cache (remove oldest if necessary)
                    if (treeCache.size >= maxCacheSize) {
                        val oldestKey = treeCache.keys.first()
                        treeCache.remove(oldestKey)
                    }
                    treeCache[cacheKey] = Triple(newTree, leafList, height)
                    newTree
                }
                
                // Filter out null values and compute proof asynchronously without blocking
                val nonNullLeafList = leafList.filterNotNull()
                val proof = merkleTree.computeProof(nonNullLeafList, index)

                // Create result map
                val result = Arguments.createMap()
                result.putString("root", MerkleTree.bigIntegerToHex(proof.root))
                result.putInt("index", proof.leafIndex)

                // Convert siblings to hex strings
                val pathArray = Arguments.createArray()
                proof.siblings.forEach { sibling ->
                    pathArray.pushString(MerkleTree.bigIntegerToHex(sibling))
                }
                result.putArray("path", pathArray)

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("MERKLE_PROOF_ERROR", "Error computing Merkle proof: ${e.message}")
            }
        }
    }
    
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        computationScope.cancel()
        synchronized(treeCache) {
            treeCache.clear()
        }
    }
}