import Foundation
import BigInt

struct MerkleProof {
    let root: BigInt
    let leafIndex: Int
    let siblings: [BigInt]
}

class IMT {
    private let hashFunction: ([BigInt]) -> BigInt
    private let height: Int
    private let arity: Int
    private var zeroValue: BigInt = BigInt(0)
    private var nodes: [BigInt] = []
    private var maxLeafIndex: Int = 0
    
    init(hashFunction: @escaping ([BigInt]) -> BigInt, height: Int, arity: Int = 2) {
        self.hashFunction = hashFunction
        self.height = height
        self.arity = arity
    }
    
    func initialize(zeroValue: BigInt, leaves: [BigInt]) {
        self.zeroValue = zeroValue
        self.maxLeafIndex = leaves.count
        
        // Initialize nodes array with zero values
        let totalNodes = calculateTotalNodes()
        nodes = Array(repeating: BigInt(0), count: totalNodes)
        
        // Fill leaf nodes
        let startIndex = calculateStartIndex(height)

        for (i, leaf) in leaves.enumerated() {
            nodes[startIndex + i] = leaf
        }

        // Fill remaining leaf nodes with zero value
        for i in leaves.count..<(1 << height) {
            nodes[startIndex + i] = zeroValue
        }

        // Calculate internal nodes bottom-up
        for level in (0...height-1).reversed() {
            let levelStartIndex = calculateStartIndex(level)
            let nextLevelStartIndex = calculateStartIndex(level + 1)
            let nodesInLevel = 1 << level
            
            // Create a dispatch group to synchronize level completion
            let group = DispatchGroup()
            // Use concurrent queue for parallel processing
            let queue = DispatchQueue(label: "app.zkpassport.zkpassport.imt.level\(level)", attributes: .concurrent)
            
            // Process chunks of nodes in parallel
            let chunkSize = max(64, nodesInLevel / ProcessInfo.processInfo.activeProcessorCount)
            stride(from: 0, to: nodesInLevel, by: chunkSize).forEach { chunkStart in
                group.enter()
              queue.async { [self] in
                    let chunkEnd = min(chunkStart + chunkSize, nodesInLevel)
                    for i in chunkStart..<chunkEnd {
                        let leftChildIndex = nextLevelStartIndex + i * 2
                        let rightChildIndex = leftChildIndex + 1
                        let children = [nodes[leftChildIndex], nodes[rightChildIndex]]
                        nodes[levelStartIndex + i] = hashFunction(children)
                    }
                    group.leave()
                }
            }
            
            // Wait for all hashes in this level to complete before moving to the next level
            group.wait()
        }
    }
    
    func createProof(index: Int) throws -> MerkleProof {
        guard index >= 0 && index < maxLeafIndex else {
            throw NSError(domain: "IMT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid index"])
        }
        
        var siblings: [BigInt] = []
        var currentIndex = calculateStartIndex(height) + index
        
        // Collect siblings from bottom to top
        for level in (1...height).reversed() {
            let levelStartIndex = calculateStartIndex(level)
            let parentIndex = (currentIndex - levelStartIndex) / 2
            let isLeftChild = (currentIndex - levelStartIndex) % 2 == 0
            let siblingIndex = levelStartIndex + (isLeftChild ? parentIndex * 2 + 1 : parentIndex * 2)
            
            siblings.append(nodes[siblingIndex])
            currentIndex = calculateStartIndex(level - 1) + parentIndex
        }
        
        return MerkleProof(
            root: nodes[0],
            leafIndex: index,
            siblings: siblings
        )
    }
    
    private func calculateStartIndex(_ level: Int) -> Int {
        var sum = 0
        for i in 0..<level {
            sum += 1 << i
        }
        return sum
    }
    
    private func calculateTotalNodes() -> Int {
        var sum = 0
        for i in 0...height {
            sum += 1 << i
        }
        return sum
    }
} 
