//
//  NativeOperationsModule.swift
//  NativeOperations
//
//  Created by Theo Madzou on 29/01/2025.
//

import Foundation
import React
import Swoir
import SwoirCore
import Swoirenberg
import BigInt

@objc(NativeOperationsModule)
class NativeOperationsModule: NSObject {
  // Cache for recently computed trees (LRU with max 10 trees)
  private var treeCache: [String: (tree: IMT, leaves: [String], height: Int)] = [:]
  private let maxCacheSize = 10
  private let cacheQueue = DispatchQueue(label: "merkle.cache", attributes: .concurrent)
  @objc(computeMerkleProof:index:height:resolve:reject:)
  func computeMerkleProof(_ leaves: [String], index: Int, height: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Run computation on background queue to avoid blocking UI
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        // Create cache key
        let cacheKey = "\(height):\(leaves.joined(separator: ","))"
        
        let tree: IMT = self.cacheQueue.sync {
          if let cached = self.treeCache[cacheKey],
             cached.leaves == leaves && cached.height == height {
            // Move to end (LRU) by removing and re-adding
            self.treeCache.removeValue(forKey: cacheKey)
            self.treeCache[cacheKey] = cached
            return cached.tree
          }
          
          // Not in cache, create new tree
          let newTree = IMT(hashFunction: Poseidon2.hash, height: height)
          
          // Add to cache (remove oldest if necessary)
          if self.treeCache.count >= self.maxCacheSize {
            let oldestKey = self.treeCache.keys.first!
            self.treeCache.removeValue(forKey: oldestKey)
          }
          self.treeCache[cacheKey] = (tree: newTree, leaves: leaves, height: height)
          return newTree
        }
        
        // Convert hex strings to BigInts
        let leafBigInts = leaves.map { BigInt($0.replacingOccurrences(of: "0x", with: ""), radix: 16)! }
        // Initialize tree with leaves
        tree.initialize(zeroValue: BigInt(0), leaves: leafBigInts)
        // Create proof for the given index
        let proof = try tree.createProof(index: index)
        // Convert siblings to hex strings
        let path = proof.siblings.map { "0x" + String($0, radix: 16).padding(toLength: 64, withPad: "0", startingAt: 0) }
        let root = "0x" + String(proof.root, radix: 16).padding(toLength: 64, withPad: "0", startingAt: 0)
        
        // Return result on main queue
        DispatchQueue.main.async {
          resolve(["path": path, "index": index, "root": root])
        }
      } catch {
        print("Error", error)
        DispatchQueue.main.async {
          reject("MERKLE_PROOF_ERROR", "Error computing the merkle proof", error)
        }
      }
    }
  }
}
