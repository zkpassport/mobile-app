import { useCallback } from "react"
import { useEvent } from "@/hooks/useEvent"
import { getEstimatedTimeToGenerateProof } from "@/lib"
import { DisclosureCircuitName, QRCodeData } from "@zkpassport/utils"
import { ProofModeEnum, Stage, StageEnum } from "@/types/ProofService"

const getDisclosureProgress = (baseShare: number, proofIndex: number, progressShare: number) => ({
  start: baseShare + (proofIndex - 1) * progressShare,
  done: baseShare + proofIndex * progressShare,
})

export const useDisclosureProgressHandler = ({
  getBaseShare,
  setLoadingText,
  getLoadingText,
  animate,
  notifyError,
  mode,
  timers: { startNested, endNested },
  credentialsRequest,
}: {
  getBaseShare: () => number
  setLoadingText: (text: string) => void
  getLoadingText: (circuitName: DisclosureCircuitName, credentialsRequest: QRCodeData) => string
  animate: (from: number, to: number, duration: number) => void
  notifyError: (msg: string) => void
  mode: ProofModeEnum
  timers: {
    startNested: (operation: string, sub: string) => void
    endNested: (operation: string, sub: string) => void
  }
  credentialsRequest: QRCodeData
}) => {
  const safeGetBaseShare = useEvent(getBaseShare)
  const safeGetLoadingText = useEvent(getLoadingText)
  const safeSetLoadingText = useEvent(setLoadingText)
  const safeAnimate = useEvent(animate)
  const safeNotifyError = useEvent(notifyError)

  return useCallback(
    (
      disclosureProofCountRef: { current: number },
      succeededCircuits: string[],
      failedCircuits: { name: string; error: string }[],
    ) => {
      return (stage: Stage, details: any) => {
        if (stage === StageEnum.DisclosureProofStart) {
          disclosureProofCountRef.current += 1
          const progressShare =
            mode === ProofModeEnum.Fast
              ? (95 - safeGetBaseShare()) / details.totalProofs
              : (55 - safeGetBaseShare()) / details.totalProofs
          const { start, done } = getDisclosureProgress(
            safeGetBaseShare(),
            details.proofIndex,
            progressShare,
          )

          startNested(StageEnum.DisclosureProof, details.circuitName)
          safeSetLoadingText(
            safeGetLoadingText(details.circuitLabel as DisclosureCircuitName, credentialsRequest),
          )
          safeAnimate(start, done, getEstimatedTimeToGenerateProof(details.circuitSize))
        } else if (stage === StageEnum.DisclosureProofComplete) {
          endNested(StageEnum.DisclosureProof, details.circuitName)
          succeededCircuits.push(details.circuitName)
        } else if (stage === StageEnum.DisclosureProofError) {
          failedCircuits.push({ name: details.circuitName, error: details.error })
          safeNotifyError(
            "Cannot generate proof for the " +
              details.circuitLabel +
              " circuit. The conditions for this request are not met. Please check the query results to see which conditions are not met.",
          )
        }
      }
    },
    [
      mode,
      startNested,
      endNested,
      safeGetBaseShare,
      safeGetLoadingText,
      safeAnimate,
      safeNotifyError,
    ],
  )
}
