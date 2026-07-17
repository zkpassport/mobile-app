import DSCProofService from "@/services/ProofService/DSCProofService"
import { PASSPORTS } from "@/assets/mock-data/passport"
import {
  mockCircuitDSC,
  mockCircuitManifest,
  mockCSC,
  mockMerkleProof,
  mockParams,
} from "../mockData"
import {
  getCscaForPassportAsync,
  getDSCCircuitInputs,
  isCscaSupported,
  getCertificateLeafHash,
} from "@zkpassport/utils"
import * as nativeOperations from "@/lib/native-operations"
import * as zkpassportUtils from "@zkpassport/utils"
import { DSCErrors, ProofNames } from "@/types/ProofService"
import { getDSCCircuit } from "@/lib/circuit-matcher"
import * as noir from "@/lib/noir"
import {
  CircuitError,
  CircuitErrorSubType,
  MissingCscaError,
  MissingCscaErrorEnum,
} from "@/types/Error"

jest.mock("@zkpassport/registry")
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/noir")
jest.mock("@/lib/native-operations")
jest.mock("@/lib")
jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils") as Record<string, any>
  return {
    ...actual,
    getDSCCircuitInputs: jest.fn(),
    buildMerkleTreeFromCerts: jest.fn(),
    computeMerkleProof: jest.fn(),
    getCscaForPassportAsync: jest.fn(),
    isCscaSupported: jest.fn(),
    getCertificateLeafHash: jest.fn(),
  }
})

