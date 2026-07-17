import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import BaseProofService from "@/services/ProofService/BaseProofService"
import {
  MissingCscaError,
  ErrorType,
  UnsupportedPassportError,
  CircuitError,
  CircuitErrorSubType,
} from "@/types/Error"
import { DSCErrors, IDCheckErrors, ProofNames } from "@/types/ProofService"
import { createUnsupportedPassportError } from "@/lib/errorUtils"
import { PASSPORTS } from "@/assets/mock-data/passport"

// Keep module mocks but we will inject instance-level mocks directly
jest.mock("@/services/ProofService/DSCProofService")
jest.mock("@/services/ProofService/IDCheckProofService")
jest.mock("@/services/ProofService/IntegrityProofService")

describe("BaseProofService", () => {
  let service: BaseProofService
  let dscMock: jest.Mock
  let idMock: jest.Mock
  let integrityMock: jest.Mock

  const mockDSCProof = {
    proof: "dsc-proof",
    vkeyHash: "dsc-vkey",
    version: "1.0.0",
    name: "dsc_subproof",
  }
  const mockIDProof = {
    proof: "id-proof",
    vkeyHash: "id-vkey",
    version: "1.0.0",
    name: "id_data_subproof",
  }
  const mockIntegrityProof = {
    proof: "integrity-proof",
    vkeyHash: "integrity-vkey",
    version: "1.0.0",
    name: "integrity_check_subproof",
  }

  beforeEach(() => {
    jest.clearAllMocks()

    service = BaseProofService.getInstance()

    // Inject instance-level mocks so we fully control behavior
    dscMock = (jest.fn() as any).mockResolvedValue(mockDSCProof as any)
    idMock = (jest.fn() as any).mockResolvedValue(mockIDProof as any)
    integrityMock = (jest.fn() as any).mockResolvedValue(mockIntegrityProof as any)
    ;(service as any).dscProofService = { generateDSCProof: dscMock }
    ;(service as any).idCheckProofService = { generateIDDataProof: idMock }
    ;(service as any).integrityProofService = { generateIntegrityCheckProof: integrityMock }
  })

  describe("getInstance", () => {
    it("returns a singleton instance", () => {
      const a = BaseProofService.getInstance()
      const b = BaseProofService.getInstance()
      expect(a).toBe(b)
    })
  })

  describe("generateBaseSubproofs", () => {
    it("generates all base subproofs successfully with timing callbacks", async () => {
      const onTimingOperation = jest.fn()
      const params: any = { onTimingOperation }

      const result = await service.generateBaseSubproofs(params)

      expect(result).toEqual([mockDSCProof, mockIDProof, mockIntegrityProof])

      // Ensure each proof generator was called with the params
      expect(dscMock).toHaveBeenCalledWith(params)
      expect(idMock).toHaveBeenCalledWith(params)
      expect(integrityMock).toHaveBeenCalledWith(params)

      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof")
      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof", true)
      expect(onTimingOperation).toHaveBeenCalledWith("id_data_subproof")
      expect(onTimingOperation).toHaveBeenCalledWith("id_data_subproof", true)
      expect(onTimingOperation).toHaveBeenCalledWith("integrity_check_subproof")
      expect(onTimingOperation).toHaveBeenCalledWith("integrity_check_subproof", true)
    })

    it("stops and fails when dsc proof fails", async () => {
      // Make the first step fail
      ;(dscMock as any).mockRejectedValueOnce(new Error("boom"))

      const onTimingOperation = jest.fn()
      const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: false })
      const params: any = { onTimingOperation, onError }

      await expect(service.generateBaseSubproofs(params)).rejects.toThrow("boom")

      // Only the first step should have started, others should not be called
      expect(dscMock).toHaveBeenCalled()
      expect(idMock).not.toHaveBeenCalled()
      expect(integrityMock).not.toHaveBeenCalled()

      // Start called for the failing step
      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof")
      // End not called for the failing step when onError is provided
      expect(onTimingOperation).not.toHaveBeenCalledWith("dsc_subproof", true)

      // onError was invoked with the error and step name
      expect(onError).toHaveBeenCalled()
      const [[err, stepName]] = (onError as any).mock.calls
      expect((err as Error).message).toBe("boom")
      expect(stepName).toBe("dsc_subproof")
    })

    it("stops and fails when id proof fails", async () => {
      // First succeeds, second fails
      ;(idMock as any).mockRejectedValueOnce(
        new CircuitError(
          CircuitErrorSubType.ProofGenerationFailed,
          IDCheckErrors.ProofGenerationFailed,
          {
            circuit_name: ProofNames.ID,
            error_details: new Error("id proof generation failed"),
          },
        ),
      )

      const onTimingOperation = jest.fn()
      const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: true })
      const params: any = { onTimingOperation, onError }

      // await expect(service.generateBaseSubproofs(params)).rejects.toThrow("id proof generation failed")

      await service.generateBaseSubproofs(params).catch((e: any) => {
        expect(e).toBeInstanceOf(CircuitError)
        expect(e.errorSubType).toBe(CircuitErrorSubType.ProofGenerationFailed)
        expect(e.message).toBe(IDCheckErrors.ProofGenerationFailed)
        expect(e.context?.circuit_name).toBe(ProofNames.ID)
        expect(e.context?.error_details).toBeInstanceOf(Error)
        expect(e.context?.error_details.message).toBe("id proof generation failed")
      })

      // DSC succeeded (ended timing) and ID failed; integrity not called
      expect(dscMock).toHaveBeenCalledTimes(1)
      expect(idMock).toHaveBeenCalledTimes(1)
      // Third step should not run
      expect(integrityMock).not.toHaveBeenCalled()
      // End not called for the failing step
      expect(onTimingOperation).not.toHaveBeenCalledWith("id_data_subproof", true)
      // End called for the successful DSC step, proving it completed
      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof", true)
    })

    it("stops and fails when integrity proof fails", async () => {
      ;(integrityMock as any).mockRejectedValueOnce(new Error("integrity fail"))

      const onTimingOperation = jest.fn()
      const onError = (jest.fn() as any).mockResolvedValue({ handled: false, shouldReturn: false })
      const params: any = { onTimingOperation, onError }

      await expect(service.generateBaseSubproofs(params)).rejects.toThrow("integrity fail")

      // Both prior proofs succeeded (ended timing), integrity called and failed
      expect(dscMock).toHaveBeenCalledTimes(1)
      expect(idMock).toHaveBeenCalledTimes(1)
      expect(integrityMock).toHaveBeenCalledTimes(1)
      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof", true)
      expect(onTimingOperation).toHaveBeenCalledWith("id_data_subproof", true)
      // End was not called for the failing step when onError is provided
      expect(onTimingOperation).not.toHaveBeenCalledWith("integrity_check_subproof", true)
    })

    it("rethrows and ends timing when no onError is provided", async () => {
      ;(dscMock as any).mockRejectedValueOnce(new Error("oops"))

      const onTimingOperation = jest.fn()
      const params: any = { onTimingOperation }

      await expect(service.generateBaseSubproofs(params)).rejects.toThrow("oops")

      // When no onError, the catch path ends timing
      expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof", true)
    })

    describe("preserves error type", () => {
      it("stops and preserves CircuitError when DSC setup fails", async () => {
        const setupErr = new CircuitError(
          CircuitErrorSubType.ProofGenerationFailed,
          DSCErrors.CircuitSetupFailed,
          { circuit_name: ProofNames.DSC, error_details: new Error("setup fail") },
        )
        ;(dscMock as any).mockRejectedValueOnce(setupErr)

        const onTimingOperation = jest.fn()
        const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: false })
        const params: any = { onTimingOperation, onError }

        await service.generateBaseSubproofs(params).catch((e: any) => {
          expect(e).toBeInstanceOf(CircuitError)
          expect(e.errorSubType).toBe(CircuitErrorSubType.ProofGenerationFailed)
          expect(e.message).toBe(DSCErrors.CircuitSetupFailed)
          expect(e.context?.circuit_name).toBe(ProofNames.DSC)
          expect(e.context?.error_details).toBeInstanceOf(Error)
          expect(e.context?.error_details.message).toBe("setup fail")
        })

        expect(idMock).not.toHaveBeenCalled()
        expect(integrityMock).not.toHaveBeenCalled()
        expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof")
        expect(onTimingOperation).not.toHaveBeenCalledWith("dsc_subproof", true)
        expect(onError).toHaveBeenCalled()
        const [[errArg, stepName]] = (onError as any).mock.calls
        expect(stepName).toBe("dsc_subproof")
        expect(errArg).toBe(setupErr)
      })
      it("catches dsc proof generation error", async () => {
        const circuitErr = new CircuitError(
          CircuitErrorSubType.ProofGenerationFailed,
          DSCErrors.ProofGenerationFailed,
          { circuit_name: ProofNames.DSC, error_details: new Error("dsc mock failure") },
        )
        ;(dscMock as any).mockRejectedValueOnce(circuitErr)

        const onTimingOperation = jest.fn()
        const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: false })
        const params: any = { onTimingOperation, onError }

        // check the error content
        await service.generateBaseSubproofs(params).catch((e: any) => {
          expect(e).toBeInstanceOf(CircuitError)
          expect(e.errorSubType).toBe(CircuitErrorSubType.ProofGenerationFailed)
          expect(e.message).toBe(DSCErrors.ProofGenerationFailed)
          expect(e.context?.circuit_name).toBe(ProofNames.DSC)
          expect(e.context?.error_details.message).toBe("dsc mock failure")
        })

        expect(idMock).not.toHaveBeenCalled()
        expect(integrityMock).not.toHaveBeenCalled()
        expect(onTimingOperation).toHaveBeenCalledWith("dsc_subproof")
        expect(onTimingOperation).not.toHaveBeenCalledWith("dsc_subproof", true)
      })
      it("preserves MissingCscaError type and stops the flow", async () => {
        const missingError = new MissingCscaError("missing csca", {
          id_issuer: "IRL",
          id_nationality: "IRL",
        })
        ;(dscMock as any).mockRejectedValueOnce(missingError)

        const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: false })
        const params: any = { onError }

        await expect(service.generateBaseSubproofs(params)).rejects.toBe(missingError)

        // Subsequent proofs should not run
        expect(idMock).not.toHaveBeenCalled()
        expect(integrityMock).not.toHaveBeenCalled()

        // onError receives the original MissingCscaError instance
        expect(onError).toHaveBeenCalled()
        const [[errArg, stepName]] = (onError as any).mock.calls
        expect(stepName).toBe("dsc_subproof")
        expect(errArg).toBe(missingError)
        expect(errArg).toBeInstanceOf(MissingCscaError)
        expect((errArg as MissingCscaError).errorType).toBe(ErrorType.MISSING_CSCA)
      })

      it("rethrows the original MissingCscaError when not handled", async () => {
        const missingError = new MissingCscaError("missing csca", {
          id_issuer: "IRL",
          id_nationality: "IRL",
        })
        ;(dscMock as any).mockRejectedValueOnce(missingError)

        const onError = (jest.fn() as any).mockResolvedValue({
          handled: false,
          shouldReturn: false,
        })
        const params: any = { onError }

        await expect(service.generateBaseSubproofs(params)).rejects.toBe(missingError)
      })

      it("preserves UnsupportedPassportError type and stops the flow", async () => {
        const unsupportedError = createUnsupportedPassportError(PASSPORTS.john)
        ;(dscMock as any).mockRejectedValueOnce(unsupportedError)

        const onError = (jest.fn() as any).mockResolvedValue({ handled: true, shouldReturn: false })
        const params: any = { onError }

        await expect(service.generateBaseSubproofs(params)).rejects.toBe(unsupportedError)

        // Subsequent proofs should not run
        expect(idMock).not.toHaveBeenCalled()
        expect(integrityMock).not.toHaveBeenCalled()

        // onError receives the original UnsupportedPassportError instance
        expect(onError).toHaveBeenCalled()
        const [[errArg, stepName]] = (onError as any).mock.calls
        expect(stepName).toBe("dsc_subproof")
        expect(errArg).toBe(unsupportedError)
        expect(errArg).toBeInstanceOf(UnsupportedPassportError)
        expect((errArg as UnsupportedPassportError).errorType).toBe(ErrorType.UNSUPPORTED_PASSPORT)
      })
    })
  })

  describe("static utilities", () => {
    it("clearBaseSubproofs updates settings appropriately", async () => {
      const updateSettings = (jest.fn() as any).mockResolvedValue(undefined) as unknown as (
        newSettings: any,
      ) => Promise<void>

      await BaseProofService.clearBaseSubproofs(updateSettings)

      expect(updateSettings).toHaveBeenCalledWith({
        baseSubproofs: undefined,
        generatingBaseSubproofs: false,
        startedGeneratingBaseSubproofsAt: 0,
        cleanExitDuringProofGeneration: false,
        memoryTooLow: false,
        currentProofGenerationProgress: undefined,
      })
    })

    it("areBaseSubproofsCached returns true only when data is present and complete", async () => {
      const passportId = "0xabc"
      const settingsTrue: any = {
        activePassport: passportId,
        baseSubproofs: {
          [passportId]: [mockDSCProof, mockIDProof, mockIntegrityProof],
        },
      }

      const settingsMissingActive: any = {
        activePassport: undefined,
        baseSubproofs: {
          [passportId]: [mockDSCProof, mockIDProof, mockIntegrityProof],
        },
      }

      const settingsIncomplete: any = {
        activePassport: passportId,
        baseSubproofs: {
          [passportId]: [mockDSCProof, mockIDProof],
        },
      }

      await expect(BaseProofService.areBaseSubproofsCached(settingsTrue)).resolves.toBe(true)
      await expect(BaseProofService.areBaseSubproofsCached(settingsMissingActive)).resolves.toBe(
        false,
      )
      await expect(BaseProofService.areBaseSubproofsCached(settingsIncomplete)).resolves.toBe(false)
    })
  })
})
