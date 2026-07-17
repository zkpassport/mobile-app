import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

type VisibilityController = {
  isHidden: boolean
  addHiddenRequest: (id: symbol) => void
  removeHiddenRequest: (id: symbol) => void
}

const TabBarVisibilityContext = createContext<VisibilityController | undefined>(undefined)

export const TabBarVisibilityProvider = ({ children }: { children: ReactNode }) => {
  const [hiddenRequests, setHiddenRequests] = useState<Set<symbol>>(new Set())

  const addHiddenRequest = useCallback((id: symbol) => {
    setHiddenRequests((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const removeHiddenRequest = useCallback((id: symbol) => {
    setHiddenRequests((prev) => {
      if (!prev.has(id)) {
        return prev
      }

      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const value = useMemo<VisibilityController>(
    () => ({
      isHidden: hiddenRequests.size > 0,
      addHiddenRequest,
      removeHiddenRequest,
    }),
    [addHiddenRequest, removeHiddenRequest, hiddenRequests.size],
  )

  return (
    <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>
  )
}

export const useTabBarVisibility = () => {
  const context = useContext(TabBarVisibilityContext)

  if (!context) {
    throw new Error("useTabBarVisibility must be used within a TabBarVisibilityProvider")
  }

  return context
}

export const useHideTabBar = (shouldHide: boolean) => {
  const { addHiddenRequest, removeHiddenRequest } = useTabBarVisibility()
  const requestId = useRef<symbol>(Symbol("hide-tab-bar"))

  if (!requestId.current) {
    requestId.current = Symbol("hide-tab-bar")
  }

  useEffect(() => {
    const id = requestId.current!
    if (shouldHide) {
      addHiddenRequest(id)
    } else {
      removeHiddenRequest(id)
    }
    return () => {
      removeHiddenRequest(id)
    }
  }, [shouldHide, addHiddenRequest, removeHiddenRequest])
}
