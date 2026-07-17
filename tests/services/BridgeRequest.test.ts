import { BridgeRequestStorage, BridgeRequestData } from "@/services/BridgeRequest"
import { StorageService } from "@/services/StorageService"
import { BridgeInterface } from "@obsidion/bridge"

// Mock the utilities
jest.mock("@zkpassport/utils", () => ({
  hexToUint8Array: jest.fn((hex: string) => {
    // Simple mock: convert hex string to byte array
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
  }),
  uint8ArrayToHex: jest.fn((arr: Uint8Array) => {
    // Simple mock: convert byte array to hex string
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }),
}))

describe("BridgeRequestStorage", () => {
  let storage: StorageService
  let bridgeRequestStorage: BridgeRequestStorage

  beforeEach(() => {
    // Create a mock storage service
    storage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    } as any

    bridgeRequestStorage = new BridgeRequestStorage(storage)
  })

  describe("load", () => {
    it("should load stored bridge requests from storage", async () => {
      const mockRequests: BridgeRequestData[] = [
        {
          pubkey: "pubkey1",
          keyPair: {
            publicKey: "aabbcc",
            privateKey: "ddeeff",
          },
          domain: "example.com",
        },
      ]
      ;(storage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockRequests))

      await bridgeRequestStorage.load()

      expect(storage.getItem).toHaveBeenCalledWith("@zkpassport:bridge_requests")
      expect(bridgeRequestStorage["requests"]).toEqual(mockRequests)
    })

    it("should handle empty storage gracefully", async () => {
      ;(storage.getItem as jest.Mock).mockResolvedValue(null)

      await bridgeRequestStorage.load()

      expect(bridgeRequestStorage["requests"]).toEqual([])
    })

    it("should handle storage errors gracefully", async () => {
      ;(storage.getItem as jest.Mock).mockRejectedValue(new Error("Storage error"))

      await bridgeRequestStorage.load()

      expect(bridgeRequestStorage["requests"]).toEqual([])
    })

    it("should handle invalid JSON in storage", async () => {
      ;(storage.getItem as jest.Mock).mockResolvedValue("invalid json")

      await bridgeRequestStorage.load()

      expect(bridgeRequestStorage["requests"]).toEqual([])
    })
  })

  describe("findKeyPairByPubkey", () => {
    beforeEach(async () => {
      const mockRequests: BridgeRequestData[] = [
        {
          pubkey: "pubkey1",
          keyPair: {
            publicKey: "aabbcc",
            privateKey: "ddeeff",
          },
          domain: "example.com",
        },
        {
          pubkey: "pubkey2",
          keyPair: {
            publicKey: "112233",
            privateKey: "445566",
          },
          domain: "test.com",
        },
        {
          pubkey: "pubkey1",
          keyPair: {
            publicKey: "778899",
            privateKey: "aabbcc",
          },
          domain: "different.com",
        },
      ]
      ;(storage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockRequests))
      await bridgeRequestStorage.load()
    })

    it("should find keypair by pubkey and domain", () => {
      const result = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")

      expect(result).toBeDefined()
      expect(result?.publicKey).toBeInstanceOf(Uint8Array)
      expect(result?.privateKey).toBeInstanceOf(Uint8Array)
    })

    it("should return undefined when pubkey is not found", () => {
      const result = bridgeRequestStorage.findKeyPairByPubkey("nonexistent", "example.com")

      expect(result).toBeUndefined()
    })

    it("should return undefined when domain does not match", () => {
      const result = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "wrong.com")

      expect(result).toBeUndefined()
    })

    it("should distinguish between same pubkey with different domains", () => {
      const result1 = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")
      const result2 = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "different.com")

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
      // They should have different keypairs
      expect(result1?.publicKey).not.toEqual(result2?.publicKey)
    })

    it("should convert hex strings to Uint8Array correctly", () => {
      const result = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")

      expect(result).toBeDefined()
      expect(result?.publicKey).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]))
      expect(result?.privateKey).toEqual(new Uint8Array([0xdd, 0xee, 0xff]))
    })
  })

  describe("storeBridgeKeyPair", () => {
    let mockBridge: BridgeInterface

    beforeEach(() => {
      mockBridge = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0x11, 0x22, 0x33]),
          privateKey: new Uint8Array([0x44, 0x55, 0x66]),
        })),
      } as any
    })

    it("should store a new bridge keypair", async () => {
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      expect(mockBridge.getKeyPair).toHaveBeenCalled()
      expect(storage.setItem).toHaveBeenCalled()
      expect(bridgeRequestStorage["requests"]).toHaveLength(1)
      expect(bridgeRequestStorage["requests"][0]).toEqual({
        pubkey: "pubkey1",
        keyPair: {
          publicKey: "112233",
          privateKey: "445566",
        },
        domain: "example.com",
      })
    })

    it("should update existing request with same pubkey and domain", async () => {
      // Add first request
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      // Update with new keypair for same pubkey and domain
      const mockBridge2 = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0xaa, 0xbb, 0xcc]),
          privateKey: new Uint8Array([0xdd, 0xee, 0xff]),
        })),
      } as any

      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge2, "pubkey1", "example.com")

      expect(bridgeRequestStorage["requests"]).toHaveLength(1)
      expect(bridgeRequestStorage["requests"][0].keyPair.publicKey).toBe("aabbcc")
    })

    it("should maintain FIFO queue and remove oldest when exceeding max", async () => {
      // Store 6 requests (max is 5)
      for (let i = 0; i < 6; i++) {
        await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, `pubkey${i}`, "example.com")
      }

      expect(bridgeRequestStorage["requests"]).toHaveLength(5)
      // First request (pubkey0) should be removed
      expect(bridgeRequestStorage["requests"][0].pubkey).toBe("pubkey1")
      expect(bridgeRequestStorage["requests"][4].pubkey).toBe("pubkey5")
    })

    it("should move updated request to end of queue", async () => {
      // Add 3 requests
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey2", "example.com")
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey3", "example.com")

      // Update the first one
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      expect(bridgeRequestStorage["requests"]).toHaveLength(3)
      // pubkey1 should now be at the end
      expect(bridgeRequestStorage["requests"][2].pubkey).toBe("pubkey1")
      expect(bridgeRequestStorage["requests"][0].pubkey).toBe("pubkey2")
    })

    it("should allow same pubkey with different domains", async () => {
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "test.com")

      expect(bridgeRequestStorage["requests"]).toHaveLength(2)
      expect(bridgeRequestStorage["requests"][0].domain).toBe("example.com")
      expect(bridgeRequestStorage["requests"][1].domain).toBe("test.com")
    })

    it("should persist to storage after adding request", async () => {
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      expect(storage.setItem).toHaveBeenCalledWith(
        "@zkpassport:bridge_requests",
        expect.any(String),
      )
    })
  })

  describe("clear", () => {
    it("should clear all requests and remove from storage", async () => {
      // Add some requests first
      const mockBridge = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0x11, 0x22, 0x33]),
          privateKey: new Uint8Array([0x44, 0x55, 0x66]),
        })),
      } as any

      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey2", "example.com")

      expect(bridgeRequestStorage["requests"]).toHaveLength(2)

      await bridgeRequestStorage.clear()

      expect(bridgeRequestStorage["requests"]).toHaveLength(0)
      expect(storage.removeItem).toHaveBeenCalledWith("@zkpassport:bridge_requests")
    })

    it("should handle clearing empty storage", async () => {
      await bridgeRequestStorage.clear()

      expect(bridgeRequestStorage["requests"]).toHaveLength(0)
      expect(storage.removeItem).toHaveBeenCalledWith("@zkpassport:bridge_requests")
    })
  })

  describe("integration scenarios", () => {
    it("should handle complete lifecycle: load, add, find, clear", async () => {
      // Start with empty storage
      ;(storage.getItem as jest.Mock).mockResolvedValue(null)
      await bridgeRequestStorage.load()

      // Add a request
      const mockBridge = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0x11, 0x22, 0x33]),
          privateKey: new Uint8Array([0x44, 0x55, 0x66]),
        })),
      } as any

      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      // Find it
      const found = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")
      expect(found).toBeDefined()

      // Clear
      await bridgeRequestStorage.clear()
      const notFound = bridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")
      expect(notFound).toBeUndefined()
    })

    it("should persist and reload requests correctly", async () => {
      // Add a request
      const mockBridge = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0x11, 0x22, 0x33]),
          privateKey: new Uint8Array([0x44, 0x55, 0x66]),
        })),
      } as any

      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey1", "example.com")

      // Capture what was saved
      const savedData = (storage.setItem as jest.Mock).mock.calls[0][1]

      // Create a new instance and load from storage
      const newBridgeRequestStorage = new BridgeRequestStorage(storage)
      ;(storage.getItem as jest.Mock).mockResolvedValue(savedData)
      await newBridgeRequestStorage.load()

      // Should be able to find the same request
      const found = newBridgeRequestStorage.findKeyPairByPubkey("pubkey1", "example.com")
      expect(found).toBeDefined()
      expect(found?.publicKey).toEqual(new Uint8Array([0x11, 0x22, 0x33]))
    })

    it("should handle max requests limit correctly across multiple operations", async () => {
      const mockBridge = {
        getKeyPair: jest.fn(() => ({
          publicKey: new Uint8Array([0x11, 0x22, 0x33]),
          privateKey: new Uint8Array([0x44, 0x55, 0x66]),
        })),
      } as any

      // Add 5 requests (at max)
      for (let i = 0; i < 5; i++) {
        await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, `pubkey${i}`, "example.com")
      }

      // All should be findable
      for (let i = 0; i < 5; i++) {
        expect(bridgeRequestStorage.findKeyPairByPubkey(`pubkey${i}`, "example.com")).toBeDefined()
      }

      // Add 6th request
      await bridgeRequestStorage.storeBridgeKeyPair(mockBridge, "pubkey5", "example.com")

      // First one should be gone
      expect(bridgeRequestStorage.findKeyPairByPubkey("pubkey0", "example.com")).toBeUndefined()
      // Rest should exist
      for (let i = 1; i <= 5; i++) {
        expect(bridgeRequestStorage.findKeyPairByPubkey(`pubkey${i}`, "example.com")).toBeDefined()
      }
    })
  })
})
