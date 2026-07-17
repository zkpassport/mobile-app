/*
 * Copyright 2016 Anton Tananaev (anton.tananaev@gmail.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.passportreader

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.util.Log
import org.jnbis.api.Jnbis
import java.io.*
import jj2000.j2k.decoder.Decoder
import jj2000.j2k.util.ParameterList
import java.nio.ByteBuffer
import java.nio.ByteOrder
import com.gemalto.jp2.JP2Decoder

object ImageUtil {
    private const val TAG = "ImageUtil"

    /**
     * Finds the last JPEG2000 EOC marker (0xFF 0xD9) in the data.
     * Searches backwards from the end for better performance.
     */
    private fun findLastEOCMarker(data: ByteArray): Int? {
        for (i in data.size - 2 downTo 0) {
            if (data[i] == 0xFF.toByte() && data[i + 1] == 0xD9.toByte()) {
                return i
            }
        }
        return null
    }
    
    /**
     * Finds the JP2C box which contains the JPEG2000 codestream.
     * Looks for the "jp2c" signature (0x6A 0x70 0x32 0x63).
     */
    private fun findJP2CBox(data: ByteArray): Int? {
        for (i in 0 until data.size - 4) {
            if (data[i] == 0x6A.toByte() && 
                data[i + 1] == 0x70.toByte() && 
                data[i + 2] == 0x32.toByte() && 
                data[i + 3] == 0x63.toByte()) {
                // Found "jp2c", the box starts 4 bytes before this (at the length field)
                return if (i >= 4) i - 4 else null
            }
        }
        return null
    }
    
    /**
     * Parses JP2 box structure to find the actual end of valid data.
     * Each box has 4-byte length (big-endian) + 4-byte type + data.
     */
    private fun parseJP2Boxes(data: ByteArray): ByteArray {
        var offset = 0
        var lastValidOffset = 0
        
        while (offset < data.size) {
            // Need at least 8 bytes for box header
            if (offset + 8 > data.size) break
            
            // Read box length (big-endian 32-bit integer)
            val buffer = ByteBuffer.wrap(data, offset, 4)
            buffer.order(ByteOrder.BIG_ENDIAN)
            var boxLength = buffer.int
            
            // Read box type (4 characters)
            val boxType = String(data.copyOfRange(offset + 4, offset + 8))
            
            Log.d(TAG, "JP2 box: type=$boxType, length=$boxLength, offset=$offset")
            
            // Handle special box length values
            when {
                boxLength == 0 -> {
                    // Length 0 means this box extends to the end of the file
                    boxLength = data.size - offset
                    Log.d(TAG, "JP2 box length 0 means extends to EOF, actual length=$boxLength")
                }
                boxLength == 1 -> {
                    // Length 1 means there's an extended 64-bit length field
                    if (offset + 16 > data.size) {
                        Log.d(TAG, "JP2 not enough data for extended length")
                        break
                    }
                    // Read lower 32 bits of 64-bit length
                    val extBuffer = ByteBuffer.wrap(data, offset + 12, 4)
                    extBuffer.order(ByteOrder.BIG_ENDIAN)
                    boxLength = extBuffer.int
                    Log.d(TAG, "JP2 extended box length=$boxLength")
                }
                boxLength < 8 -> {
                    // Invalid box length, stop here
                    Log.d(TAG, "JP2 invalid box length, stopping at offset $lastValidOffset")
                    break
                }
            }
            
            // Check if the box extends beyond our data
            if (offset + boxLength > data.size) {
                Log.d(TAG, "JP2 box extends beyond data, stopping at offset $lastValidOffset")
                break
            }
            
            lastValidOffset = offset + boxLength
            offset += boxLength
        }
        
        return if (lastValidOffset > 0 && lastValidOffset <= data.size) {
            Log.d(TAG, "JP2 trimming from ${data.size} to $lastValidOffset bytes")
            data.copyOfRange(0, lastValidOffset)
        } else {
            data
        }
    }

    /**
     * Creates a properly bounded input stream from image data, handling various edge cases.
     * This enhanced version includes format-specific handling similar to iOS implementation.
     * 
     * @param data The original image data
     * @param imageLength The reported length of the image
     * @return A ByteArrayInputStream with properly bounded data
     */
    fun trimTrailingZerosAndCreateStream(data: ByteArray, imageLength: Int): ByteArrayInputStream {
        var actualLength = imageLength
        
        // Ensure we don't go beyond the array bounds
        if (actualLength > data.size) {
            actualLength = data.size
        }
        
        // Create a working copy of the data with the specified length
        val workingData = data.copyOfRange(0, actualLength)
        
        // Detect image format based on header
        val isJPEG = workingData.size >= 10 && 
                     workingData[0] == 0xFF.toByte() && 
                     workingData[1] == 0xD8.toByte()
        
        val isJP2 = workingData.size >= 10 &&
                    workingData[0] == 0x00.toByte() &&
                    workingData[1] == 0x00.toByte() &&
                    workingData[2] == 0x00.toByte() &&
                    workingData[3] == 0x0C.toByte() &&
                    workingData[4] == 0x6A.toByte() &&
                    workingData[5] == 0x50.toByte()
        
        val isJ2K = workingData.size >= 4 &&
                    workingData[0] == 0xFF.toByte() &&
                    workingData[1] == 0x4F.toByte()
        
        Log.d(TAG, "Image format detection: JPEG=$isJPEG, JP2=$isJP2, J2K=$isJ2K")
        Log.d(TAG, "Image data length: $actualLength")
        
        when {
            isJPEG -> {
                // For JPEG, trim trailing zeros
                while (actualLength > 2 && workingData[actualLength - 1] == 0.toByte()) {
                    actualLength--
                }
                Log.d(TAG, "JPEG: Trimmed trailing zeros, new length: $actualLength")
            }
            isJP2 -> {
                // For JP2, parse box structure and trim appropriately
                val parsedData = parseJP2Boxes(workingData)
                
                // Look for EOC marker and trim if found
                findLastEOCMarker(parsedData)?.let { eocIndex ->
                    val trimmedLength = eocIndex + 2
                    if (trimmedLength < parsedData.size) {
                        Log.d(TAG, "JP2: EOC marker found at $eocIndex, trimming to $trimmedLength")
                        return ByteArrayInputStream(parsedData, 0, trimmedLength)
                    }
                }
                
                return ByteArrayInputStream(parsedData)
            }
            isJ2K -> {
                // For J2K codestream, trim trailing zeros
                while (actualLength > 2 && workingData[actualLength - 1] == 0.toByte()) {
                    actualLength--
                }
                Log.d(TAG, "J2K: Trimmed trailing zeros, new length: $actualLength")
            }
            else -> {
                // For other formats, just trim trailing zeros
                while (actualLength > 2 && workingData[actualLength - 1] == 0.toByte()) {
                    actualLength--
                }
                Log.d(TAG, "Unknown format: Trimmed trailing zeros, new length: $actualLength")
            }
        }
        
        return ByteArrayInputStream(workingData, 0, actualLength)
    }

    @Throws(IOException::class)
    private fun decodePGM(pgmFile: File): Bitmap {
        val reader = BufferedInputStream(FileInputStream(pgmFile))
        
        // Read magic number (P5 for PGM)
        if (reader.read().toChar() != 'P' || reader.read().toChar() != '5') {
            throw IOException("Invalid PGM file format")
        }
        
        reader.read() // Skip whitespace
        
        // Read width
        val widths = StringBuilder()
        var temp: Char
        while (reader.read().toChar().also { temp = it } != ' ' && temp != '\n') {
            widths.append(temp)
        }
        
        // Read height
        val heights = StringBuilder()
        while (reader.read().toChar().also { temp = it } in '0'..'9') {
            heights.append(temp)
        }
        
        // Read max value (usually 255)
        val maxVal = StringBuilder()
        while (reader.read().toChar().also { temp = it } in '0'..'9') {
            maxVal.append(temp)
        }
        reader.read() // Skip whitespace after max value
        
        val width = widths.toString().toInt()
        val height = heights.toString().toInt()
        val colors = IntArray(width * height)
        
        // Read grayscale data
        var index = 0
        var byte: Int
        while (reader.read().also { byte = it } != -1 && index < colors.size) {
            val gray = if (byte >= 0) byte else byte + 256
            colors[index++] = Color.rgb(gray, gray, gray)
        }
        
        reader.close()
        return Bitmap.createBitmap(colors, width, height, Bitmap.Config.ARGB_8888)
    }
    
    @Throws(IOException::class)
    private fun decodePPM(ppmFile: File): Bitmap? {
        val reader = BufferedInputStream(FileInputStream(ppmFile))
        
        // Read magic number (P6 for PPM)
        if (reader.read().toChar() != 'P' || reader.read().toChar() != '6') {
            reader.close()
            return null
        }

        reader.read() // Skip whitespace
        val widths = StringBuilder()
        val heights = StringBuilder()
        var temp: Char
        while (reader.read().toChar().also { temp = it } != ' ') widths.append(temp)
        while (reader.read().toChar().also { temp = it } in '0'..'9') heights.append(temp)
        
        // Read max value (should be 255)
        if (reader.read().toChar() != '2' || reader.read().toChar() != '5' || reader.read().toChar() != '5') {
            reader.close()
            return null
        }
        reader.read() // Skip whitespace after max value

        val width = widths.toString().toInt()
        val height = heights.toString().toInt()
        val colors = IntArray(width * height)

        val pixel = ByteArray(3)
        var cnt = 0
        var total = 0
        val rgb = IntArray(3)
        while (reader.read(pixel).also { len -> 
            for (i in 0 until len) {
                rgb[cnt] = if (pixel[i] >= 0) pixel[i].toInt() else pixel[i] + 255
                if (++cnt == 3) {
                    cnt = 0
                    colors[total++] = Color.rgb(rgb[0], rgb[1], rgb[2])
                }
            }
        } > 0) {}
        
        reader.close()
        return Bitmap.createBitmap(colors, width, height, Bitmap.Config.ARGB_8888)
    }

    @Throws(IOException::class)
    fun decodeImage(context: Context, mimeType: String, inputStream: InputStream): Bitmap? {
        // Read all data from input stream once
        val fullData = inputStream.readBytes()
        Log.d(TAG, "Decoding image with mimeType hint: $mimeType, size: ${fullData.size} bytes")
        
        // Helper function to try JP2/JPEG2000 decoding
        fun tryJP2Decoding(): Bitmap? {
            try {
                Log.d(TAG, "Attempting JP2/JPEG2000 decoding...")
                Log.d(TAG, "JP2 decoding: Full data size: ${fullData.size} bytes")
                Log.d(TAG, "JP2 decoding: First 20 bytes: ${fullData.take(20)}")
                Log.d(TAG, "JP2 decoding: Last 20 bytes: ${fullData.takeLast(20)}")
                
                // Parse JP2 box structure to find valid data boundaries
                val parsedData = parseJP2Boxes(fullData)
                
                // STRATEGY 1: Try JP2Decoder (OpenJPEG-based) first
                // This is the most reliable decoder and handles 4-component RGBA images correctly
                Log.d(TAG, "Trying JP2Decoder (OpenJPEG)...")
                try {
                    val jp2Bitmap = JP2Decoder(parsedData).decode()
                    if (jp2Bitmap != null) {
                        Log.d(TAG, "✓ Successfully decoded JP2 with JP2Decoder (OpenJPEG)")
                        return jp2Bitmap
                    }
                } catch (jp2Ex: Exception) {
                    Log.w(TAG, "JP2Decoder failed: ${jp2Ex.message}")
                }
                
                // STRATEGY 2: Try with codestream extraction for OpenJPEG
                Log.d(TAG, "Trying JP2Decoder with codestream extraction...")
                findJP2CBox(parsedData)?.let { jp2cOffset ->
                    val codestreamStart = jp2cOffset + 8 // Skip 8-byte box header
                    if (codestreamStart < parsedData.size) {
                        val codestreamData = parsedData.copyOfRange(codestreamStart, parsedData.size)
                        try {
                            val j2kBitmap = JP2Decoder(codestreamData).decode()
                            if (j2kBitmap != null) {
                                Log.d(TAG, "✓ Successfully decoded J2K codestream with JP2Decoder")
                                return j2kBitmap
                            }
                        } catch (j2kEx: Exception) {
                            Log.w(TAG, "JP2Decoder codestream failed: ${j2kEx.message}")
                        }
                    }
                }
                
                // STRATEGY 3: Try Android's built-in decoder (for standard formats)
                Log.d(TAG, "Trying Android's built-in decoder...")
                
                // Look for EOC marker and trim if found
                findLastEOCMarker(parsedData)?.let { eocIndex ->
                    val trimmedLength = eocIndex + 2
                    if (trimmedLength < parsedData.size) {
                        Log.d(TAG, "JP2 EOC marker found at $eocIndex, trimming from ${parsedData.size} to $trimmedLength")
                        val trimmedData = parsedData.copyOfRange(0, trimmedLength)
                        
                        // Try Android's built-in decoder with trimmed data
                        val trimmedBitmap = BitmapFactory.decodeByteArray(trimmedData, 0, trimmedData.size)
                        if (trimmedBitmap != null) {
                            Log.d(TAG, "✓ Successfully decoded JP2 with trimmed data")
                            return trimmedBitmap
                        }
                    }
                }
                
                // Try Android's built-in decoder with full parsed data
                val androidBitmap = BitmapFactory.decodeByteArray(parsedData, 0, parsedData.size)
                if (androidBitmap != null) {
                    Log.d(TAG, "✓ Successfully decoded JP2 with Android's built-in decoder")
                    return androidBitmap
                }
                
                // STRATEGY 4: Try extracting just the JPEG2000 codestream from jp2c box for Android
                Log.d(TAG, "Android decoder failed, trying codestream extraction fallback")
                findJP2CBox(parsedData)?.let { jp2cOffset ->
                    val codestreamStart = jp2cOffset + 8 // Skip 8-byte box header
                    if (codestreamStart < parsedData.size) {
                        val codestreamData = parsedData.copyOfRange(codestreamStart, parsedData.size)
                        Log.d(TAG, "Extracted codestream from offset $codestreamStart, size: ${codestreamData.size} bytes")
                        
                        // First 10 bytes of codestream for validation
                        if (codestreamData.size >= 10) {
                            Log.d(TAG, "Codestream first 10 bytes: ${codestreamData.take(10)}")
                            
                            // Verify SOC marker (0xFF 0x4F)
                            if (codestreamData[0] != 0xFF.toByte() || codestreamData[1] != 0x4F.toByte()) {
                                Log.w(TAG, "WARNING: Codestream doesn't start with SOC marker (0xFF 0x4F)")
                            }
                        }
                        
                        // Try decoding the codestream
                        val codestreamBitmap = BitmapFactory.decodeByteArray(codestreamData, 0, codestreamData.size)
                        if (codestreamBitmap != null) {
                            Log.d(TAG, "✓ Successfully decoded JPEG2000 codestream!")
                            return codestreamBitmap
                        }
                    }
                }

                // STRATEGY 5: Fall back to JJ2000 (older library, may not support all formats including 4-component RGBA)
                Log.d(TAG, "JP2Decoder and Android methods failed, falling back to JJ2000 (limited support)")
                Log.d(TAG, "JJ2000: Input data size: ${parsedData.size} bytes")
                
                // Save jp2 file for JJ2000
                val jp2File = File(context.cacheDir, "temp.jp2")
                val output = FileOutputStream(jp2File)
                output.write(parsedData)
                output.close()
                Log.d(TAG, "JJ2000: Saved temp file: ${jp2File.absolutePath}, size: ${jp2File.length()} bytes")

                // Decode jp2 file using JJ2000
                val pinfo = Decoder.getAllParameters()
                val defaults = ParameterList()
                for (i in pinfo.indices.reversed()) {
                    pinfo[i][3]?.let { defaults.put(pinfo[i][0], it) }
                }

                // Temp files for output
                val pgmFile = File(context.cacheDir, "temp.pgm")
                val ppmFile = File(context.cacheDir, "temp.ppm")
                val rawFile = File(context.cacheDir, "temp.raw")
                
                // Helper function to try decoding with specific parameters
                fun tryJJ2000Decode(inputFile: File, outputFile: File, extraParams: Map<String, String> = emptyMap()): Boolean {
                    val parameters = ParameterList(defaults)
                    parameters.setProperty("i", inputFile.absolutePath)
                    parameters.setProperty("o", outputFile.absolutePath)
                    parameters.setProperty("debug", "on")
                    extraParams.forEach { (key, value) -> parameters.setProperty(key, value) }
                    
                    return try {
                        val decoder = Decoder(parameters)
                        decoder.run()
                        outputFile.exists() && outputFile.length() > 0L
                    } catch (e: Exception) {
                        Log.w(TAG, "JJ2000: Decode exception: ${e.message}")
                        false
                    }
                }
                
                // Strategy 1: Try PPM with nocolorspace flag to avoid color space transformation issues
                // This is important for 4-component images where the color mapper crashes
                Log.d(TAG, "JJ2000: Attempting PPM decode with nocolorspace...")
                if (tryJJ2000Decode(jp2File, ppmFile, mapOf("nocolorspace" to "on"))) {
                    val bitmap = decodePPM(ppmFile)
                    if (bitmap != null) {
                        Log.d(TAG, "✓ Successfully decoded JP2 as PPM (nocolorspace)")
                        jp2File.delete(); ppmFile.delete(); pgmFile.delete(); rawFile.delete()
                        return bitmap
                    }
                }
                
                // Strategy 2: Try standard PPM decode (for 3-component images)
                Log.d(TAG, "JJ2000: Attempting standard PPM decode...")
                if (tryJJ2000Decode(jp2File, ppmFile)) {
                    val bitmap = decodePPM(ppmFile)
                    if (bitmap != null) {
                        Log.d(TAG, "✓ Successfully decoded JP2 as PPM (standard)")
                        jp2File.delete(); ppmFile.delete(); pgmFile.delete(); rawFile.delete()
                        return bitmap
                    }
                }
                
                // Strategy 3: Try PGM for grayscale
                Log.d(TAG, "JJ2000: Attempting PGM decode with nocolorspace...")
                if (tryJJ2000Decode(jp2File, pgmFile, mapOf("nocolorspace" to "on"))) {
                    val bitmap = decodePGM(pgmFile)
                    Log.d(TAG, "✓ Successfully decoded JP2 as PGM (nocolorspace)")
                    jp2File.delete(); ppmFile.delete(); pgmFile.delete(); rawFile.delete()
                    return bitmap
                }
                
                // Strategy 4: Extract codestream and try decoding with component selection
                // For 4-component RGBA images, we can select only the first 3 components (RGB)
                Log.d(TAG, "JJ2000: Trying codestream extraction with component selection...")
                findJP2CBox(parsedData)?.let { jp2cOffset ->
                    val codestreamStart = jp2cOffset + 8
                    if (codestreamStart < parsedData.size) {
                        val codestreamData = parsedData.copyOfRange(codestreamStart, parsedData.size)
                        Log.d(TAG, "JJ2000: Extracted codestream, size: ${codestreamData.size} bytes")
                        
                        val j2kFile = File(context.cacheDir, "temp.j2k")
                        j2kFile.writeBytes(codestreamData)
                        
                        // Try with nocolorspace on the codestream
                        if (tryJJ2000Decode(j2kFile, ppmFile, mapOf("nocolorspace" to "on"))) {
                            val bitmap = decodePPM(ppmFile)
                            if (bitmap != null) {
                                Log.d(TAG, "✓ Successfully decoded J2K codestream as PPM")
                                jp2File.delete(); j2kFile.delete(); ppmFile.delete(); pgmFile.delete(); rawFile.delete()
                                return bitmap
                            }
                        }
                        
                        // Try with component selection (first 3 components only)
                        Log.d(TAG, "JJ2000: Trying with comp_transf=none...")
                        if (tryJJ2000Decode(j2kFile, ppmFile, mapOf(
                            "nocolorspace" to "on",
                            "comp_transf" to "none"
                        ))) {
                            val bitmap = decodePPM(ppmFile)
                            if (bitmap != null) {
                                Log.d(TAG, "✓ Successfully decoded J2K with comp_transf=none")
                                jp2File.delete(); j2kFile.delete(); ppmFile.delete(); pgmFile.delete(); rawFile.delete()
                                return bitmap
                            }
                        }
                        
                        // Try raw output format for 4-component images
                        Log.d(TAG, "JJ2000: Trying raw output format...")
                        if (tryJJ2000Decode(j2kFile, rawFile, mapOf(
                            "nocolorspace" to "on",
                            "comp_transf" to "none"
                        ))) {
                            // Try to parse raw file - it should contain raw pixel data
                            try {
                                val rawData = rawFile.readBytes()
                                Log.d(TAG, "JJ2000: Raw output size: ${rawData.size} bytes")
                                // Raw format might need special parsing based on component count
                            } catch (e: Exception) {
                                Log.w(TAG, "JJ2000: Raw parsing failed: ${e.message}")
                            }
                        }
                        
                        j2kFile.delete()
                    }
                }
                
                // Clean up
                jp2File.delete()
                ppmFile.delete()
                pgmFile.delete()
                rawFile.delete()
                
                throw IOException("Failed to decode JPEG2000 image - JJ2000 cannot handle this format (possibly 4-component RGBA image)")
            } catch (e: Exception) {
                Log.w(TAG, "JP2/JPEG2000 decoding failed: ${e.message}")
                return null
            }
        }
        
        // Helper function to try WSQ decoding
        fun tryWSQDecoding(): Bitmap? {
            return try {
                Log.d(TAG, "Attempting WSQ decoding...")
                val inputStream = ByteArrayInputStream(fullData)
                val wsqData = Jnbis.wsq().decode(inputStream).asBitmap()
                val byteData: ByteArray = wsqData.pixels
                val intData = IntArray(byteData.size) { j ->
                    0xFF000000.toInt() or ((byteData[j].toInt() and 0xFF) shl 16) or ((byteData[j].toInt() and 0xFF) shl 8) or (byteData[j].toInt() and 0xFF)
                }
                val result = Bitmap.createBitmap(intData, 0, wsqData.width, wsqData.width, wsqData.height, Bitmap.Config.ARGB_8888)
                Log.d(TAG, "✓ Successfully decoded WSQ image")
                result
            } catch (e: Exception) {
                Log.w(TAG, "WSQ decoding failed: ${e.message}")
                null
            }
        }
        
        // Helper function to try standard image decoding (JPEG, PNG, etc.)
        fun tryStandardDecoding(): Bitmap? {
            return try {
                Log.d(TAG, "Attempting standard image decoding...")
                
                // Create a properly bounded stream with format-specific handling
                val processedStream = trimTrailingZerosAndCreateStream(fullData, fullData.size)
                
                // Try to decode with Android's BitmapFactory
                val bitmap = BitmapFactory.decodeStream(processedStream)
                
                if (bitmap == null) {
                    Log.w(TAG, "Standard image decoding failed")
                    
                    // For debugging, log the image header and footer
                    if (fullData.size >= 20) {
                        Log.d(TAG, "Image header (first 20 bytes): ${fullData.take(20)}")
                        Log.d(TAG, "Image footer (last 20 bytes): ${fullData.takeLast(20)}")
                    }
                } else {
                    Log.d(TAG, "✓ Successfully decoded standard image")
                }
                
                bitmap
            } catch (e: Exception) {
                Log.w(TAG, "Standard decoding failed: ${e.message}")
                null
            }
        }
        
        // Define the decoding priority based on mimeType hint
        val decoders = when {
            mimeType.equals("image/jp2", ignoreCase = true) || mimeType.equals("image/jpeg2000", ignoreCase = true) -> {
                listOf(
                    { tryJP2Decoding() },
                    { tryStandardDecoding() },
                    { tryWSQDecoding() }
                )
            }
            mimeType.equals("image/x-wsq", ignoreCase = true) -> {
                listOf(
                    { tryWSQDecoding() },
                    { tryStandardDecoding() },
                    { tryJP2Decoding() }
                )
            }
            else -> {
                // For other types or unknown mimeType, try standard first, then others
                listOf(
                    { tryStandardDecoding() },
                    { tryJP2Decoding() },
                    { tryWSQDecoding() }
                )
            }
        }
        
        // Try each decoder in order until one succeeds
        for (decoder in decoders) {
            val result = decoder()
            if (result != null) {
                return result
            }
        }
        
        Log.e(TAG, "All decoding attempts failed for image with mimeType: $mimeType")
        return null
    }
}
