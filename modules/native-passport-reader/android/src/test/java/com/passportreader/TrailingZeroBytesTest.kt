package com.passportreader

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class TrailingZeroBytesTest {

    @Test
    fun testTrimTrailingZeroBytes_WithTrailingZeros() {
        // Arrange
        val originalData = byteArrayOf(
            0xFF.toByte(), 0xD8.toByte(), // JPEG header
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, // Some data
            0xFF.toByte(), 0xD9.toByte(), // JPEG end marker
            0x00, 0x00, 0x00, 0x00 // Trailing zeros to be trimmed
        )
        val imageLength = originalData.size
        
        // Act - simulate the trimming logic from PassportReaderModule
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(10, actualLength) // Should trim 4 trailing zeros
        val trimmedData = originalData.copyOfRange(0, actualLength)
        assertEquals(0xD9.toByte(), trimmedData.last()) // Should end with JPEG end marker
    }

    @Test
    fun testTrimTrailingZeroBytes_NoTrailingZeros() {
        // Arrange
        val originalData = byteArrayOf(
            0xFF.toByte(), 0xD8.toByte(), // JPEG header
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, // Some data
            0xFF.toByte(), 0xD9.toByte() // JPEG end marker, no trailing zeros
        )
        val imageLength = originalData.size
        
        // Act
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(imageLength, actualLength) // No change expected
    }

    @Test
    fun testTrimTrailingZeroBytes_SingleTrailingZero() {
        // Arrange
        val originalData = byteArrayOf(
            0xFF.toByte(), 0xD8.toByte(), // JPEG header
            0x00, 0x01, 0x02, // Some data
            0xFF.toByte(), 0xD9.toByte(), // JPEG end marker
            0x00 // Single trailing zero
        )
        val imageLength = originalData.size
        
        // Act
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(7, actualLength) // Should trim 1 trailing zero
    }

    @Test
    fun testTrimTrailingZeroBytes_MinimumSizeProtection() {
        // Arrange - Very small data with all zeros after first 2 bytes
        val originalData = byteArrayOf(0x01, 0x02, 0x00, 0x00, 0x00)
        val imageLength = originalData.size
        
        // Act
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(2, actualLength) // Should stop at minimum size of 2
    }

    @Test
    fun testTrimTrailingZeroBytes_MixedZerosInData() {
        // Arrange - Data with zeros in the middle but not trailing
        val originalData = byteArrayOf(
            0xFF.toByte(), 0xD8.toByte(), // JPEG header
            0x00, 0x00, 0x00, // Zeros in the middle
            0x01, 0x02, 0x03, // Non-zero data
            0xFF.toByte(), 0xD9.toByte() // JPEG end marker
        )
        val imageLength = originalData.size
        
        // Act
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(imageLength, actualLength) // No change - zeros are not trailing
    }

    @Test
    fun testTrimTrailingZeroBytes_CompletelyZeroData() {
        // Arrange - Edge case: all zeros
        val originalData = ByteArray(10) { 0 }
        val imageLength = originalData.size
        
        // Act
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        
        // Assert
        assertEquals(2, actualLength) // Should stop at minimum size of 2
    }

    @Test
    fun testByteArrayInputStream_AfterTrimming() {
        // Arrange
        val originalData = byteArrayOf(
            0xFF.toByte(), 0xD8.toByte(), // JPEG header
            0x01, 0x02, 0x03, 0x04, // Some data
            0xFF.toByte(), 0xD9.toByte(), // JPEG end marker
            0x00, 0x00 // Trailing zeros
        )
        val imageLength = originalData.size
        
        // Act - simulate the actual implementation
        var actualLength = imageLength
        while (actualLength > 2 && originalData[actualLength - 1] == 0.toByte()) {
            actualLength--
        }
        val inputStream = ByteArrayInputStream(originalData, 0, actualLength)
        
        // Assert
        val available = inputStream.available()
        assertEquals(8, available) // Should have 8 bytes available (10 - 2 trailing zeros)
        
        // Read and verify the data
        val readData = ByteArray(available)
        inputStream.read(readData)
        assertArrayEquals(originalData.copyOfRange(0, actualLength), readData)
    }
}