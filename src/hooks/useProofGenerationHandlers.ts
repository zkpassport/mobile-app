import { useCallback, useEffect, useRef } from "react"
import { useEvent } from "@/hooks/useEvent"
import {
  useTimerControls,
  useDisclosureProgressHandler,
  useOuterCompressionHandler,
  useAccessRequestProgressHandler,
} from "@/hooks/proof"
import { getEstimatedTimeToGenerateProof } from "@/lib"
import { ProofGenerationHandlersParams, StageEnum } from "@/types/ProofService"

export const useProofGenerationHandlers = ({
  accessRequestTimerRef,
  animateProgress,
  setLoadingText,
  getLoadingText,
  getBaseProofProgressShare,
  credentialsRequest,
  notifyError,
  setProgress,
  settings,
  t,
}: ProofGenerationHandlersParams) => {
  const startedBaseProofGenerationRef = useRef(false)
  // Stable identities for function props without dependency churn
  const safeAnimateProgress = useEvent(animateProgress)
  const safeGetBaseProofProgressShare = useEvent(getBaseProofProgressShare)
  const safeSetLoadingText = useEvent(setLoadingText)
  const safeSetProgress = useEvent(setProgress)
  const safeT = useEvent(t)
  // Timer helpers
  const timers = useTimerControls(accessRequestTimerRef)
  // Disclosure proof progress handler
  const disclosureProofProgressHandler = useDisclosureProgressHandler({
    getBaseShare: safeGetBaseProofProgressShare,
    setLoadingText,
    getLoadingText,
    animate: safeAnimateProgress,
    notifyError,
    mode: credentialsRequest?.mode,
    timers,
    credentialsRequest,
  })

  // Helper function to create nested operation handler for timing
  const integrityProofNestedOperationHandler = useCallback(() => {
    return (operation: string, subOperation: string, isEnd?: boolean) => {
      if (accessRequestTimerRef.current) {
        if (isEnd) {
          accessRequestTimerRef.current.endNestedSubOperation(operation, subOperation)
          if (subOperation === StageEnum.IntegrityCheckRegeneration) {
            accessRequestTimerRef.current.addMetadata({
              identity_proof_regenerated: true,
            })
          }
        } else {
          accessRequestTimerRef.current.startNestedSubOperation(operation, subOperation)
        }
      }
    }
  }, [accessRequestTimerRef])

  // Helper function to create outer proof progress handler
  // Outer compression progress handler
  const outerProofProgressHandler = useOuterCompressionHandler({
    animate: animateProgress,
    timers,
  })

  // Comprehensive access request progress handler that manages all progress events
  const accessRequestProgressHandler = useAccessRequestProgressHandler({
    timers,
    animate: animateProgress,
    setLoadingText,
    disclosureHandlerFactory: disclosureProofProgressHandler,
    outerHandlerFactory: outerProofProgressHandler,
    credentialsRequest,
  })

  // Set up proof generation event listener
  useEffect(() => {
    // Check if base subproofs are already being generated when component mounts
    if (settings.generatingBaseSubproofs && settings.currentProofGenerationProgress) {
      const currentEvent = settings.currentProofGenerationProgress
      console.log("Syncing with ongoing base subproof generation:", currentEvent)

      startedBaseProofGenerationRef.current = true

      // Calculate current progress based on the ongoing event
      const progressShare = (safeGetBaseProofProgressShare() - 5) / currentEvent.totalProofs
      if (currentEvent.stage === StageEnum.Start) {
        const startProgress = (currentEvent.proofIndex - 1) * progressShare + 5
        const completedProgress = currentEvent.proofIndex * progressShare + 5
        safeAnimateProgress(
          startProgress,
          completedProgress,
          getEstimatedTimeToGenerateProof(currentEvent.circuitSize ?? 0),
        )
      } else if (currentEvent.stage === StageEnum.Complete) {
        const completedProgress = currentEvent.proofIndex * progressShare + 5
        safeSetProgress(completedProgress)
      }

      // Set appropriate loading text
      if (currentEvent.proofIndex === 1 || currentEvent.proofIndex === 2) {
        safeSetLoadingText(
          safeT("accessRequest.verifyingSignature", { index: currentEvent.proofIndex }),
        )
      } else if (currentEvent.proofIndex === 3) {
        safeSetLoadingText(safeT("accessRequest.verifyingIntegrity"))
      }
    }
  }, [
    settings.generatingBaseSubproofs,
    settings.currentProofGenerationProgress,
    safeAnimateProgress,
    safeGetBaseProofProgressShare,
    safeSetLoadingText,
    safeSetProgress,
    safeT,
  ])

  return {
    disclosureProofProgressHandler,
    integrityProofNestedOperationHandler,
    outerProofProgressHandler,
    accessRequestProgressHandler,
    startedBaseProofGenerationRef,
  }
}
