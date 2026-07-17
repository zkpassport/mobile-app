import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals"
import OuterProofService from "@/services/ProofService/OuterProofService"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import {
  mockBaseSubproofs,
  mockCircuitManifest,
  mockDisclosureCircuits,
  mockDisclosureProofs,
  mockOuterCircuit,
  mockCircuitDSC,
  mockCircuitIDCheck,
  mockCircuitIntegrity,
} from "../mockData"
import { getOuterCircuit } from "@/lib/circuit-matcher"
import { OuterProofErrors } from "@/types/ProofService"

jest.mock("@/services/ProofService/DSCProofService")
jest.mock("@/services/ProofService/IDCheckProofService")
jest.mock("@/services/ProofService/IntegrityProofService")
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/constants", () => ({
  CIRCUIT_VERSION: "1.0.0",
}))

jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils") as Record<string, any>
  const getProofData = jest.fn()
  getProofData.mockReturnValue({ proof: ["mock-proof-data"], publicInputs: ["mock-public-inputs"] })
  const getNumberOfPublicInputs = jest.fn()
  getNumberOfPublicInputs.mockReturnValue(1)
  const ultraVkToFields = jest.fn()
  ultraVkToFields.mockReturnValue(["mock-vkey-fields"])
  const getCircuitMerkleProof = jest.fn()
  ;(getCircuitMerkleProof as any).mockResolvedValue({ index: 0, path: ["mock-path"] })
  const getOuterCircuitInputs = jest.fn()
  ;(getOuterCircuitInputs as any).mockResolvedValue({
    csc_to_dsc_proof: { key_hash: "0x01" },
    dsc_to_id_data_proof: { key_hash: "0x02" },
    integrity_check_proof: { key_hash: "0x03" },
    disclosure_proofs: [{ key_hash: "0x04" }],
  })
  return {
    ...actual,
    getProofData,
    getNumberOfPublicInputs,
    ultraVkToFields,
    getCircuitMerkleProof,
    getOuterCircuitInputs,
    getNowTimestamp: jest.fn().mockReturnValue(1758707194),
  }
})

jest.mock("@/lib/native-operations", () => ({
  computeMerkleProof: jest.fn(),
}))

jest.mock("@/lib/errorUtils", () => {
  const actual = jest.requireActual("@/lib/errorUtils") as Record<string, any>
  const getVkeysAndPublicInputs = jest.fn()
  getVkeysAndPublicInputs.mockReturnValue({
    vkeys: { csc_to_dsc_proof: "0x01" },
    publicInputs: ["0x02"],
  })
  const getCloudProverErrorSubType = jest.fn()
  getCloudProverErrorSubType.mockReturnValue("NETWORK_ERROR")
  const createCloudProverError = jest.fn((_name: string) => new Error("Cloud prover failed"))
  return {
    ...actual,
    getVkeysAndPublicInputs,
    getCloudProverErrorSubType,
    createCloudProverError,
  }
})

const mockParams = {
  baseSubproofs: mockBaseSubproofs,
  disclosureProofs: mockDisclosureProofs,
  disclosureCircuits: mockDisclosureCircuits,
  passport: {} as any,
  circuitManifest: mockCircuitManifest,
  domainName: "example.com",
  mode: "compressed" as const,
  cloudProverUrl: "https://api.cloudprover.com",
  onProgress: jest.fn(),
  updateSettings: jest.fn(),
  proofGenerationTimer: {
    startSubOperation: jest.fn(),
    endSubOperation: jest.fn(),
  } as any,
}

