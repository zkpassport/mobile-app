import { CircuitManifest } from "@zkpassport/utils"
import { checkManifestVersion } from "@/lib/circuit-matcher"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { CIRCUIT_VERSION } from "@/lib/constants"
import { increaseVersionMajor, increaseVersionMinor } from "@/lib"

// Mock the RegistryClient
const mockGetCircuitManifest = jest.fn()
jest.mock("@zkpassport/registry", () => ({
  RegistryClient: jest.fn().mockImplementation(() => ({
    getCircuitManifest: mockGetCircuitManifest,
  })),
}))

describe("checkManifestVersion", () => {
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
    // Clear mocks
    mockGetCircuitManifest.mockClear()
    // Mock console methods
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  describe("basic functionality", () => {
    it("should fetch manifest and return matching version when no manifest provided", async () => {
      const manifest = createMockManifest(CIRCUIT_VERSION)
      mockGetCircuitManifest.mockResolvedValue(manifest)
      mockAsyncStorage.getItem.mockResolvedValue(CIRCUIT_VERSION)

      const result = await checkManifestVersion()

      expect(result).toEqual({
        circuitManifest: manifest,
        circuitVersion: CIRCUIT_VERSION,
      })
      expect(mockGetCircuitManifest).toHaveBeenCalledWith(undefined, {
        version: undefined,
        validate: false,
      })
    })

    it("should use provided manifest when passed", async () => {
      const manifest = createMockManifest(CIRCUIT_VERSION)
      mockAsyncStorage.getItem.mockResolvedValue(CIRCUIT_VERSION)

      const result = await checkManifestVersion(manifest)

      expect(result).toEqual({
        circuitManifest: manifest,
        circuitVersion: CIRCUIT_VERSION,
      })
      expect(mockGetCircuitManifest).not.toHaveBeenCalled()
    })
  })

  describe("caching behavior", () => {
    it("should cache new compatible version", async () => {
      const manifest = createMockManifest(CIRCUIT_VERSION)
      mockGetCircuitManifest.mockResolvedValue(manifest)
      mockAsyncStorage.getItem.mockResolvedValue(null)

      await checkManifestVersion()

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("circuit_version", CIRCUIT_VERSION)
    })

    it("should not update cache if version is not compatible", async () => {
      const manifest = createMockManifest(increaseVersionMajor(CIRCUIT_VERSION))
      mockGetCircuitManifest.mockResolvedValue(manifest)
      mockAsyncStorage.getItem.mockResolvedValue(null)

      const result = await checkManifestVersion()

      expect(result.circuitVersion).toBe(CIRCUIT_VERSION)
      expect(console.log).toHaveBeenCalledWith("Using static version of circuits")
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled()
    })

    it("should update cached version when new compatible version is available", async () => {
      const manifest = createMockManifest(increaseVersionMinor(CIRCUIT_VERSION))
      mockGetCircuitManifest.mockResolvedValue(manifest)
      mockAsyncStorage.getItem.mockResolvedValue(CIRCUIT_VERSION)

      const result = await checkManifestVersion()

      // When cached version exists and manifest version is different but compatible,
      // it will update to the new compatible version
      expect(result.circuitVersion).toBe(increaseVersionMinor(CIRCUIT_VERSION))
      expect(console.log).toHaveBeenCalledWith(
        "New compatible version of circuits, saving to cache",
      )
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        "circuit_version",
        increaseVersionMinor(CIRCUIT_VERSION),
      )
    })
  })

  describe("version mismatch handling", () => {
    it("should fetch new manifest when versions do not match", async () => {
      const oldManifest = createMockManifest("0.6.0")
      const newManifest = createMockManifest("0.7.0")
      mockGetCircuitManifest.mockResolvedValueOnce(oldManifest).mockResolvedValueOnce(newManifest)
      mockAsyncStorage.getItem.mockResolvedValue("0.7.0")

      const result = await checkManifestVersion()

      expect(console.log).toHaveBeenCalledWith("Circuit version mismatch, getting new manifest")
      expect(mockGetCircuitManifest).toHaveBeenCalledTimes(2)
      expect(mockGetCircuitManifest).toHaveBeenNthCalledWith(2, undefined, {
        version: "0.7.0",
        validate: false,
      })
      expect(result).toEqual({
        circuitManifest: newManifest,
        circuitVersion: "0.7.0",
      })
    })

    it("should fetch newer version when available", async () => {
      const oldManifest = createMockManifest(CIRCUIT_VERSION)
      mockGetCircuitManifest.mockResolvedValue(oldManifest)
      mockAsyncStorage.getItem.mockResolvedValue(null) // No cached version

      const result = await checkManifestVersion()

      // When no cached version exists, it will use CIRCUIT_VERSION
      // Since manifest version matches circuit version, no second fetch occurs
      expect(result).toEqual({
        circuitManifest: oldManifest,
        circuitVersion: CIRCUIT_VERSION,
      })
    })
  })
})
