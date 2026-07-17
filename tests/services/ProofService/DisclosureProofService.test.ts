import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import { DisclosureProofService } from "@/services/ProofService"
import * as circuitMatcher from "@/lib/circuit-matcher"
import * as noir from "@/lib/noir"
import { CLOUD_PROVER_URL } from "@/lib/constants"
import { DisclosureCircuitName } from "@zkpassport/utils"
import {
  TimingEvents,
  getDisclosureProofParams,
  DisclosureProofParams,
  ProofModeEnum,
  DisclosureProofErrors,
  StageEnum,
} from "@/types/ProofService"
import { PASSPORTS as FIXTURE_PASSPORTS } from "../../fixtures/passports"
import FIXTURE_CIRCUIT_MANIFEST from "../../fixtures/circuit-manifest.json"

// Mocks for dependent services
const mockValidateAndRegenerateIntegrityProof: any = jest.fn()
;(mockValidateAndRegenerateIntegrityProof as any).mockResolvedValue([
  { name: "sig_check_dsc", proof: "base-1", public_inputs: "", version: "1.0.0" },
  { name: "sig_check_id_data", proof: "base-2", public_inputs: "", version: "1.0.0" },
  { name: "data_check_integrity", proof: "base-3", public_inputs: "", version: "1.0.0" },
])
const mockGenerateOuterProof: any = jest.fn()
;(mockGenerateOuterProof as any).mockResolvedValue({
  name: "outer_circuit",
  proof: "outer-proof",
  public_inputs: "",
  version: "1.0.0",
})

jest.mock("@/services/ProofService/IntegrityProofService", () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      validateAndRegenerateIntegrityProof: mockValidateAndRegenerateIntegrityProof,
    }),
  },
}))

jest.mock("@/services/ProofService/OuterProofService", () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      generateOuterProof: mockGenerateOuterProof,
    }),
  },
}))

// Mock dependencies
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/noir")
jest.mock("@/lib")

// Mock expo-device with a getter that allows dynamic changes
let mockTotalMemory = 4 * 1024 * 1024 * 1024 // Default to 4GB
jest.mock("expo-device", () => ({
  get totalMemory() {
    return mockTotalMemory
  },
}))

const mockPassport = FIXTURE_PASSPORTS.john as any

const mockCircuitManifest = { ...FIXTURE_CIRCUIT_MANIFEST, version: "1.0.0" } as any

const mockDisclosureCircuit: any = {
  circuit: {
    name: "compare_age",
    size: 500,
    vkey: "mock-vkey",
    vkey_hash: "mock-vkey-hash",
    bytecode: "mock-bytecode",
    abi: {
      parameters: [],
      param_witnesses: {},
      return_type: null,
      return_witnesses: [],
      error_types: {},
    },
    noir_version: "0.1.0",
    bb_version: "0.1.0",
    hash: 12345,
  },
  inputs: {
    data: "mock-circuit-inputs",
    salted_dg1: { value: [0, 0, 0, 0, 0, 10, 20, 30], salt: "0x1" },
    salted_private_nullifier: { value: BigInt(0), salt: "0x1" },
  },
  label: "compare_age" as DisclosureCircuitName,
}

const mockDisclosureParams: getDisclosureProofParams = {
  passport: mockPassport,
  query: {
    age: { gte: 18 },
  },
  salt: "0x1234567890abcdef",
  circuitManifest: mockCircuitManifest,
  domainName: "example.com",
  scope: "profile",
  evm: false,
  forceLowMemoryProver: false,
  onProgress: jest.fn(),
}

const mockGenerationParams: DisclosureProofParams = {
  ...mockDisclosureParams,
  baseSubproofs: [],
  credentialsRequest: {
    mode: "fast" as any,
    query: { age: { gte: 18 } } as any,
    domain: "example.com",
    topic: null,
    pubkey: null,
    service: null,
    sdkVersion: null,
  } as any,
  circuitVersion: "1.0.0",
}