describe("OuterProofService", () => {
  let service: OuterProofService
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Setup other service mocks
    const DSCModule = jest.requireMock("@/services/ProofService/DSCProofService") as any
    const IDModule = jest.requireMock("@/services/ProofService/IDCheckProofService") as any
    const IntegrityModule = jest.requireMock("@/services/ProofService/IntegrityProofService") as any

    DSCModule.default.getInstance.mockReturnValue({
      safeGetDSCCircuit: (jest.fn() as any).mockResolvedValue(mockCircuitDSC),
    })
    IDModule.default.getInstance.mockReturnValue({
      safeGetIDDataCircuit: (jest.fn() as any).mockResolvedValue(mockCircuitIDCheck),
    })
    IntegrityModule.default.getInstance.mockReturnValue({
      safeGetIntegrityCheckCircuit: (jest.fn() as any).mockResolvedValue(mockCircuitIntegrity),
    })

    // Default fetch to success
    fetchMock = jest.fn()
    ;(fetchMock as any).mockResolvedValue({
      ok: true,
      json: async () => ({ proof: "mock-outer-proof", public_inputs: "mock-public-inputs" }),
    } as any)
    ;(global as any).fetch = fetchMock as any

    service = OuterProofService.getInstance()
  })

  afterEach(() => {
    ;(global as any).fetch = originalFetch as any
  })

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = OuterProofService.getInstance()
      const instance2 = OuterProofService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("generateOuterProof", () => {
    beforeEach(() => {
      // Mock circuit matcher
      ;(getOuterCircuit as jest.MockedFunction<typeof getOuterCircuit>).mockResolvedValue(
        mockOuterCircuit,
      )
    })

    it("should successfully generate outer proof in compressed mode", async () => {
      const result = await service.generateOuterProof(mockParams as any)

      expect(result).toEqual({
        proof: "mock-public-inputsmock-outer-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "outer_circuit",
        committedInputs: {
          compare_age: {
            currentDateTimestamp: 1758707194,
            maxAge: 0,
            minAge: 25,
          },
          compare_birthdate: {
            currentDateTimestamp: 1758707194,
            maxDateTimestamp: 631152000,
            minDateTimestamp: 631152000,
          },
        },
      })

      // Verify circuit fetching
      expect(getOuterCircuit).toHaveBeenCalledWith(
        mockParams.disclosureProofs.length,
        mockParams.circuitManifest,
        false,
      )

      // Verify progress callbacks
      expect(mockParams.onProgress).toHaveBeenCalledWith("cloud_prover_start", {
        circuitName: "outer_circuit",
      })
      expect(mockParams.onProgress).toHaveBeenCalledWith("cloud_prover_complete", {
        circuitName: "outer_circuit",
      })
    })

    it("should handle compressed-evm mode", async () => {
      const evmParams = { ...mockParams, mode: "compressed-evm" as const }

      const result = await service.generateOuterProof(evmParams as any)

      expect(result).toEqual({
        proof: "mock-public-inputsmock-outer-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "outer_circuit",
        committedInputs: {
          compare_age: {
            currentDateTimestamp: 1758707194,
            maxAge: 0,
            minAge: 25,
          },
          compare_birthdate: {
            currentDateTimestamp: 1758707194,
            maxDateTimestamp: 631152000,
            minDateTimestamp: 631152000,
          },
        },
      })

      // Verify evm flag was passed correctly
      expect(getOuterCircuit).toHaveBeenCalledWith(
        mockParams.disclosureProofs.length,
        mockParams.circuitManifest,
        true,
      )
    })

    it("should throw error when outer circuit not found", async () => {
      ;(getOuterCircuit as jest.MockedFunction<typeof getOuterCircuit>).mockResolvedValue(
        null as any,
      )

      await expect(service.generateOuterProof(mockParams as any)).rejects.toThrow(CircuitError)
    })

    it("should handle cloud prover errors", async () => {
      ;(fetchMock as any).mockRejectedValue(new Error("Cloud prover failed"))

      await expect(service.generateOuterProof(mockParams as any)).rejects.toThrow(
        "Cloud prover failed",
      )
    })

    it("should handle cloud prover non-ok response with error body", async () => {
      ;(fetchMock as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "prover error" }),
      } as any)

      await expect(service.generateOuterProof(mockParams as any)).rejects.toThrow(
        "Cloud prover failed",
      )
    })

    it("should handle missing callbacks gracefully", async () => {
      const paramsWithoutCallbacks = {
        ...mockParams,
        onProgress: undefined,
        updateSettings: undefined,
      }

      const result = await service.generateOuterProof(paramsWithoutCallbacks as any)

      expect(result).toEqual({
        proof: "mock-public-inputsmock-outer-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "outer_circuit",
        committedInputs: {
          compare_age: {
            currentDateTimestamp: 1758707194,
            maxAge: 0,
            minAge: 25,
          },
          compare_birthdate: {
            currentDateTimestamp: 1758707194,
            maxDateTimestamp: 631152000,
            minDateTimestamp: 631152000,
          },
        },
      })
    })

    it("should handle missing timer gracefully", async () => {
      const paramsWithoutTimer = {
        ...mockParams,
        proofGenerationTimer: undefined,
      }

      const result = await service.generateOuterProof(paramsWithoutTimer as any)

      expect(result).toEqual({
        proof: "mock-public-inputsmock-outer-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "outer_circuit",
        committedInputs: {
          compare_age: {
            currentDateTimestamp: 1758707194,
            maxAge: 0,
            minAge: 25,
          },
          compare_birthdate: {
            currentDateTimestamp: 1758707194,
            maxDateTimestamp: 631152000,
            minDateTimestamp: 631152000,
          },
        },
      })
    })

    it("should throw error when no disclosure proofs are provided", async () => {
      const paramsWithEmptyDisclosureProofs = {
        ...mockParams,
        disclosureProofs: [],
      }

      // Mock getOuterCircuit to return null for 0 disclosure proofs
      ;(getOuterCircuit as jest.MockedFunction<typeof getOuterCircuit>).mockResolvedValueOnce(
        null as any,
      )

      await expect(
        service.generateOuterProof(paramsWithEmptyDisclosureProofs as any),
      ).rejects.toThrow(CircuitError)

      // Verify it tried to get outer circuit with 0 disclosure proofs
      expect(getOuterCircuit).toHaveBeenCalledWith(0, mockParams.circuitManifest, false)

      // Verify the error details
      try {
        await service.generateOuterProof(paramsWithEmptyDisclosureProofs as any)
      } catch (error: any) {
        expect(error).toBeInstanceOf(CircuitError)
        expect(error.errorSubType).toBe(CircuitErrorSubType.CircuitNotFound)
        expect(error.message).toBe(OuterProofErrors.OuterCircuitNotFound)
        expect(error.context?.expected_size).toBe(0)
      }
    })
  })
})