describe("DSCProofService", () => {
  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = DSCProofService.getInstance()
      const instance2 = DSCProofService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("verifyAndGetCSC", () => {
    let mockCerts: any

    beforeEach(() => {
      jest.clearAllMocks()
      mockCerts = require("../../fixtures/certs_0x03c239fd.json")
      const { RegistryClient } = require("@zkpassport/registry")
      RegistryClient.mockImplementation(() => {
        return {
          getCertificates: jest.fn().mockResolvedValue(mockCerts),
          getCircuitManifest: jest.fn().mockResolvedValue({
            circuits: {},
            version: "1.0.0",
          }),
        }
      })

      // Mock getCscaForPassport to return the ZKR certificate
      ;(getCscaForPassportAsync as jest.Mock).mockResolvedValue(mockCSC)

      // Mock isCscaSupported to return true
      ;(isCscaSupported as jest.Mock).mockReturnValue(true)
    })

    it("gets and verifies the CSC", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      const result = await service.verifyAndGetCSC(passport)

      expect(result).toBeDefined()
      expect(result.csc).toBe(mockCSC)
      expect(result.packagedCerts).toBe(mockCerts)
      expect(getCscaForPassportAsync).toHaveBeenCalledWith(
        passport.sod.certificate,
        mockCerts.certificates,
      )
      expect(isCscaSupported).toHaveBeenCalledWith(mockCSC)
    })

    it("throws an error if the CSC is not supported", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      ;(isCscaSupported as jest.Mock).mockReturnValue(false)
      await expect(service.verifyAndGetCSC(passport)).rejects.toThrow(DSCErrors.CSCNotSupported)
    })

    it("throws an error if the CSC is not found", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      ;(getCscaForPassportAsync as jest.Mock).mockResolvedValue(null)
      await expect(service.verifyAndGetCSC(passport)).rejects.toThrow(
        "CSCA not found for issuer: ZKR",
      )
    })
  })

  describe("getDSCCircuit", () => {
    // Not testing the success case, there needs to be a circuit matcher test fot this

    it("should throw when csc not found", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      const missingCscaError = new MissingCscaError(MissingCscaErrorEnum.NOT_FOUND, {
        dsc_certificate: passport.sod.certificate,
      })
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockRejectedValue(
        missingCscaError,
      )

      await expect(service.safeGetDSCCircuit(passport, mockCircuitManifest as any)).rejects.toThrow(
        MissingCscaError,
      )
      await expect(service.safeGetDSCCircuit(passport, mockCircuitManifest as any)).rejects.toThrow(
        MissingCscaErrorEnum.NOT_FOUND,
      )
    })
  })

  describe("prepareDSCCircuitInputs", () => {
    let mockCerts: any

    beforeEach(() => {
      jest.clearAllMocks()

      // Set up the RegistryClient mock for verifyAndGetCSC
      mockCerts = require("../../fixtures/certs_0x03c239fd.json")
      const { RegistryClient } = require("@zkpassport/registry")
      RegistryClient.mockImplementation(() => {
        return {
          getCertificates: jest.fn().mockResolvedValue(mockCerts),
        }
      })

      // Mock getCscaForPassport to return the ZKR certificate
      ;(getCscaForPassportAsync as jest.Mock).mockResolvedValue(mockCSC)

      // Mock isCscaSupported to return true
      ;(isCscaSupported as jest.Mock).mockReturnValue(true)
    })

    it("should throw when getDSCCircuitInputs fails", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      const salt = "0x1234567890abcdef"

      // Mock getCertificateLeafHash
      ;(getCertificateLeafHash as jest.Mock).mockResolvedValue(BigInt(123))

      // Mock computeMerkleProof from native-operations
      const { computeMerkleProof } = require("@/lib/native-operations")
      jest.mocked(computeMerkleProof).mockResolvedValue({ root: "mock", index: 0, path: [] })

      // Mock getDSCCircuitInputs to return undefined, happens when it fails silently
      ;(getDSCCircuitInputs as jest.Mock).mockReturnValue(undefined)

      await expect(service.prepareDSCCircuitInputs(passport, salt)).rejects.toThrow(
        DSCErrors.DSCCircuitInputsFailed,
      )
    })

    it("should throw when getDSCCircuitInputs fails with error message", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      const salt = "0x1234567890abcdef"

      // Mock getCertificateLeafHash
      ;(getCertificateLeafHash as jest.Mock).mockResolvedValue(BigInt(123))

      // Mock computeMerkleProof from native-operations
      const { computeMerkleProof } = require("@/lib/native-operations")
      jest.mocked(computeMerkleProof).mockResolvedValue({ root: "mock", index: 0, path: [] })

      // Mock getDSCCircuitInputs to return undefined, happens when it fails silently
      ;(getDSCCircuitInputs as jest.Mock).mockRejectedValue(
        new Error("Could not find CSCA for DSC"),
      )

      await expect(service.prepareDSCCircuitInputs(passport, salt)).rejects.toThrow(
        DSCErrors.NoCscForDsc,
      )
    })

    it("should prepare inputs successfully", async () => {
      const service = DSCProofService.getInstance()
      const passport = PASSPORTS.john
      const salt = "0x1234567890abcdef"

      ;(getCertificateLeafHash as jest.Mock).mockResolvedValue(BigInt(123))
      ;(nativeOperations.computeMerkleProof as jest.Mock).mockResolvedValue({
        root: "mock",
        index: 0,
        path: [],
      })
      const expectedInputs = { inputs: "prepared" }
      ;(getDSCCircuitInputs as jest.Mock).mockResolvedValue(expectedInputs as any)

      const result = await service.prepareDSCCircuitInputs(passport, salt)
      expect(result).toEqual(expectedInputs)
    })
  })

  describe("generateDSCProof", () => {
    beforeEach(() => {
      // Reset RAM check to default proceed: true before each test in this block
      ;(mockParams.checkRAM as jest.Mock).mockResolvedValue({ proceed: true })
    })
    it("should successfully generate DSC proof", async () => {
      const service = DSCProofService.getInstance()
      // Mock circuit matcher
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockResolvedValue(
        mockCircuitDSC,
      )

      jest.spyOn(zkpassportUtils, "getCscaForPassportAsync").mockResolvedValue(mockCSC)
      jest.spyOn(zkpassportUtils, "isCscaSupported").mockReturnValue(true)
      jest.spyOn(zkpassportUtils, "getCertificateLeafHash").mockResolvedValue(BigInt(123))
      jest.spyOn(zkpassportUtils, "getDSCCircuitInputs").mockResolvedValue({
        inputs: "mock-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id" as any,
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-proof",
      })
      ;(
        nativeOperations.computeMerkleProof as jest.MockedFunction<
          typeof nativeOperations.computeMerkleProof
        >
      ).mockResolvedValue(mockMerkleProof)

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      const result = await service.generateDSCProof(mockParams as any)

      expect(result).toEqual({
        proof: "mock-proof",
        vkeyHash: "mock-vkey-hash",
        version: "1.0.0",
        name: "dsc_circuit",
      })

      // Verify progress callbacks
      expect(mockParams.onProgress).toHaveBeenCalledWith("start", {
        circuitName: "dsc_circuit",
        circuitSize: 600,
        stage: "start",
        proofIndex: 1,
        totalProofs: 3,
      })
      expect(mockParams.onProgress).toHaveBeenCalledWith("complete", {
        circuitName: "dsc_circuit",
        circuitSize: 600,
        stage: "complete",
        proofIndex: 1,
        totalProofs: 3,
      })

      // Verify settings update
      expect(mockParams.updateSettings).toHaveBeenCalledWith({
        generatingBaseSubproofs: true,
        circuitBeingProven: "dsc_circuit",
      })
    })
    it("should throw error when memory too low", async () => {
      const service = DSCProofService.getInstance()
      // Mock circuit matcher
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockResolvedValue(
        mockCircuitDSC,
      )

      jest.spyOn(zkpassportUtils, "getCscaForPassportAsync").mockResolvedValue(mockCSC)
      jest.spyOn(zkpassportUtils, "isCscaSupported").mockReturnValue(true)
      jest.spyOn(zkpassportUtils, "getCertificateLeafHash").mockResolvedValue(BigInt(123))
      jest.spyOn(zkpassportUtils, "getDSCCircuitInputs").mockResolvedValue({
        inputs: "mock-inputs",
      } as any)

      // Mock circuit operations
      ;(noir.setupCircuit as jest.MockedFunction<typeof noir.setupCircuit>).mockResolvedValue(
        "circuit-id" as any,
      )
      ;(noir.generateProof as jest.MockedFunction<typeof noir.generateProof>).mockResolvedValue({
        proofWithPublicInputs: "mock-proof",
      })
      ;(
        nativeOperations.computeMerkleProof as jest.MockedFunction<
          typeof nativeOperations.computeMerkleProof
        >
      ).mockResolvedValue(mockMerkleProof)

      // Mock needsLowMemoryProver
      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)
      ;(mockParams.checkRAM as jest.MockedFunction<typeof mockParams.checkRAM>).mockResolvedValue({
        proceed: false,
      })

      await expect(service.generateDSCProof(mockParams as any)).rejects.toThrow("Memory too low")

      expect(mockParams.updateSettings).toHaveBeenCalledWith({
        memoryTooLow: true,
        generatingBaseSubproofs: false,
        startedGeneratingBaseSubproofsAt: 0,
        circuitBeingProven: "",
      })
    })

    it("should use low memory prover when forced", async () => {
      const service = DSCProofService.getInstance()
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockResolvedValue(
        mockCircuitDSC,
      )
      jest.spyOn(zkpassportUtils, "getCscaForPassportAsync").mockResolvedValue(mockCSC)
      jest.spyOn(zkpassportUtils, "isCscaSupported").mockReturnValue(true)
      jest.spyOn(zkpassportUtils, "getCertificateLeafHash").mockResolvedValue(BigInt(123))
      jest.spyOn(zkpassportUtils, "getDSCCircuitInputs").mockResolvedValue({ inputs: {} } as any)
      ;(nativeOperations.computeMerkleProof as jest.Mock).mockResolvedValue(mockMerkleProof)
      ;(noir.setupCircuit as jest.Mock).mockResolvedValue("circuit-id")
      ;(noir.generateProof as jest.Mock).mockResolvedValue({ proofWithPublicInputs: "mock-proof" })

      const lib = require("@/lib")
      ;(lib.needsLowMemoryProver as jest.Mock).mockReturnValue(false)

      await service.generateDSCProof({ ...mockParams, forceLowMemoryProver: true } as any)

      expect(noir.setupCircuit).toHaveBeenCalledWith(mockCircuitDSC, true)
    })

    it("wraps setup failures as CircuitError with CircuitSetupFailed", async () => {
      const service = DSCProofService.getInstance()
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockResolvedValue(
        mockCircuitDSC,
      )

      jest.spyOn(zkpassportUtils, "getCscaForPassportAsync").mockResolvedValue(mockCSC)
      jest.spyOn(zkpassportUtils, "isCscaSupported").mockReturnValue(true)
      jest.spyOn(zkpassportUtils, "getCertificateLeafHash").mockResolvedValue(BigInt(123))
      jest.spyOn(zkpassportUtils, "getDSCCircuitInputs").mockResolvedValue({ inputs: {} } as any)
      ;(nativeOperations.computeMerkleProof as jest.Mock).mockResolvedValue(mockMerkleProof)
      ;(noir.setupCircuit as jest.Mock).mockRejectedValue(new Error("setup fail"))

      await service.generateDSCProof(mockParams as any).catch((e: any) => {
        expect(e.message).toBe(DSCErrors.CircuitSetupFailed)
        expect(e.context?.circuit_name).toBe(ProofNames.DSC)
        expect(e.context?.error_details).toBeInstanceOf(Error)
        expect(e.context?.error_details.message).toBe("setup fail")
      })
    })

    it("returns proof generation errors", async () => {
      const service = DSCProofService.getInstance()
      ;(getDSCCircuit as jest.MockedFunction<typeof getDSCCircuit>).mockResolvedValue(
        mockCircuitDSC,
      )

      jest.spyOn(zkpassportUtils, "getCscaForPassportAsync").mockResolvedValue(mockCSC)
      jest.spyOn(zkpassportUtils, "isCscaSupported").mockReturnValue(true)
      jest.spyOn(zkpassportUtils, "getCertificateLeafHash").mockResolvedValue(BigInt(123))
      jest.spyOn(zkpassportUtils, "getDSCCircuitInputs").mockResolvedValue({ inputs: {} } as any)
      ;(nativeOperations.computeMerkleProof as jest.Mock).mockResolvedValue(mockMerkleProof)
      ;(noir.setupCircuit as jest.Mock).mockResolvedValue("circuit-id")
      ;(noir.generateProof as jest.Mock).mockRejectedValue(new Error("dsc mock failure"))

      await expect(service.generateDSCProof(mockParams as any)).rejects.toEqual(
        expect.objectContaining({
          name: "CircuitError",
          message: DSCErrors.ProofGenerationFailed,
          errorSubType: CircuitErrorSubType.ProofGenerationFailed,
        }),
      )

      await service.generateDSCProof(mockParams as any).catch((e: any) => {
        expect(e).toBeInstanceOf(CircuitError)
        expect(e.errorSubType).toBe(CircuitErrorSubType.ProofGenerationFailed)
        expect(e.message).toBe(DSCErrors.ProofGenerationFailed)
        expect(e.context?.circuit_name).toBe(ProofNames.DSC)
        expect(e.context?.error_details).toBeInstanceOf(Error)
        expect(e.context?.error_details.message).toBe("dsc mock failure")
      })
    })
  })
})
