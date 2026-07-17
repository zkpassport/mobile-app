import { describe, it, expect, beforeEach, jest } from "@jest/globals"

import * as circuitMatcher from "@/lib/circuit-matcher"
import * as noir from "@/lib/noir"
import * as zkpassportUtils from "@zkpassport/utils"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import { mockCircuitIDCheck, mockCircuitManifest, mockParams } from "../mockData"
import { getIDDataCircuit } from "@/lib/circuit-matcher"
import { IDCheckProofService } from "@/services/ProofService"
import { IDCheckErrors, ProofNames } from "@/types/ProofService"

// Mock dependencies
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/noir")
jest.mock("@/lib")
jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils") as Record<string, any>
  return {
    ...actual,
    getIDDataCircuitInputs: jest.fn(),
  }
})

describe("IDCheckProofService", () => {
  let service: IDCheckProofService

  beforeEach(() => {
    jest.clearAllMocks()
    service = IDCheckProofService.getInstance()
  })

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = IDCheckProofService.getInstance()
      const instance2 = IDCheckProofService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("getIDDataCircuit", () => {
    it("should successfully get ID data circuit", async () => {
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      const result = await service.safeGetIDDataCircuit(
        mockParams.passport,
        mockCircuitManifest as any,
      )

      expect(result).toBe(mockCircuitIDCheck)
      expect(circuitMatcher.getIDDataCircuit).toHaveBeenCalledWith(
        mockParams.passport,
        mockCircuitManifest,
      )
    })

    it("should throw CircuitError when circuit not found", async () => {
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(null)

      await expect(
        service.safeGetIDDataCircuit(mockParams.passport, mockCircuitManifest as any),
      ).rejects.toThrow(CircuitError)

      try {
        await service.safeGetIDDataCircuit(mockParams.passport, mockCircuitManifest as any)
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitError)
        expect((error as CircuitError).errorSubType).toBe(CircuitErrorSubType.CircuitNotFound)
        expect((error as CircuitError).message).toBe(IDCheckErrors.IDDataCircuitNotFound)
      }
    })
  })

  describe("generateIDDataProof", () => {
    it("should successfully generate ID data proof", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-id-proof",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      const result = await service.generateIDDataProof(mockParams as any)

      expect(result).toEqual({
        proof: "mock-id-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "id_data_circuit",
      })

      // Verify circuit inputs were generated with correct parameters
      expect(zkpassportUtils.getIDDataCircuitInputs).toHaveBeenCalledWith(
        mockParams.passport,
        BigInt(mockParams.salt),
        BigInt(mockParams.salt),
      )

      // Verify progress callbacks
      expect(mockParams.onProgress).toHaveBeenCalledWith("start", {
        circuitName: "id_data_circuit",
        circuitSize: 600,
        stage: "start",
        proofIndex: 2,
        totalProofs: 3,
      })
      expect(mockParams.onProgress).toHaveBeenCalledWith("complete", {
        circuitName: "id_data_circuit",
        circuitSize: 600,
        stage: "complete",
        proofIndex: 2,
        totalProofs: 3,
      })

      // Verify settings update
      expect(mockParams.updateSettings).toHaveBeenCalledWith({
        generatingBaseSubproofs: true,
        circuitBeingProven: "id_data_circuit",
      })

      // Verify circuit setup and proof generation
      expect(noir.setupCircuit).toHaveBeenCalledWith(mockCircuitIDCheck, false)
      expect(noir.generateProof).toHaveBeenCalledWith(
        { inputs: "mock-id-inputs" },
        "circuit-id",
        "mock-vkey",
      )
    })

    it("should use low memory prover when circuit size requires it", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-id-proof",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(true)

      await service.generateIDDataProof(mockParams as any)

      expect(noir.setupCircuit).toHaveBeenCalledWith(mockCircuitIDCheck, true)
    })

    it("should force low memory prover when specified in params", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-id-proof",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      const paramsWithForceLowMemory = { ...mockParams, forceLowMemoryProver: true }

      await service.generateIDDataProof(paramsWithForceLowMemory as any)

      expect(noir.setupCircuit).toHaveBeenCalledWith(mockCircuitIDCheck, true)
    })

    it("should handle circuit not found error", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(null)

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-id-proof",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      await expect(service.generateIDDataProof(mockParams as any)).rejects.toThrow(CircuitError)
    })

    it("should handle proof generation failure", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockRejectedValue(
        new Error("Proof generation failed"),
      )

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      await service.generateIDDataProof(mockParams as any).catch((e: any) => {
        expect(e).toBeInstanceOf(CircuitError)
        expect(e.errorSubType).toBe(CircuitErrorSubType.ProofGenerationFailed)
        expect(e.message).toBe(IDCheckErrors.ProofGenerationFailed)
        expect(e.context?.circuit_name).toBe(ProofNames.ID)
        expect(e.context?.error_details).toBeInstanceOf(Error)
        expect(e.context?.error_details.message).toBe("Proof generation failed")
      })
    })

    it("should emit progress events even when onProgress is not provided", async () => {
      // Mock circuit matcher
      ;(getIDDataCircuit as jest.MockedFunction<typeof getIDDataCircuit>).mockResolvedValue(
        mockCircuitIDCheck,
      )

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIDDataCircuitInputs").mockResolvedValue({
        inputs: "mock-id-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id",
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-id-proof",
      })

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      const paramsWithoutProgress = { ...mockParams, onProgress: undefined }

      const result = await service.generateIDDataProof(paramsWithoutProgress as any)

      expect(result).toEqual({
        proof: "mock-id-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "id_data_circuit",
      })
    })
  })
})
