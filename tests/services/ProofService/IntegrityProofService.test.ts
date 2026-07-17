import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import * as noir from "@/lib/noir"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import { mockCircuitIntegrity, mockCircuitManifest, mockParams } from "../mockData"
import { getIntegrityCheckCircuit } from "@/lib/circuit-matcher"
import * as circuitMatcher from "@/lib/circuit-matcher"
import * as zkpassportUtils from "@zkpassport/utils"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { IntegrityProofService } from "@/services/ProofService"
import { IntegrityErrors } from "@/types/ProofService"
import { getIntegrityToDisclosureSalts } from "@/lib"

const nowTimestamp = Date.now() / 1000

// Mock dependencies
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/noir")
jest.mock("@/lib")
jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils") as Record<string, any>
  return {
    ...actual,
    getNumberOfPublicInputs: jest.fn(),
    getNowTimestamp: jest.fn(),
    getProofData: jest.fn(),
    getIntegrityCheckCircuitInputs: jest.fn(),
  }
})

describe("IntegrityProofService", () => {
  let service: IntegrityProofService

  beforeEach(() => {
    jest.clearAllMocks()
    service = IntegrityProofService.getInstance()
    ;(zkpassportUtils.getNowTimestamp as jest.Mock).mockReturnValue(nowTimestamp)
  })

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = IntegrityProofService.getInstance()
      const instance2 = IntegrityProofService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("getIntegrityCheckCircuit", () => {
    // Not testing the success case, there needs to be a circuit matcher test fot this
    it("should throw CircuitError when circuit not found", async () => {
      ;(
        getIntegrityCheckCircuit as jest.MockedFunction<typeof getIntegrityCheckCircuit>
      ).mockResolvedValue(null)

      await expect(
        service.safeGetIntegrityCheckCircuit(PASSPORTS.john, mockCircuitManifest as any),
      ).rejects.toThrow(CircuitError)

      try {
        await service.safeGetIntegrityCheckCircuit(PASSPORTS.john, mockCircuitManifest as any)
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitError)
        expect((error as CircuitError).errorSubType).toBe(CircuitErrorSubType.CircuitNotFound)
        expect((error as CircuitError).message).toBe(IntegrityErrors.IntegrityCircuitNotFound)
      }
    })
  })

  describe("generateIntegrityCheckProof", () => {
    beforeEach(() => {
      // Mock circuit matcher
      ;(
        circuitMatcher.getIntegrityCheckCircuit as jest.MockedFunction<
          typeof circuitMatcher.getIntegrityCheckCircuit
        >
      ).mockResolvedValue(mockCircuitIntegrity)

      // Mock circuit inputs
      jest.spyOn(zkpassportUtils, "getIntegrityCheckCircuitInputs").mockResolvedValue({
        inputs: "mock-integrity-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id" as any,
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-integrity-proof",
      } as any)

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)
    })

    it("should successfully generate integrity check proof", async () => {
      const result = await service.generateIntegrityCheckProof(mockParams as any)

      expect(result).toEqual({
        proof: "mock-integrity-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "data_check_integrity",
      })

      // Verify circuit inputs were generated with correct parameters
      expect(zkpassportUtils.getIntegrityCheckCircuitInputs).toHaveBeenCalledWith(
        PASSPORTS.john,
        BigInt(mockParams.salt),
        getIntegrityToDisclosureSalts(BigInt(mockParams.salt)),
      )

      // Verify progress callbacks
      expect(mockParams.onProgress).toHaveBeenCalledWith("start", {
        circuitName: "data_check_integrity",
        circuitSize: 600,
        stage: "start",
        proofIndex: 3,
        totalProofs: 3,
      })
      expect(mockParams.onProgress).toHaveBeenCalledWith("complete", {
        circuitName: "data_check_integrity",
        circuitSize: 600,
        stage: "complete",
        proofIndex: 3,
        totalProofs: 3,
      })

      // Verify settings update
      expect(mockParams.updateSettings).toHaveBeenCalledWith({
        generatingBaseSubproofs: true,
        circuitBeingProven: "data_check_integrity",
      })
    })
  })
})