describe("DisclosureProofService", () => {
  let service: DisclosureProofService

  beforeEach(() => {
    jest.clearAllMocks()
    service = DisclosureProofService.getInstance()
  })

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = DisclosureProofService.getInstance()
      const instance2 = DisclosureProofService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("getDisclosureCircuits", () => {
    it("should successfully get disclosure circuits", async () => {
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue([mockDisclosureCircuit])

      const result = await service.safeGetDisclosureCircuits(mockDisclosureParams)

      expect(result).toEqual([mockDisclosureCircuit])
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][0]).toBe(mockPassport)
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][1]).toEqual(
        mockDisclosureParams.query,
      )
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][2]).toEqual(
        BigInt(mockDisclosureParams.salt),
      )
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][3]).toBe(
        mockCircuitManifest,
      )
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][4]).toBe("example.com")
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][5]).toBe("profile")
      expect((circuitMatcher.getDisclosureCircuits as any).mock.calls[0][6]).toBe(false)
    })

    it("should handle multiple disclosure circuits", async () => {
      const multipleCircuits: any[] = [
        mockDisclosureCircuit,
        {
          ...mockDisclosureCircuit,
          circuit: { ...mockDisclosureCircuit.circuit, name: "compare_birthdate" },
          label: "compare_birthdate" as DisclosureCircuitName,
        },
      ]
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue(multipleCircuits)

      const result = await service.safeGetDisclosureCircuits(mockDisclosureParams)

      expect(result).toHaveLength(2)
      expect(result[0].label).toBe("compare_age")
      expect(result[1].label).toBe("compare_birthdate")
    })

    it("should handle EVM mode", async () => {
      const evmParams = { ...mockDisclosureParams, evm: true }
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue([])

      await service.safeGetDisclosureCircuits(evmParams)

      const call = (circuitMatcher.getDisclosureCircuits as any).mock.calls.pop()
      expect(call[0]).toBe(mockPassport)
      expect(call[1]).toEqual(evmParams.query)
      expect(call[2]).toEqual(BigInt(evmParams.salt))
      expect(call[3]).toBe(mockCircuitManifest)
      expect(call[4]).toBe("example.com")
      expect(call[5]).toBe("profile")
      expect(call[6]).toBe(true)
    })
  })

  describe("generateSingleDisclosureProof", () => {
    beforeEach(() => {
      // Mock circuit operations
      ;(noir.setupCircuit as any).mockResolvedValue("circuit-id")
      ;(noir.generateProof as any).mockResolvedValue({
        proofWithPublicInputs: "mock-disclosure-proof",
      })

      // Mock committed inputs
      ;(circuitMatcher.getCommittedInputs as any).mockResolvedValue({
        committedData: "mock-committed",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as any).mockReturnValue(false)
    })

    it("should successfully generate single disclosure proof", async () => {
      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        mockDisclosureCircuit,
        1,
        3,
      )

      expect(result).toEqual({
        proof: "mock-disclosure-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "compare_age",
        committedInputs: {
          compare_age: {
            committedData: "mock-committed",
          },
        },
      })

      // Verify progress callbacks
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(
        TimingEvents.DisclosureProofStart,
        {
          circuitName: "compare_age",
          circuitLabel: "compare_age",
          circuitSize: 500,
          proofIndex: 1,
          totalProofs: 3,
        },
      )
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(
        TimingEvents.DisclosureProofComplete,
        {
          circuitName: "compare_age",
          circuitLabel: "compare_age",
          proofIndex: 1,
          totalProofs: 3,
        },
      )
    })

    // this will never happen.
    it("should not emit progress when onProgress is undefined", async () => {
      const paramsWithoutCallbacks = { ...mockGenerationParams, onProgress: undefined }

      await service.generateSingleDisclosureProof(
        paramsWithoutCallbacks,
        mockDisclosureCircuit,
        1,
        1,
      )

      expect(mockDisclosureParams.onProgress).not.toHaveBeenCalled()
    })

    it("should handle proof generation error", async () => {
      const error = new Error(DisclosureProofErrors.ProofGenerationFailed)
      ;(noir.generateProof as any).mockRejectedValue(error)

      await expect(
        service.generateSingleDisclosureProof(mockGenerationParams, mockDisclosureCircuit, 1, 3),
      ).rejects.toThrow(DisclosureProofErrors.ProofGenerationFailed)

      // Verify error progress callback
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(StageEnum.DisclosureProofError, {
        circuitName: "compare_age",
        circuitLabel: "compare_age",
        error: DisclosureProofErrors.ProofGenerationFailed,
      })
    })

    it("should handle missing committed inputs", async () => {
      ;(circuitMatcher.getCommittedInputs as any).mockResolvedValue(null)

      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        mockDisclosureCircuit,
        1,
        1,
      )

      expect(result.committedInputs).toEqual({})
    })

    it("should use low memory prover when needed", async () => {
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as any).mockReturnValue(true)

      await service.generateSingleDisclosureProof(mockGenerationParams, mockDisclosureCircuit, 1, 1)

      expect((noir.setupCircuit as any).mock.calls[0][1]).toBe(true)
    })

    it("should notify sdk when criteria are not met", async () => {
      const params = {
        ...mockGenerationParams,
        canGenerateProofForCircuit: () => false, // does not meet criteria
        queryResults: {} as any,
      }

      await service.generateSingleDisclosureProof(params, mockDisclosureCircuit, 1, 1)

      // Verify error progress callback was called
      expect(params.onProgress).toHaveBeenCalledWith(StageEnum.DisclosureProofError, {
        circuitName: "compare_age",
        circuitLabel: "compare_age",
        error: "Criteria not met for this proof: compare_age",
      })
    })
  })

  describe("cloud prover usage", () => {
    // Circuit with sensitive inputs hidden (can use cloud prover)
    // Using string "0" instead of BigInt(0) since BigInt can't be serialized by JSON.stringify
    // The code converts it with BigInt() anyway
    const createCircuitWithHiddenInputs = (size: number): any => ({
      circuit: {
        name: "compare_age",
        size,
        vkey: "mock-vkey",
        vkey_hash: "mock-vkey-hash",
        bytecode: "mock-bytecode",
        abi: {
          parameters: [],
          param_witnesses: {},
          return_type: null,
          return_witnesses: [],
          error_types: {},
        },
        noir_version: "0.1.0",
        bb_version: "0.1.0",
        hash: 12345,
      },
      inputs: {
        data: "mock-circuit-inputs",
        // Sensitive inputs are hidden (all zeros)
        salted_dg1: { value: [0, 0, 0, 0, 0, 0, 0, 0], salt: "0x1" },
        salted_private_nullifier: { value: "0", salt: "0x1" },
      },
      label: "compare_age" as DisclosureCircuitName,
    })

    // Circuit with sensitive inputs NOT hidden (cannot use cloud prover)
    const createCircuitWithExposedInputs = (size: number): any => ({
      circuit: {
        name: "compare_age",
        size,
        vkey: "mock-vkey",
        vkey_hash: "mock-vkey-hash",
        bytecode: "mock-bytecode",
        abi: {
          parameters: [],
          param_witnesses: {},
          return_type: null,
          return_witnesses: [],
          error_types: {},
        },
        noir_version: "0.1.0",
        bb_version: "0.1.0",
        hash: 12345,
      },
      inputs: {
        data: "mock-circuit-inputs",
        // Sensitive inputs are NOT hidden (has non-zero values)
        salted_dg1: { value: [0, 0, 0, 0, 0, 10, 20, 30], salt: "0x1" },
        salted_private_nullifier: { value: "0", salt: "0x1" },
      },
      label: "compare_age" as DisclosureCircuitName,
    })

    let mockFetch: jest.Mock

    beforeEach(() => {
      jest.clearAllMocks()
      // Reset Device.totalMemory to default (4GB)
      mockTotalMemory = 4 * 1024 * 1024 * 1024

      // Mock circuit operations for local prover
      ;(noir.setupCircuit as any).mockResolvedValue("circuit-id")
      ;(noir.generateProof as any).mockResolvedValue({
        proofWithPublicInputs: "mock-local-proof",
      })

      // Mock committed inputs
      ;(circuitMatcher.getCommittedInputs as any).mockResolvedValue({
        committedData: "mock-committed",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as any).mockReturnValue(false)

      // Mock global fetch for cloud prover
      mockFetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              proof: "mock-cloud-proof",
              public_inputs: "mock-public-inputs",
            }),
        }),
      ) as jest.Mock
      global.fetch = mockFetch as unknown as typeof global.fetch
    })

    afterEach(() => {
      // Clean up fetch mock
      jest.restoreAllMocks()
    })

    it("should use cloud prover when circuit size is above 1048576 and sensitive inputs are hidden", async () => {
      // Circuit size above 2^20 (1048576) with hidden inputs
      const largeCircuitWithHiddenInputs = createCircuitWithHiddenInputs(1100000)

      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        largeCircuitWithHiddenInputs,
        1,
        1,
      )

      // Cloud prover should be called
      expect(mockFetch).toHaveBeenCalled()
      expect(mockFetch.mock.calls[0][0]).toContain("/prove")

      // Local prover should NOT be called
      expect(noir.setupCircuit).not.toHaveBeenCalled()
      expect(noir.generateProof).not.toHaveBeenCalled()

      // Verify the proof result comes from cloud prover
      expect(result.proof).toBe("mock-public-inputsmock-cloud-proof")
    })

    it("should use cloud prover when circuit size is above 524288, sensitive inputs are hidden, and device has low RAM (3GB)", async () => {
      // Set device RAM to 3GB (below 3.5GB threshold)
      mockTotalMemory = 3 * 1024 * 1024 * 1024

      // Circuit size above 2^19 (524288) but below 2^20, with hidden inputs
      const mediumCircuitWithHiddenInputs = createCircuitWithHiddenInputs(600000)

      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        mediumCircuitWithHiddenInputs,
        1,
        1,
      )

      // Cloud prover should be called due to low RAM
      expect(mockFetch).toHaveBeenCalled()
      expect(mockFetch.mock.calls[0][0]).toContain("/prove")

      // Local prover should NOT be called
      expect(noir.setupCircuit).not.toHaveBeenCalled()
      expect(noir.generateProof).not.toHaveBeenCalled()

      // Verify the proof result comes from cloud prover
      expect(result.proof).toBe("mock-public-inputsmock-cloud-proof")
    })

    it("should NOT use cloud prover when circuit size is above 524288, sensitive inputs are hidden, but device has sufficient RAM (4GB)", async () => {
      // Set device RAM to 4GB (above 3.5GB threshold)
      mockTotalMemory = 4 * 1024 * 1024 * 1024

      // Circuit size above 2^19 (524288) but below 2^20, with hidden inputs
      const mediumCircuitWithHiddenInputs = createCircuitWithHiddenInputs(600000)

      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        mediumCircuitWithHiddenInputs,
        1,
        1,
      )

      // Cloud prover should NOT be called (device has enough RAM and circuit is not large enough)
      expect(mockFetch).not.toHaveBeenCalled()

      // Local prover should be called
      expect(noir.setupCircuit).toHaveBeenCalled()
      expect(noir.generateProof).toHaveBeenCalled()

      // Verify the proof result comes from local prover
      expect(result.proof).toBe("mock-local-proof")
    })

    it("should NOT use cloud prover when circuit size is above 1048576 but sensitive inputs are NOT hidden", async () => {
      // Circuit size above 2^20 (1048576) with exposed inputs
      const largeCircuitWithExposedInputs = createCircuitWithExposedInputs(1100000)

      const result = await service.generateSingleDisclosureProof(
        mockGenerationParams,
        largeCircuitWithExposedInputs,
        1,
        1,
      )

      // Cloud prover should NOT be called (sensitive inputs are not hidden)
      expect(mockFetch).not.toHaveBeenCalled()

      // Local prover should be called
      expect(noir.setupCircuit).toHaveBeenCalled()
      expect(noir.generateProof).toHaveBeenCalled()

      // Verify the proof result comes from local prover
      expect(result.proof).toBe("mock-local-proof")
    })
  })

  describe("generateDisclosureProofs", () => {
    const multipleCircuits: any[] = [
      mockDisclosureCircuit,
      {
        ...mockDisclosureCircuit,
        circuit: { ...mockDisclosureCircuit.circuit, name: "compare_birthdate" },
        label: "compare_birthdate" as DisclosureCircuitName,
      },
    ]

    beforeEach(() => {
      // Mock getting disclosure circuits
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue(multipleCircuits)

      // Mock circuit operations
      ;(noir.setupCircuit as any).mockResolvedValue("circuit-id")
      ;(noir.generateProof as any).mockResolvedValue({
        proofWithPublicInputs: "mock-disclosure-proof",
      })

      // Mock committed inputs
      ;(circuitMatcher.getCommittedInputs as any).mockResolvedValue({
        committedData: "mock-committed",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as any).mockReturnValue(false)
    })

    it("should successfully generate multiple disclosure proofs", async () => {
      const result = await service.generateDisclosureProofs(mockGenerationParams)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("compare_age")
      expect(result[1].name).toBe("compare_birthdate")

      // Verify progress was called for each proof
      expect(mockGenerationParams.onProgress).toHaveBeenCalledTimes(4) // 2 starts + 2 completes
    })

    it("fails on per-circuit failure and returns empty array", async () => {
      // First disclosure proof succeeds
      ;(noir.generateProof as any).mockResolvedValueOnce({
        proofWithPublicInputs: "mock-proof-1",
      })
      // Second disclosure proof fails
      ;(noir.generateProof as any).mockRejectedValueOnce(
        new Error(DisclosureProofErrors.ProofGenerationFailed),
      )

      await expect(service.generateDisclosureProofs(mockGenerationParams)).rejects.toThrow(
        DisclosureProofErrors.ProofGenerationFailed,
      )

      // Only one proof succeeded
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(
        StageEnum.DisclosureProofError,
        expect.objectContaining({ circuitLabel: "compare_birthdate" }),
      )

      // Progress events for first proof
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(
        TimingEvents.DisclosureProofStart,
        expect.objectContaining({
          circuitName: "compare_age",
          circuitLabel: "compare_age",
          proofIndex: 1,
          totalProofs: 2,
        }),
      )

      // Error event for second proof
      expect(mockGenerationParams.onProgress).toHaveBeenCalledWith(
        StageEnum.DisclosureProofError,
        expect.objectContaining({ circuitLabel: "compare_birthdate" }),
      )
    })

    it("should handle empty disclosure circuits", async () => {
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue([])

      const result = await service.generateDisclosureProofs(mockGenerationParams)

      expect(result).toEqual([])
      expect(mockGenerationParams.onProgress).not.toHaveBeenCalled()
    })

    it("should propagate circuit fetching errors", async () => {
      ;(circuitMatcher.getDisclosureCircuits as any).mockRejectedValue(
        new Error(DisclosureProofErrors.FailedToGetDisclosureCircuits),
      )

      await expect(service.generateDisclosureProofs(mockGenerationParams)).rejects.toThrow(
        DisclosureProofErrors.FailedToGetDisclosureCircuits,
      )
    })
  })

  describe("generateAccessRequestProofs", () => {
    beforeEach(() => {
      ;(circuitMatcher.getDisclosureCircuits as any).mockResolvedValue([mockDisclosureCircuit])
      ;(noir.setupCircuit as any).mockResolvedValue("circuit-id")
      ;(noir.generateProof as any).mockResolvedValue({
        proofWithPublicInputs: "mock-disclosure-proof",
      })
      ;(circuitMatcher.getCommittedInputs as any).mockResolvedValue({
        committedData: "mock-committed",
      })
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as any).mockReturnValue(false)
    })

    it("compressed mode: generates outer proof and emits only outer proof callback", async () => {
      const onProofGenerated = jest.fn(async () => {})
      const params: DisclosureProofParams = {
        ...mockGenerationParams,
        onProofGenerated,
        credentialsRequest: {
          ...mockGenerationParams.credentialsRequest,
          mode: ProofModeEnum.Compressed,
        } as any,
      }

      const result = await service.generateAccessRequestProofs(params)

      // Should include outer proof
      expect(result.outerProof).toEqual(
        expect.objectContaining({ name: "outer_circuit", proof: "outer-proof" }),
      )
      // Only outer proof should be emitted
      expect(onProofGenerated).toHaveBeenCalledTimes(1)
      expect(onProofGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ name: "outer_circuit", proof: "outer-proof" }),
      )
      expect(mockGenerateOuterProof).toHaveBeenCalled()
      // Ensure default cloud prover URL is used when none provided
      const outerArgs = (mockGenerateOuterProof as any).mock.calls[0][0]
      expect(outerArgs.cloudProverUrl).toBe(CLOUD_PROVER_URL)
    })

    it("compressed-evm mode: routes through compressed flow", async () => {
      const onProofGenerated = jest.fn(async () => {})
      const params: DisclosureProofParams = {
        ...mockGenerationParams,
        onProofGenerated,
        credentialsRequest: {
          ...mockGenerationParams.credentialsRequest,
          mode: ProofModeEnum.CompressedEvm,
        } as any,
      }

      const result = await service.generateAccessRequestProofs(params)
      expect(result.outerProof).toBeDefined()
      expect(mockGenerateOuterProof).toHaveBeenCalled()
    })

    it("throws for unknown proof mode", async () => {
      const params: DisclosureProofParams = {
        ...mockGenerationParams,
        credentialsRequest: {
          ...mockGenerationParams.credentialsRequest,
          // @ts-expect-error testing unknown mode
          mode: "totally_unknown_mode",
        },
      }

      await expect(service.generateAccessRequestProofs(params)).rejects.toThrow(
        /UNKNOWN_PROOF_MODE/,
      )
    })

    it("validates disclosure circuits against criteria and returns empty proofs when not met", async () => {
      // Provide a canGenerateProofForCircuit that rejects the circuit
      const onProofGenerated = jest.fn(async () => {})
      const params: DisclosureProofParams = {
        ...mockGenerationParams,
        onProofGenerated,
        canGenerateProofForCircuit: () => false,
        queryResults: {} as any,
        credentialsRequest: {
          ...mockGenerationParams.credentialsRequest,
          mode: ProofModeEnum.Fast,
        } as any,
      }

      const result = await service.generateAccessRequestProofs(params)

      // still returns one disclosure proof
      expect(result.disclosureProofs).toHaveLength(1)

      // Verify error progress callback was called
      expect(params.onProgress).toHaveBeenCalledWith(StageEnum.DisclosureProofError, {
        circuitName: "compare_age",
        circuitLabel: "compare_age",
        error: "Criteria not met for this proof: compare_age",
      })
    })
  })
})
