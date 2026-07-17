import { useEvent } from "@/hooks/useEvent"

export const useTimerControls = (
  timerRef: React.MutableRefObject<{
    startSubOperation: (name: string) => void
    endSubOperation: (name: string) => void
    startNestedSubOperation: (parent: string | string[], name: string) => void
    endNestedSubOperation: (parent: string | string[], name: string) => void
    addMetadata: (metadata: Record<string, unknown>) => void
  } | null>,
) => {
  const startSub = useEvent((name: string) => timerRef.current?.startSubOperation(name))
  const endSub = useEvent((name: string) => timerRef.current?.endSubOperation(name))
  const startNested = useEvent((parent: string | string[], name: string) =>
    timerRef.current?.startNestedSubOperation(parent, name),
  )
  const endNested = useEvent((parent: string | string[], name: string) =>
    timerRef.current?.endNestedSubOperation(parent, name),
  )
  const addMetadata = useEvent((metadata: Record<string, unknown>) =>
    timerRef.current?.addMetadata(metadata),
  )

  return { startSub, endSub, startNested, endNested, addMetadata }
}
