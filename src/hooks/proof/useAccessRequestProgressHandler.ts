import { useCallback } from "react"
import { useEvent } from "@/hooks/useEvent"
import { DisclosureFactory, OuterProofFactory, StageEnum } from "@/types/ProofService"
import { QRCodeData } from "@zkpassport/utils"

export const useAccessRequestProgressHandler = ({
  timers,
  animate,
  setLoadingText,
  disclosureHandlerFactory,
  outerHandlerFactory,
  credentialsRequest,
}: {
  timers: {
    startSub: (name: string) => void
    endSub: (name: string) => void
  }
  animate: (from: number, to: number, duration: number) => void
  setLoadingText: (text: string) => void
  disclosureHandlerFactory: DisclosureFactory
  outerHandlerFactory: OuterProofFactory
  credentialsRequest: QRCodeData
}) => {
  const safeAnimate = useEvent(animate)
  const safeSetLoadingText = useEvent(setLoadingText)

  return useCallback(
    (
      disclosureProofCountRef: { current: number },
      succeededCircuits: string[],
      failedCircuits: { name: string; error: string }[],
      attemptedCircuits: string[],
      disclosureProofsTimerStarted: { current: boolean },
      t: (key: string) => string,
    ) => {
      const disclosureHandler = disclosureHandlerFactory(
        disclosureProofCountRef,
        succeededCircuits,
        failedCircuits,
        credentialsRequest,
      )
      const outerHandler = outerHandlerFactory(attemptedCircuits, credentialsRequest)

      return (stage: string, details: any) => {
        if (
          stage === StageEnum.DisclosureProofStart ||
          stage === StageEnum.DisclosureProofComplete ||
          stage === StageEnum.DisclosureProofError
        ) {
          if (stage === StageEnum.DisclosureProofStart && !disclosureProofsTimerStarted.current) {
            timers.startSub(StageEnum.DisclosureProof)
            disclosureProofsTimerStarted.current = true
          }
          disclosureHandler(stage, details)
          return
        }

        if (stage === StageEnum.OuterCircuitInputsGeneration) {
          safeAnimate(60, 80, 20000)
          safeSetLoadingText(t("accessRequest.preparingOuterProof"))
          return
        }

        if (stage === StageEnum.CloudProverStart) {
          timers.startSub(StageEnum.OuterCompression)
          safeAnimate(80, 98, 60000)
          safeSetLoadingText(t("accessRequest.compressingProof"))
          outerHandler(stage, details)
          return
        }

        if (stage === StageEnum.CloudProverComplete) {
          outerHandler(stage, details)
          safeAnimate(98, 100, 2000)
          timers.endSub(StageEnum.OuterCompression)
          return
        }
      }
    },
    [timers, safeAnimate, safeSetLoadingText, disclosureHandlerFactory, outerHandlerFactory],
  )
}
