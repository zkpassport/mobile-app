import { CircuitManifest } from "@zkpassport/utils"
import { getCircuitVersion } from "@/lib/circuit-matcher"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { CIRCUIT_VERSION } from "@/lib/constants"
import { increaseVersionMajor, increaseVersionMinor, increaseVersionPatch } from "@/lib"

describe("getCircuitVersion", () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>

  const createMockManifest = (version: string): CircuitManifest => ({
    version: version as `${number}.${number}.${number}`,
    root: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    circuits: {
      sig_check_dsc: {
        hash: "test_hash_dsc",
        size: 1234567,
      },
      sig_check_id: {
        hash: "test_hash_id",
        size: 2345678,
      },
      data_check_integrity: {
        hash: "test_hash_integrity",
        size: 3456789,
      },
    },
  })

  beforeEach(() => {
    // Setup AsyncStorage mock
    mockAsyncStorage.getItem = jest.fn()
    mockAsyncStorage.setItem = jest.fn()
    mockAsyncStorage.removeItem = jest.fn()
    mockAsyncStorage.clear = jest.fn()
    // Mock console methods
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  describe("version incrementing", () => {
    it("should increase version patch", () => {
      expect(increaseVersionPatch("1.0.0")).toBe("1.0.1")
      expect(increaseVersionPatch("1.0.0", 2)).toBe("1.0.2")
      // For under 1.0.0
      expect(increaseVersionPatch("0.9.0")).toBe("0.9.1")
      expect(increaseVersionPatch("0.9.0", 2)).toBe("0.9.2")
    })
    it("should increase version minor", () => {
      expect(increaseVersionMinor("1.0.0")).toBe("1.1.0")
      expect(increaseVersionMinor("1.0.0", 2)).toBe("1.2.0")
      // For under 1.0.0, it should increase patch instead of minor
      expect(increaseVersionMinor("0.9.0")).toBe("0.9.1")
      expect(increaseVersionMinor("0.9.1", 2)).toBe("0.9.3")
    })
    it("should increase version major", () => {
      expect(increaseVersionMajor("1.0.0")).toBe("2.0.0")
      expect(increaseVersionMajor("1.0.0", 2)).toBe("3.0.0")
      // For under 1.0.0, it should increase minor instead of major
      expect(increaseVersionMajor("0.9.0")).toBe("0.10.0")
      expect(increaseVersionMajor("0.9.1", 2)).toBe("0.11.1")
    })
  })

  describe("getCircuitVersion flow", () => {
    it("should get the circuit version from the manifest", async () => {
      const manifest = createMockManifest(increaseVersionMinor(CIRCUIT_VERSION))
      mockAsyncStorage.getItem.mockResolvedValue(null)

      const circuitVersion = await getCircuitVersion(manifest)
      expect(circuitVersion).toBe(increaseVersionMinor(CIRCUIT_VERSION))
      // The cache is null
      expect(console.log).toHaveBeenCalledWith("Cached version: null")
      // The manifest version is the new version
      expect(console.log).toHaveBeenCalledWith("Circuit manifest version: " + manifest.version)
      // Because the cache is null and the manifest version is defined, there should be considered different
      expect(console.log).toHaveBeenCalledWith(
        "New compatible version of circuits, saving to cache",
      )
      // And the cache should be set to the new manifest version
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("circuit_version", manifest.version)
    })

    it("should get the circuit version from the cache", async () => {
      const manifest = createMockManifest(increaseVersionMinor(CIRCUIT_VERSION))
      mockAsyncStorage.getItem.mockResolvedValue(increaseVersionMinor(CIRCUIT_VERSION))

      const circuitVersion = await getCircuitVersion(manifest)
      expect(circuitVersion).toBe(increaseVersionMinor(CIRCUIT_VERSION))
      expect(console.log).toHaveBeenCalledWith(
        "Cached version: " + increaseVersionMinor(CIRCUIT_VERSION),
      )
      expect(console.log).toHaveBeenCalledWith(
        "Circuit manifest version: " + increaseVersionMinor(CIRCUIT_VERSION),
      )
      // The version should be from the cache
      expect(console.log).toHaveBeenCalledWith("Using cached version of circuits")
    })

    it("should force version from the cache if the manifest version is not compatible", async () => {
      const manifest = createMockManifest(increaseVersionMajor(CIRCUIT_VERSION))
      mockAsyncStorage.getItem.mockResolvedValue(increaseVersionMinor(CIRCUIT_VERSION))

      const circuitVersion = await getCircuitVersion(manifest)
      expect(circuitVersion).toBe(increaseVersionMinor(CIRCUIT_VERSION))
      expect(manifest.version).toBe(increaseVersionMajor(CIRCUIT_VERSION))
      expect(console.log).toHaveBeenCalledWith(
        "Cached version: " + increaseVersionMinor(CIRCUIT_VERSION),
      )
      expect(console.log).toHaveBeenCalledWith("Circuit manifest version: " + manifest.version)
      // The new version is not compatible, so it should fallback to the cached version
      expect(console.log).toHaveBeenCalledWith("Using cached version of circuits")
    })

    it("should get the version from the constant if the manifest version is not compatible and the cache is null", async () => {
      const manifest = createMockManifest(increaseVersionMajor(CIRCUIT_VERSION))
      mockAsyncStorage.getItem.mockResolvedValue(null)

      const circuitVersion = await getCircuitVersion(manifest)
      expect(circuitVersion).toBe(CIRCUIT_VERSION)
      expect(manifest.version).toBe(increaseVersionMajor(CIRCUIT_VERSION))
      expect(console.log).toHaveBeenCalledWith("Cached version: null")
      expect(console.log).toHaveBeenCalledWith("Circuit manifest version: " + manifest.version)
      // The new version is not compatible, so it should fallback to the constant as the cache is not defined
      expect(console.log).toHaveBeenCalledWith("Using static version of circuits")
    })

    it("should handle non-breaking version changes", async () => {
      const manifest = createMockManifest(increaseVersionMinor(CIRCUIT_VERSION, 2))
      mockAsyncStorage.getItem.mockResolvedValue(increaseVersionMinor(CIRCUIT_VERSION, 1))

      const circuitVersion = await getCircuitVersion(manifest)
      // The version should have been updated to the new minor update
      expect(circuitVersion).toBe(increaseVersionMinor(CIRCUIT_VERSION, 2))
      // The manifest version should be the new minor update
      expect(manifest.version).toBe(increaseVersionMinor(CIRCUIT_VERSION, 2))
      // The cached version should be the old version
      expect(console.log).toHaveBeenCalledWith(
        "Cached version: " + increaseVersionMinor(CIRCUIT_VERSION, 1),
      )
      // The manifest version should be the new minor update
      expect(console.log).toHaveBeenCalledWith("Circuit manifest version: " + manifest.version)
      // The new version is compatible, so it should save the new version to the cache
      expect(console.log).toHaveBeenCalledWith(
        "New compatible version of circuits, saving to cache",
      )
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("circuit_version", manifest.version)
    })
  })
})
