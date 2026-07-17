package expo.modules.appattestmodule

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import com.google.android.gms.tasks.Task
import com.google.android.play.core.integrity.IntegrityManager
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.IntegrityTokenResponse
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.ConnectionResult
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import android.content.Context
import android.util.Base64
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonArray
import com.google.gson.JsonPrimitive
import java.security.MessageDigest
import java.util.UUID
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.KeyInfo
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.KeyFactory
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import android.os.Build
import java.security.spec.ECGenParameterSpec
import java.security.Security
import java.net.URL
import java.net.HttpURLConnection
import kotlinx.coroutines.delay
import java.math.BigInteger
import java.security.KeyPair

class AppAttestException(message: String, code: String = "APPATTEST_ERROR") : CodedException(code, message, null)

// P-256 curve parameters
data class CurveParams(
  val n: BigInteger, // Order of the curve
  val p: BigInteger  // Prime modulus
)

// secp256r1 (P-256) parameters
val SECP256R1_PARAMS = CurveParams(
  n = BigInteger("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16),
  p = BigInteger("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16)
)

class AppAttestModule : Module() {
  private val TAG = "AppAttestModule"
  private var integrityManager: IntegrityManager? = null
  private val keyAliasPrefix = "zkpassport_attestation_"
  private val androidKeyStore = "AndroidKeyStore"

  private data class KeyAttestationData(
    val keyAlias: String,
    val attestationCertificates: List<String>, // Base64 encoded certificates
    val publicKey: String // Base64 encoded public key
  )

  private data class AttestationData(
    val keyId: String,
    val playIntegrityToken: String,
    val keyAttestation: KeyAttestationData?,
    val signature: String?, // Signature of client data
    val clientData: String,
    val appId: String,
    val environment: String
  )

  /**
   * Retry helper function with exponential backoff
   * @param maxAttempts Maximum number of retry attempts (default: 3)
   * @param initialDelayMs Initial delay in milliseconds before first retry (default: 1000ms)
   * @param maxDelayMs Maximum delay between retries (default: 10000ms)
   * @param factor Multiplier for exponential backoff (default: 2.0)
   * @param operation The suspend function to retry
   */
  private suspend fun <T> withRetry(
    maxAttempts: Int = 3,
    initialDelayMs: Long = 1000L,
    maxDelayMs: Long = 10000L,
    factor: Double = 2.0,
    operationName: String = "operation",
    operation: suspend () -> T
  ): T {
    var currentDelay = initialDelayMs
    var lastException: Exception? = null

    repeat(maxAttempts) { attempt ->
      try {
        return operation()
      } catch (e: Exception) {
        lastException = e
        if (attempt < maxAttempts - 1) {
          Log.w(TAG, "Attempt ${attempt + 1}/$maxAttempts failed for $operationName: ${e.message}. Retrying in ${currentDelay}ms...")
          delay(currentDelay)
          currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
        }
      }
    }

    Log.e(TAG, "All $maxAttempts attempts failed for $operationName")
    throw lastException ?: AppAttestException("$operationName failed after $maxAttempts attempts")
  }

  private fun platformEcdsaSignature(): Signature {
    val provider =
        Security.getProvider("AndroidKeyStoreBCWorkaround")
            ?: Security.getProvider("AndroidOpenSSL")
            ?: Security.getProvider("Conscrypt")
      return if (provider != null)
          Signature.getInstance("SHA256withECDSA", provider)
      else
          Signature.getInstance("SHA256withECDSA") // fallback
  }

  private fun generateAttestation(keyId: String, clientDataHashB64: String, promise: Promise) {
    GlobalScope.launch(Dispatchers.Main) {
      try {
        val keyAlias = keyAliasPrefix + keyId
        val clientDataHash = Base64.decode(clientDataHashB64, Base64.DEFAULT)

        // Left-pad clientDataHash with zeros to 32 bytes
        val paddedClientDataHash = leftPadToSize(clientDataHash, 32)

        // Get the key from keystore
        val keyStore: KeyStore = KeyStore.getInstance(androidKeyStore).apply {
            load(null)
        }

        if (!keyStore.containsAlias(keyAlias)) {
          throw AppAttestException("Key not found")
        }

        // Get key attestation certificates
        val certificateChain = keyStore.getCertificateChain(keyAlias)
        val keyAttestationData = if (certificateChain != null && certificateChain.isNotEmpty()) {
          val publicKey = certificateChain[0].publicKey
          KeyAttestationData(
            keyAlias = keyAlias,
            attestationCertificates = certificateChain.map { cert ->
              Base64.encodeToString(cert.encoded, Base64.NO_WRAP)
            },
            publicKey = Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)
          )
        } else null

        // Sign the client data hash with the hardware key
        val entry: KeyStore.Entry = keyStore.getEntry(keyAlias, null)
        if (entry !is KeyStore.PrivateKeyEntry) {
            Log.w(TAG, "Not an instance of a PrivateKeyEntry")
            throw AppAttestException("Not an instance of a PrivateKeyEntry")
        }
        val signatureBytes: ByteArray = platformEcdsaSignature().run {
            initSign(entry.privateKey)
            update(paddedClientDataHash)
            sign()
        }
        val signatureB64 = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)

        val nonce = getNonceData(paddedClientDataHash, signatureBytes)
        Log.d(TAG, "Nonce = " + nonce)

        // Request Play Integrity token with retry logic
        val encryptedToken = withRetry(
          maxAttempts = 3,
          initialDelayMs = 1000L,
          operationName = "requestIntegrityToken"
        ) {
          requestIntegrityToken(nonce)
        }
        Log.d(TAG, "Encrypted token = " + encryptedToken)

        // Decrypt the token via server with retry logic
        val decryptedTokenAndSignature = withRetry(
          maxAttempts = 3,
          initialDelayMs = 1000L,
          operationName = "decryptIntegrityToken"
        ) {
          decryptIntegrityToken(encryptedToken, certificateChain)
        }
        val decryptedTokenB64 = Base64.encodeToString(decryptedTokenAndSignature.toString().toByteArray(), Base64.NO_WRAP)
        Log.d(TAG, "Decrypted token = " + decryptedTokenAndSignature)

        // Parse the JWT token to extract information
        val (appId, environment) = getAppIdAndEnvironment(decryptedTokenAndSignature.get("decryptedToken").asJsonObject)

        // Create comprehensive attestation response
        val attestationResponse = createAttestationResponse(
          keyId = keyId,
          playIntegrityToken = decryptedTokenB64,
          keyAttestationData = keyAttestationData,
          signature = signatureB64,
          clientDataHashB64 = clientDataHashB64,
          appId = appId,
          environment = environment
        )

        promise.resolve(attestationResponse)
      } catch (e: Exception) {
        Log.e(TAG, "attestKey failed", e)
        promise.reject(AppAttestException("Failed to attest key: ${e.message}"))
      }
    }
  }

  private fun generateKeyWithParameters(keyAlias: String, keyId: String, useStrongBox: Boolean): KeyPair {
    val keyPairGenerator = KeyPairGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_EC,
      androidKeyStore
    )

    val parameterSpec = KeyGenParameterSpec.Builder(
      keyAlias,
      KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
    ).run {
      setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)

      // Request key attestation
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        setAttestationChallenge(keyId.toByteArray())
      }

      // Only set StrongBox if requested
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && useStrongBox) {
        setIsStrongBoxBacked(true)
      }

      // Set key validity
      setUserAuthenticationRequired(false)
      setInvalidatedByBiometricEnrollment(false)
      build()
    }

    keyPairGenerator.initialize(parameterSpec)
    return keyPairGenerator.generateKeyPair()
  }

  override fun definition() = ModuleDefinition {
    Name("AppAttestModule")

    OnCreate {
      try {
        val context = appContext.reactContext ?: throw AppAttestException("React context is null")
        integrityManager = IntegrityManagerFactory.create(context)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to initialize IntegrityManager", e)
      }
    }

    AsyncFunction("isSupported") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw AppAttestException("React context is null")
        val gmsAvailable = GoogleApiAvailability.getInstance()
          .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

        // Check if hardware key attestation is supported (Android 7.0+)
        val hardwareBackedKeysSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N

        promise.resolve(gmsAvailable && android.os.Build.VERSION.SDK_INT >= 21 && hardwareBackedKeysSupported)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("generateKey") { promise: Promise ->
      try {
        val keyId = UUID.randomUUID().toString()
        val keyAlias = keyAliasPrefix + keyId

        // Try to generate key with StrongBox first if available
        var keyGenerated = false
        var lastException: Exception? = null
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && isStrongBoxAvailable()) {
          try {
            generateKeyWithParameters(keyAlias, keyId, true)
            keyGenerated = true
            Log.d(TAG, "Generated StrongBox-backed key with alias: $keyAlias")
          } catch (e: Exception) {
            Log.w(TAG, "Failed to generate StrongBox key, falling back to TEE: ${e.javaClass.simpleName} - ${e.message}", e)
            lastException = e
          }
        }
        
        // Fallback to TEE (Trusted Execution Environment) without StrongBox
        if (!keyGenerated) {
          try {
            generateKeyWithParameters(keyAlias, keyId, false)
            keyGenerated = true
            Log.d(TAG, "Generated TEE-backed key (no StrongBox) with alias: $keyAlias")
          } catch (e: Exception) {
            Log.e(TAG, "Failed to generate TEE key: ${e.javaClass.simpleName} - ${e.message}", e)
            lastException = e
          }
        }
        
        if (keyGenerated) {
          promise.resolve(keyId)
        } else {
          val errorDetails = buildString {
            append("Failed to generate key")
            lastException?.let {
              append(": ${it.javaClass.simpleName}")
              if (it.message != null) {
                append(" - ${it.message}")
              }
              // Add device info for debugging
              append(" [Device: ${Build.MANUFACTURER} ${Build.MODEL}, ")
              append("Android ${Build.VERSION.RELEASE}, ")
              append("SDK ${Build.VERSION.SDK_INT}]")
            }
          }
          Log.e(TAG, errorDetails, lastException)
          promise.reject(AppAttestException(errorDetails))
        }
      } catch (e: Exception) {
        val errorMsg = "Unexpected error in generateKey: ${e.javaClass.simpleName} - ${e.message}"
        Log.e(TAG, errorMsg, e)
        promise.reject(AppAttestException(errorMsg))
      }
    }

    AsyncFunction("attestKey") { keyId: String, clientDataHashB64: String, promise: Promise ->
      generateAttestation(keyId, clientDataHashB64, promise)
    }

    // Unlike on iOS, this is essentially the same as attestKey since the secure enclave is signing every time
    AsyncFunction("generateAssertion") { keyId: String, clientDataHashB64: String, promise: Promise ->
      generateAttestation(keyId, clientDataHashB64, promise)
    }
  }

  // Helper function to convert byte list to BigInteger
  private fun fromBytesToBigInt(bytes: List<Int>): BigInteger {
    val byteArray = bytes.map { it.toByte() }.toByteArray()
    return BigInteger(1, byteArray) // 1 for positive number
  }

  // Helper function to convert BigInteger to byte list
  private fun bigIntToBytes(bigInt: BigInteger): List<Int> {
    val byteArray = bigInt.toByteArray()
    // Remove leading zero byte if present (added by toByteArray for positive numbers)
    val cleanedArray = if (byteArray.size > 1 && byteArray[0] == 0.toByte()) {
      byteArray.drop(1)
    } else {
      byteArray.toList()
    }
    return cleanedArray.map { it.toInt() and 0xFF }
  }

  // Helper function to left-pad array with zeros
  private fun leftPadArrayWithZeros(array: List<Int>, targetSize: Int): List<Int> {
    if (array.size >= targetSize) return array
    return List(targetSize - array.size) { 0 } + array
  }

  // Helper function to left-pad ByteArray with zeros
  private fun leftPadToSize(byteArray: ByteArray, targetSize: Int): ByteArray {
    if (byteArray.size >= targetSize) return byteArray
    val paddedArray = ByteArray(targetSize)
    System.arraycopy(byteArray, 0, paddedArray, targetSize - byteArray.size, byteArray.size)
    return paddedArray
  }

  // Ensure s value is in canonical form (low-s)
  private fun ensureLowSValue(s: List<Int>, curveParams: CurveParams): List<Int> {
    val sBigInt = fromBytesToBigInt(s)
    val halfN = curveParams.n.shiftRight(1) // Divide by 2
    return if (sBigInt > halfN) {
      val lowS = curveParams.n - sBigInt
      bigIntToBytes(lowS)
    } else {
      s
    }
  }

  // Extract the raw signature bytes from the DER encoded signature
  private fun processSignatureBytes(signatureBytes: List<Int>): ByteArray {
    val byteSize = 32 // For P-256, r and s are 32 bytes each
    val curveParams = SECP256R1_PARAMS

    // Check if signature is already in raw format (r || s)
    if (signatureBytes.size == byteSize * 2) {
      val r = signatureBytes.subList(0, byteSize)
      val s = ensureLowSValue(signatureBytes.subList(byteSize, signatureBytes.size), curveParams)
      val result = leftPadArrayWithZeros(r, byteSize) + leftPadArrayWithZeros(s, byteSize)
      return result.map { it.toByte() }.toByteArray()
    }

    // Check if it's a valid ASN.1 sequence
    if (signatureBytes[0] != 0x30) {
      Log.w(TAG, "Not a valid ASN.1 sequence")
      return signatureBytes.map { it.toByte() }.toByteArray()
    }

    // Determine inner length index (handle both short and long form)
    val innerLengthIndex = if (signatureBytes[1] == signatureBytes.size - 2) 1 else 2
    val innerLength = signatureBytes[innerLengthIndex]

    // Validate ASN.1 structure
    if (signatureBytes[innerLengthIndex + 1] != 0x02 ||
        innerLength != signatureBytes.size - innerLengthIndex - 1) {
      Log.w(TAG, "Invalid ASN.1 structure")
      return signatureBytes.map { it.toByte() }.toByteArray()
    }

    // Extract r value
    val rLength = signatureBytes[innerLengthIndex + 2]
    var r = signatureBytes.subList(
      innerLengthIndex + 3,
      innerLengthIndex + 3 + rLength
    )

    // Validate s value tag
    if (signatureBytes[innerLengthIndex + 3 + rLength] != 0x02) {
      Log.w(TAG, "Invalid s value tag")
      return signatureBytes.map { it.toByte() }.toByteArray()
    }

    // Extract s value
    val sLength = signatureBytes[innerLengthIndex + 3 + rLength + 1]
    var s = signatureBytes.subList(
      innerLengthIndex + 3 + rLength + 2,
      innerLengthIndex + 3 + rLength + 2 + sLength
    )

    // Remove leading zeros from r
    var firstNonZeroR = 0
    for (i in r.indices) {
      if (r[i] != 0x00) {
        firstNonZeroR = i
        break
      }
    }
    r = r.subList(firstNonZeroR, r.size)

    // Remove leading zeros from s
    var firstNonZeroS = 0
    for (i in s.indices) {
      if (s[i] != 0x00) {
        firstNonZeroS = i
        break
      }
    }
    s = s.subList(firstNonZeroS, s.size)

    // Ensure s is in canonical form (low-s value)
    s = ensureLowSValue(s, curveParams)

    // Pad r and s to expected byte size
    r = leftPadArrayWithZeros(r, byteSize)
    s = leftPadArrayWithZeros(s, byteSize)

    val result = r + s
    return result.map { it.toByte() }.toByteArray()
  }

  private fun getNonceData(clientDataHash: ByteArray, signatureBytes: ByteArray): String {
    // Concatenate clientDataHash and signature
    val positiveClientDataHash = clientDataHash.map { it.toInt() and 0xFF }
    val positiveSignatureBytes = signatureBytes.map { it.toInt() and 0xFF }
    val processedSignatureBytes = processSignatureBytes(positiveSignatureBytes)

    val nonceData = positiveClientDataHash.map { it.toByte() }.toByteArray() + processedSignatureBytes
    val nonceDataHash = MessageDigest.getInstance("SHA-256").digest(nonceData)
    return Base64.encodeToString(nonceDataHash, Base64.URL_SAFE or Base64.NO_PADDING)
  }

  private fun isStrongBoxAvailable(): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        /* // Check for known problematic devices
        if (isDeviceBlacklistedForStrongBox()) {
          Log.w(TAG, "Device is blacklisted for StrongBox: ${Build.MANUFACTURER} ${Build.MODEL}")
          return false
        }*/
        
        val context = appContext.reactContext ?: return false
        context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_STRONGBOX_KEYSTORE)
      } else {
        false
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to check StrongBox availability", e)
      false
    }
  }
  
  private fun isDeviceBlacklistedForStrongBox(): Boolean {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val model = Build.MODEL.lowercase()
    
    // Known problematic Samsung devices
    val blacklistedDevices = listOf(
      // Samsung Galaxy S21 series
      "sm-g991" to "samsung",  // S21 5G
      "sm-g996" to "samsung",  // S21+ 5G
      "sm-g998" to "samsung",  // S21 Ultra 5G
      // Samsung Galaxy S24 series
      "sm-s921" to "samsung",  // S24
      "sm-s926" to "samsung",  // S24+
      "sm-s928" to "samsung",  // S24 Ultra
      // Samsung Galaxy S22 series (also known to have issues)
      "sm-s901" to "samsung",  // S22
      "sm-s906" to "samsung",  // S22+
      "sm-s908" to "samsung"   // S22 Ultra
    )
    
    return blacklistedDevices.any { (deviceModel, deviceManufacturer) ->
      model.contains(deviceModel) && manufacturer.contains(deviceManufacturer)
    }
  }

  private suspend fun requestIntegrityToken(nonce: String): String {
    return withContext(Dispatchers.IO) {
      suspendCancellableCoroutine { continuation ->
        val integrityTokenRequest = IntegrityTokenRequest.builder()
          .setNonce(nonce)
          .build()

        integrityManager?.requestIntegrityToken(integrityTokenRequest)
          ?.addOnSuccessListener { response ->
            continuation.resume(response.token())
          }
          ?.addOnFailureListener { e ->
            continuation.resumeWithException(AppAttestException("Failed to get integrity token: ${e.message}"))
          }
          ?: continuation.resumeWithException(AppAttestException("IntegrityManager not initialized"))
      }
    }
  }

  private suspend fun decryptIntegrityToken(token: String, certificateChain: Array<Certificate>?): JsonObject {
    return withContext(Dispatchers.IO) {
      try {
        val apiURL = " https://api.zkpassport.id/api/app-attest/android/decrypt-token"

        // Create JSON request object
        val jsonRequest = JsonObject().apply {
          addProperty("token", token)
          if (certificateChain != null && certificateChain.isNotEmpty()) {
            add("certificateChain", JsonArray().apply {
              certificateChain.forEach { cert ->
                add(Base64.encodeToString(cert.encoded, Base64.NO_WRAP))
              }
            })
          }
        }

        // Create URL connection
        val url = java.net.URL(apiURL)
        val connection = url.openConnection() as java.net.HttpURLConnection

        connection.apply {
          requestMethod = "POST"
          doOutput = true
          doInput = true
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Accept", "application/json")
          connectTimeout = 30000 // 30 seconds
          readTimeout = 30000 // 30 seconds
        }

        // Send the request
        connection.outputStream.use { outputStream ->
          outputStream.write(jsonRequest.toString().toByteArray())
          outputStream.flush()
        }

        // Read the response
        val responseCode = connection.responseCode
        if (responseCode == java.net.HttpURLConnection.HTTP_OK) {
          val response = connection.inputStream.bufferedReader().use { it.readText() }

          // Parse the response JSON
          val responseJson = JsonParser.parseString(response).asJsonObject

          Log.d(TAG, "Response JSON = " + responseJson)

          // Extract the decrypted token - adjust field name based on your server's response
          val decryptedToken = responseJson.get("decryptedToken")?.asJsonObject
          val decryptedTokenBase64 = responseJson.get("decryptedTokenBase64")?.asString
          val signature = responseJson.get("signature")?.asJsonArray
          val result = JsonObject().apply {
            add("decryptedToken", decryptedToken)
            addProperty("decryptedTokenBase64", decryptedTokenBase64)
            add("signature", signature)
          }
          result
        } else {
          val errorResponse = connection.errorStream?.bufferedReader()?.use { it.readText() }
          throw AppAttestException("Server returned error $responseCode: $errorResponse")
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to decrypt integrity token", e)
        throw AppAttestException("Failed to decrypt integrity token: ${e.message}")
      }
    }
  }

  private fun getAppIdAndEnvironment(json: JsonObject): Pair<String, String> {
    try {
      val appId = json.getAsJsonObject("appIntegrity")?.get("packageName")?.asString
        ?: throw AppAttestException("Package name not found in token")

      val appRecognitionVerdict = json.getAsJsonObject("appIntegrity")?.get("appRecognitionVerdict")?.asString
      val deviceRecognitionVerdict = json.getAsJsonObject("deviceIntegrity")?.getAsJsonArray("deviceRecognitionVerdict")

      // Determine environment based on both app and device integrity
      val environment = when {
        appRecognitionVerdict == "PLAY_RECOGNIZED" &&
        deviceRecognitionVerdict?.contains(JsonPrimitive("MEETS_DEVICE_INTEGRITY")) == true -> "production"
        else -> "development"
      }

      return Pair(appId, environment)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to parse integrity token", e)
      throw AppAttestException("Failed to parse token: ${e.message}")
    }
  }

  private fun createAttestationResponse(
    keyId: String,
    playIntegrityToken: String,
    keyAttestationData: KeyAttestationData?,
    signature: String?,
    clientDataHashB64: String,
    appId: String,
    environment: String
  ): String {
    val response = JsonObject().apply {
      addProperty("format", "android-play-integrity-keystore")
      addProperty("integrityToken", playIntegrityToken)
      addProperty("keyId", keyId)
      addProperty("clientDataHash", clientDataHashB64)
      addProperty("appId", appId)
      addProperty("environment", environment)

      if (signature != null) {
        addProperty("signature", signature)
      }

      if (keyAttestationData != null) {
        add("keyAttestation", JsonObject().apply {
          addProperty("publicKey", keyAttestationData.publicKey)
          add("certificates", JsonArray().apply {
            keyAttestationData.attestationCertificates.forEach { add(it) }
          })
        })
      }
    }

    return Base64.encodeToString(response.toString().toByteArray(), Base64.NO_WRAP)
  }
}
