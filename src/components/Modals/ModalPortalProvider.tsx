import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import {
  View,
  StyleSheet,
  BackHandler,
  Animated,
  Dimensions,
  Pressable,
  Platform,
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"

export interface OverlayConfig {
  /** Whether to show the overlay backdrop. Default: true */
  show?: boolean
  /** Background color of the overlay. Default: "rgba(0, 0, 0, 0.7)" */
  color?: string
  /** Whether tapping the overlay should close the modal. Default: true */
  closeOnPress?: boolean
}

interface ModalEntry {
  id: string
  content: React.ReactNode
  animationType: "none" | "slide" | "fade"
  onRequestClose?: () => void
  overlayConfig?: OverlayConfig
  isClosing?: boolean
}

interface ModalPortalContextType {
  registerModal: (
    id: string,
    content: React.ReactNode,
    animationType: "none" | "slide" | "fade",
    onRequestClose?: () => void,
    overlayConfig?: OverlayConfig,
  ) => void
  unregisterModal: (id: string) => void
  updateModal: (id: string, content: React.ReactNode) => void
}

const ModalPortalContext = createContext<ModalPortalContextType | null>(null)

export const useModalPortal = () => {
  const context = useContext(ModalPortalContext)
  if (!context) {
    throw new Error("useModalPortal must be used within a ModalPortalProvider")
  }
  return context
}

interface ModalPortalProviderProps {
  children: React.ReactNode
}

// Individual modal renderer with animations
const AnimatedModalEntry: React.FC<{
  entry: ModalEntry
  isTopModal: boolean
  onAnimationComplete: (id: string) => void
}> = ({ entry, isTopModal, onAnimationComplete }) => {
  // Separate animations for overlay and content
  const overlayFadeAnim = useRef(new Animated.Value(0)).current
  const contentFadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current
  const hasAnimatedIn = useRef(false)

  const overlayConfig = entry.overlayConfig ?? {}
  const showOverlay = overlayConfig.show !== false
  const overlayColor = overlayConfig.color ?? "rgba(0, 0, 0, 0.7)"
  const closeOnPress = overlayConfig.closeOnPress !== false

  // Entry animation
  React.useEffect(() => {
    if (hasAnimatedIn.current) return
    hasAnimatedIn.current = true

    // Overlay always fades in
    if (showOverlay) {
      Animated.timing(overlayFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start()
    }

    // Content animation based on type
    if (entry.animationType === "fade") {
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start()
    } else if (entry.animationType === "slide") {
      // For slide, fade in instantly and slide up
      contentFadeAnim.setValue(1)
      if (Platform.OS === "android") {
        // Android at it again...
        // Using spring seems to render the modal uninteractive for a few seconds
        // after the animation completes. So using timing instead.
        // iOS works fine with spring.
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start()
      } else {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start()
      }
    } else {
      // No animation
      contentFadeAnim.setValue(1)
      slideAnim.setValue(0)
    }
  }, [])

  // Exit animation when isClosing becomes true
  React.useEffect(() => {
    if (!entry.isClosing) return

    const animations: Animated.CompositeAnimation[] = []

    // Overlay fade out
    if (showOverlay) {
      animations.push(
        Animated.timing(overlayFadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      )
    }

    // Content animation based on type
    if (entry.animationType === "fade") {
      animations.push(
        Animated.timing(contentFadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      )
    } else if (entry.animationType === "slide") {
      animations.push(
        Animated.timing(slideAnim, {
          toValue: Dimensions.get("window").height,
          duration: 250,
          useNativeDriver: true,
        }),
      )
    }

    if (animations.length > 0) {
      Animated.parallel(animations).start(() => {
        onAnimationComplete(entry.id)
      })
    } else {
      // No animation, complete immediately
      onAnimationComplete(entry.id)
    }
  }, [entry.isClosing])

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      if (!isTopModal || entry.isClosing) return

      const onBackPress = () => {
        if (entry.onRequestClose) {
          entry.onRequestClose()
          return true
        }
        return false
      }

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
      return () => subscription.remove()
    }, [entry.onRequestClose, isTopModal, entry.isClosing]),
  )

  const contentAnimatedStyle =
    entry.animationType === "slide"
      ? {
          opacity: contentFadeAnim,
          transform: [{ translateY: slideAnim }],
        }
      : {
          opacity: contentFadeAnim,
        }

  const handleOverlayPress = () => {
    if (closeOnPress && entry.onRequestClose && !entry.isClosing) {
      entry.onRequestClose()
    }
  }

  return (
    <View style={styles.modalContainer} pointerEvents={entry.isClosing ? "none" : "box-none"}>
      {/* Overlay backdrop - fades in independently */}
      {showOverlay && (
        <Pressable onPress={handleOverlayPress} style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.overlay,
              {
                backgroundColor: overlayColor,
                opacity: overlayFadeAnim,
              },
            ]}
          />
        </Pressable>
      )}

      {/* Content - animates based on animationType */}
      <Animated.View
        style={[styles.contentContainer, contentAnimatedStyle]}
        pointerEvents="box-none"
      >
        {entry.content}
      </Animated.View>
    </View>
  )
}

export const ModalPortalProvider: React.FC<ModalPortalProviderProps> = ({ children }) => {
  const [modals, setModals] = useState<ModalEntry[]>([])

  const registerModal = useCallback(
    (
      id: string,
      content: React.ReactNode,
      animationType: "none" | "slide" | "fade",
      onRequestClose?: () => void,
      overlayConfig?: OverlayConfig,
    ) => {
      setModals((prev) => {
        // Check if modal already exists
        const existingIndex = prev.findIndex((m) => m.id === id)
        if (existingIndex >= 0) {
          // Don't update if the modal is closing
          if (prev[existingIndex].isClosing) {
            return prev
          }
          // Update existing modal
          const updated = [...prev]
          updated[existingIndex] = {
            id,
            content,
            animationType,
            onRequestClose,
            overlayConfig,
            isClosing: false,
          }
          return updated
        }
        // Add new modal
        return [
          ...prev,
          { id, content, animationType, onRequestClose, overlayConfig, isClosing: false },
        ]
      })
    },
    [],
  )

  // Mark modal as closing (triggers exit animation)
  const unregisterModal = useCallback((id: string) => {
    setModals((prev) => {
      const index = prev.findIndex((m) => m.id === id)
      if (index >= 0 && !prev[index].isClosing) {
        const updated = [...prev]
        updated[index] = { ...updated[index], isClosing: true }
        return updated
      }
      return prev
    })
  }, [])

  // Actually remove the modal after animation completes
  const removeModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const updateModal = useCallback((id: string, content: React.ReactNode) => {
    setModals((prev) => {
      const index = prev.findIndex((m) => m.id === id)
      if (index >= 0 && !prev[index].isClosing) {
        const updated = [...prev]
        updated[index] = { ...updated[index], content }
        return updated
      }
      return prev
    })
  }, [])

  return (
    <ModalPortalContext.Provider value={{ registerModal, unregisterModal, updateModal }}>
      <View style={styles.container}>
        {children}
        {/* Portal container for modals */}
        {modals.length > 0 && (
          <View style={styles.portalContainer} pointerEvents="box-none">
            {modals.map((entry, index) => (
              <AnimatedModalEntry
                key={entry.id}
                entry={entry}
                isTopModal={index === modals.length - 1}
                onAnimationComplete={removeModal}
              />
            ))}
          </View>
        )}
      </View>
    </ModalPortalContext.Provider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  portalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  contentContainer: {
    ...StyleSheet.absoluteFillObject,
  },
})

export default ModalPortalProvider
