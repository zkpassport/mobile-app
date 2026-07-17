package app.zkpassport.zkpassport

import java.math.BigInteger
import kotlinx.coroutines.runBlocking

class MerkleTree(private val height: Int) {
    companion object {
        fun hexToBigInteger(hex: String): BigInteger {
            return BigInteger(hex.removePrefix("0x"), 16)
        }

        fun bigIntegerToHex(value: BigInteger): String {
            return "0x" + value.toString(16).padStart(64, '0')
        }
    }

    suspend fun computeProof(leaves: List<String>, index: Int): MerkleProof {
        if (index < 0) {
            throw IllegalArgumentException("Index cannot be negative")
        }

        val maxIndex = (1 shl height) - 1
        if (index > maxIndex) {
            throw IllegalArgumentException("Index $index is too large for tree height $height (max index: $maxIndex)")
        }

        if (index >= leaves.size) {
            throw IllegalArgumentException("Index $index is out of bounds for leaves array of size ${leaves.size}")
        }

        // Convert hex strings to BigIntegers
        val leafBigInts = leaves.map { hexToBigInteger(it) }

        // Create IMT instance
        val tree = IMT(Poseidon2::hash, height)

        // Initialize tree and create proof
        tree.initialize(BigInteger.ZERO, leafBigInts)
        return tree.createProof(index)
    }
}