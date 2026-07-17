package app.zkpassport.zkpassport

import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.Assert.*
import java.math.BigInteger

class Poseidon2Test {
    @Test
    fun testHexConversion() {
        val hex = "0x123456789abcdef"
        val bigInt = Poseidon2.hexToBigInteger(hex)
        val hexBack = Poseidon2.bigIntegerToHex(bigInt)
        assertEquals(hex.lowercase(), hexBack.lowercase())
    }

    @Test
    fun testHashSingleValue() = runBlocking {
        val input = listOf(BigInteger.ONE)
        val hash = Poseidon2.hash(input)
        assertNotNull(hash)
        assertTrue(hash >= BigInteger.ZERO)
        assertTrue(hash < BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617"))
    }

    @Test
    fun testHashMultipleValues() = runBlocking {
        val input = listOf(
            BigInteger.ONE,
            BigInteger.TWO,
            BigInteger.TEN
        )
        val hash = Poseidon2.hash(input)
        assertNotNull(hash)
        assertTrue(hash >= BigInteger.ZERO)
        assertTrue(hash < BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617"))
    }

    @Test
    fun testHashEmptyList() = runBlocking {
        val input = emptyList<BigInteger>()
        val hash = Poseidon2.hash(input)
        assertNotNull(hash)
        assertTrue(hash >= BigInteger.ZERO)
        assertTrue(hash < BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617"))
    }

    @Test
    fun testHashLargeInput() = runBlocking {
        val input = List(10) { BigInteger.valueOf(it.toLong()) }
        val hash = Poseidon2.hash(input)
        assertNotNull(hash)
        assertTrue(hash >= BigInteger.ZERO)
        assertTrue(hash < BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617"))
    }

    @Test
    fun testKnownVectors() = runBlocking {
        val inputs = listOf(
            // Test vector: [0, 0]
            listOf(BigInteger.ZERO, BigInteger.ZERO),
        
        )

        val expectedOutputs = listOf(
            // Expected hash for [0, 0]
            BigInteger("0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1", 16),
        )

        inputs.forEachIndexed { index, input ->
            val hash = Poseidon2.hash(input)
            assertNotNull(hash)
            assertTrue(hash >= BigInteger.ZERO)
            assertTrue(hash < BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617"))
            
            assertEquals(
                "Hash mismatch for input ${input.joinToString(", ")}",
                expectedOutputs[index],
                hash
            )
        }
    }
} 