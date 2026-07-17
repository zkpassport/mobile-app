import { useCallback } from "react"
import { PassportViewModel } from "@zkpassport/utils"
import { BaseProofGenerationHandlersParams, StageEnum } from "@/types/ProofService"

// Factory function that creates handlers without React hooks
export const createBaseProofGenerationHandlers = ({
  proofGenerationTimer,
  emitProofGenerationEvent,
  updateSettings,
  handleProofGenerationError,
  notifyError,
}: BaseProofGenerationHandlersParams) => {
  // Handler for proof progress events
  const baseProofProgressHandler = (stage: string, details: any) => {
    if (stage === StageEnum.Start || stage === StageEnum.Complete) {
      emitProofGenerationEvent(details)
    }
  }

  // Handler for timing operations
  const baseProofTimingHandler = (proofType: string, isEnd?: boolean) => {
    const timerName = `${proofType}_subproof`
    if (isEnd) {
      proofGenerationTimer.endSubOperation(timerName)
    } else {
      proofGenerationTimer.startSubOperation(timerName)
    }
  }

  // Handler for updating settings during proof generation
  const baseProofSettingsHandler = async (updates: any) => {
    await updateSettings(updates)
  }

  // Handler for proof generation errors
  const baseProofErrorHandler = async (
    error: any,
    proofType: string,
    passport: PassportViewModel,
  ) => {
    // End timing for the failed proof
    proofGenerationTimer.endSubOperation(`${proofType}_subproof`)

    // Use the existing error handling logic
    const { handled, shouldReturn } = handleProofGenerationError
      ? await handleProofGenerationError(error, proofType, passport)
      : { handled: false, shouldReturn: true }

    // Notify user if needed and error wasn't already handled
    if (!handled && notifyError) {
      notifyError(`Failed to generate ${proofType} proof: ${error.message}`)
    }

    return { handled, shouldReturn }
  }

  return {
    baseProofProgressHandler,
    baseProofTimingHandler,
    baseProofSettingsHandler,
    baseProofErrorHandler,
  }
}

// React hook version that uses the factory function
export const useBaseProofGenerationHandlers = ({
  proofGenerationTimer,
  emitProofGenerationEvent,
  updateSettings,
  handleProofGenerationError,
  notifyError,
}: BaseProofGenerationHandlersParams) => {
  // Handler for proof progress events
  const baseProofProgressHandler = useCallback(
    (stage: string, details: any) => {
      if (stage === StageEnum.Start || stage === StageEnum.Complete) {
        emitProofGenerationEvent(details)
      }
    },
    [emitProofGenerationEvent],
  )

  // Handler for timing operations
  const baseProofTimingHandler = useCallback(
    (proofType: string, isEnd?: boolean) => {
      const timerName = `${proofType}_subproof`
      if (isEnd) {
        proofGenerationTimer.endSubOperation(timerName)
      } else {
        proofGenerationTimer.startSubOperation(timerName)
      }
    },
    [proofGenerationTimer],
  )

  // Handler for updating settings during proof generation
  const baseProofSettingsHandler = useCallback(
    async (updates: any) => {
      await updateSettings(updates)
    },
    [updateSettings],
  )

  // Handler for proof generation errors
  const baseProofErrorHandler = useCallback(
    async (error: any, proofType: string, passport: PassportViewModel) => {
      // End timing for the failed proof
      proofGenerationTimer.endSubOperation(`${proofType}_subproof`)

      // Use the existing error handling logic
      const { handled, shouldReturn } = handleProofGenerationError
        ? await handleProofGenerationError(error, proofType, passport)
        : { handled: false, shouldReturn: true }

      // Notify user if needed and error wasn't already handled
      if (!handled && notifyError) {
        notifyError(`Failed to generate ${proofType} proof: ${error.message}`)
      }

      return { handled, shouldReturn }
    },
    [proofGenerationTimer, handleProofGenerationError, notifyError],
  )

  return {
    baseProofProgressHandler,
    baseProofTimingHandler,
    baseProofSettingsHandler,
    baseProofErrorHandler,
  }
}
