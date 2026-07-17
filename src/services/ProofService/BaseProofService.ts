import { ProofResult } from "@zkpassport/utils"
import { ProofGenerationParams } from "@/types/ProofService"
import DSCProofService from "./DSCProofService"
import IDCheckProofService from "./IDCheckProofService"
import IntegrityProofService from "./IntegrityProofService"
import { MySettings } from "@/context/SettingsContext"
import { ZKPassportError } from "@/types/Error"

/**
 * Main ProofService that orchestrates all proof generation services
 */
class BaseProofService {
  private static instance: BaseProofService
  private dscProofService: DSCProofService
  private idCheckProofService: IDCheckProofService
  private integrityProofService: IntegrityProofService

  private constructor() {
    this.dscProofService = DSCProofService.getInstance()
    this.idCheckProofService = IDCheckProofService.getInstance()
    this.integrityProofService = IntegrityProofService.getInstance()
  }

  public static getInstance(): BaseProofService {
    if (!BaseProofService.instance) {
      BaseProofService.instance = new BaseProofService()
    }
    return BaseProofService.instance
  }

  /**
   * Generates all base subproofs (DSC, ID data, and integrity check)
   */
  public async generateBaseSubproofs(
    params: ProofGenerationParams & {
      onTimingOperation?: (proofType: string, isEnd?: boolean) => void
      onError?: (
        error: ZKPassportError,
        proofType: string,
      ) => Promise<{ handled: boolean; shouldReturn: boolean }>
    },
  ): Promise<ProofResult[]> {
    const { onTimingOperation, onError } = params
    const baseSubproofs: ProofResult[] = []

    // Define proof generation steps
    const proofSteps = [
      {
        name: "dsc_subproof",
        generateProof: () => this.dscProofService.generateDSCProof(params),
      },
      {
        name: "id_data_subproof",
        generateProof: () => this.idCheckProofService.generateIDDataProof(params),
      },
      {
        name: "integrity_check_subproof",
        generateProof: () => this.integrityProofService.generateIntegrityCheckProof(params),
      },
    ]

    // Generate proofs with timing and error handling
    for (const step of proofSteps) {
      if (onTimingOperation) {
        onTimingOperation(step.name)
      }

      try {
        const proof = await step.generateProof()
        baseSubproofs.push(proof)

        if (onTimingOperation) {
          onTimingOperation(step.name, true)
        }
      } catch (error) {
        // If a proof fails, stop the flow and throw the error
        if (onError) {
          await onError(error as ZKPassportError, step.name)
          // Intentionally do not call timing end here to mirror existing behavior when onError is provided
        } else {
          // If no error handler provided, ensure timing end is called for the failing step
          if (onTimingOperation) {
            onTimingOperation(step.name, true)
          }
        }
        throw error
      }
    }

    return baseSubproofs
  }

  /**
   * Static method to clear base subproofs
   */
  public static clearBaseSubproofs = async (
    updateSettings: (newSettings: any) => Promise<void>,
  ) => {
    await updateSettings({
      baseSubproofs: undefined,
      generatingBaseSubproofs: false,
      startedGeneratingBaseSubproofsAt: 0,
      cleanExitDuringProofGeneration: false,
      memoryTooLow: false,
      currentProofGenerationProgress: undefined,
    })
  }

  public static areBaseSubproofsCached = async (settings: MySettings) => {
    return (
      !!settings.activePassport &&
      !!settings.baseSubproofs &&
      !!settings.baseSubproofs[settings.activePassport] &&
      settings.baseSubproofs[settings.activePassport].length === 3
    )
  }
}

export default BaseProofService
export { BaseProofService }
