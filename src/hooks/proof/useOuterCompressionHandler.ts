import { useCallback } from "react"
import { useEvent } from "@/hooks/useEvent"
import { Stage, StageEnum } from "@/types/ProofService"

export const useOuterCompressionHandler = ({
  animate,
  timers: { startSub, endSub, startNested, endNested },
}: {
  animate: (from: number, to: number, duration: number) => void
  timers: {
    startSub: (name: string) => void
    endSub: (name: string) => void
    startNested: (operation: string, sub: string) => void
    endNested: (operation: string, sub: string) => void
  }
}) => {
  const safeAnimate = useEvent(animate)

  return useCallback(
    (attemptedCircuits: string[]) => (stage: Stage, details: any) => {
      if (stage === StageEnum.CloudProverStart) {
        safeAnimate(80, 98, 60000)
        startSub(StageEnum.OuterCompression)
        startNested(StageEnum.OuterCompression, StageEnum.CloudProverRequest)
        if (details.circuitName && !attemptedCircuits.includes(details.circuitName)) {
          attemptedCircuits.push(details.circuitName)
        }
      } else if (stage === StageEnum.CloudProverComplete) {
        endNested(StageEnum.OuterCompression, StageEnum.CloudProverRequest)
        endSub(StageEnum.OuterCompression)
      }
    },
    [safeAnimate, startSub, endSub, startNested, endNested],
  )
}
