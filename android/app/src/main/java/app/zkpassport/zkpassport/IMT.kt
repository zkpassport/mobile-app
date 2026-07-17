package app.zkpassport.zkpassport

import java.math.BigInteger
import android.util.Log
import kotlinx.coroutines.*

data class MerkleProof(
    val root: BigInteger,
    val leafIndex: Int,
    val siblings: List<BigInteger>
)

class IMT(
    private val hashFunction: suspend (List<BigInteger>) -> BigInteger,
    private val height: Int,
    private val arity: Int = 2,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    private var zeroValue: BigInteger = BigInteger.ZERO
    private var nodes: MutableList<BigInteger> = mutableListOf()
    private var maxLeafIndex: Int = 0

    suspend fun initialize(zeroValue: BigInteger, leaves: List<BigInteger>) {
        this.zeroValue = zeroValue
        this.maxLeafIndex = leaves.size
        
        // Initialize nodes array with zero values
        val totalNodes = calculateTotalNodes()
        nodes = MutableList(totalNodes) { BigInteger.ZERO }
        
        // Fill leaf nodes
        val startIndex = calculateStartIndex(height)
        for (i in leaves.indices) {
            nodes[startIndex + i] = leaves[i]
        }
        
        // Fill remaining leaf nodes with zero value
        for (i in leaves.size until (1 shl height)) {
            nodes[startIndex + i] = zeroValue
        }
        
        // Calculate internal nodes bottom-up with optimized parallelization
        coroutineScope {
            for (level in height - 1 downTo 0) {
                val levelStartIndex = calculateStartIndex(level)
                val nextLevelStartIndex = calculateStartIndex(level + 1)
                val nodesInLevel = 1 shl level
                
                // Use optimal batch size for parallelization
                val batchSize = minOf(nodesInLevel, Runtime.getRuntime().availableProcessors() * 2)
                
                if (nodesInLevel <= batchSize) {
                    // Process all nodes in parallel for small levels
                    val jobs = (0 until nodesInLevel).map { i ->
                        async(dispatcher) {
                            val leftChildIndex = nextLevelStartIndex + i * 2
                            val rightChildIndex = leftChildIndex + 1
                            val children = listOf(nodes[leftChildIndex], nodes[rightChildIndex])
                            nodes[levelStartIndex + i] = hashFunction(children)
                        }
                    }
                    jobs.awaitAll()
                } else {
                    // Process in batches for large levels to avoid thread explosion
                    for (batch in 0 until nodesInLevel step batchSize) {
                        val endBatch = minOf(batch + batchSize, nodesInLevel)
                        val jobs = (batch until endBatch).map { i ->
                            async(dispatcher) {
                                val leftChildIndex = nextLevelStartIndex + i * 2
                                val rightChildIndex = leftChildIndex + 1
                                val children = listOf(nodes[leftChildIndex], nodes[rightChildIndex])
                                nodes[levelStartIndex + i] = hashFunction(children)
                            }
                        }
                        jobs.awaitAll()
                    }
                }
            }
        }
    }

    fun createProof(index: Int): MerkleProof {
        if (index < 0 || index >= maxLeafIndex) {
            throw IllegalArgumentException("Invalid index")
        }

        val siblings = mutableListOf<BigInteger>()
        var currentIndex = calculateStartIndex(height) + index

        // Collect siblings from bottom to top
        for (level in height downTo 1) {
            val levelStartIndex = calculateStartIndex(level)
            val parentIndex = (currentIndex - levelStartIndex) / 2
            val isLeftChild = (currentIndex - levelStartIndex) % 2 == 0
            val siblingIndex = levelStartIndex + (if (isLeftChild) parentIndex * 2 + 1 else parentIndex * 2)
            
            siblings.add(nodes[siblingIndex])
            currentIndex = calculateStartIndex(level - 1) + parentIndex
        }

        return MerkleProof(
            root = nodes[0],
            leafIndex = index,
            siblings = siblings
        )
    }

    private fun calculateStartIndex(level: Int): Int {
        var sum = 0
        for (i in 0 until level) {
            sum += 1 shl i
        }
        return sum
    }

    private fun calculateTotalNodes(): Int {
        var sum = 0
        for (i in 0..height) {
            sum += 1 shl i
        }
        return sum
    }
} 