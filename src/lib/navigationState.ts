let accessRequestVisible = false
let currentDeepLinkTopic: string | null = null

const visibilityListeners = new Set<(visible: boolean) => void>()

export const setAccessRequestVisible = (visible: boolean) => {
  accessRequestVisible = visible
  visibilityListeners.forEach((listener) => {
    try {
      listener(visible)
    } catch (error) {
      console.warn("Error notifying access request visibility listener:", error)
    }
  })
}

export const isAccessRequestVisible = () => accessRequestVisible

export const subscribeAccessRequestVisibility = (listener: (visible: boolean) => void) => {
  visibilityListeners.add(listener)
  return () => {
    visibilityListeners.delete(listener)
  }
}

export const waitForAccessRequestHidden = async (timeoutMs = 2000) => {
  if (!accessRequestVisible) {
    return
  }

  await new Promise<void>((resolve) => {
    let unsubscribe = () => {}
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve()
    }, timeoutMs)

    unsubscribe = subscribeAccessRequestVisibility((visible) => {
      if (!visible) {
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      }
    })
  })
}

export const setCurrentDeepLinkTopic = (topic: string | null) => {
  currentDeepLinkTopic = topic
}

export const getCurrentDeepLinkTopic = () => currentDeepLinkTopic
