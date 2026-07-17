import { useCallback, useEffect, useRef } from "react"

// Stable callback that always calls the latest handler without changing identity
export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: any[]) => handlerRef.current(...args)) as T, [])
}
