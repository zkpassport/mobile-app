import React, { useEffect, useRef, useMemo } from "react"
import { View, StyleSheet, ModalProps } from "react-native"
import { useModalPortal, OverlayConfig } from "./ModalPortalProvider"

// Generate unique IDs for modals
let modalIdCounter = 0
const generateModalId = () => `modal-${++modalIdCounter}`

interface ModalWrapperProps extends Omit<ModalProps, "animationType"> {
  visible: boolean
  onRequestClose?: () => void
  children: React.ReactNode
  transparent?: boolean
  animationType?: "none" | "slide" | "fade"
  /**
   * Configure the overlay backdrop behavior
   * - show: Whether to show the overlay (default: true)
   * - color: Background color of the overlay (default: "rgba(0, 0, 0, 0.7)")
   * - closeOnPress: Whether tapping overlay closes the modal (default: true)
   */
  overlayConfig?: OverlayConfig
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  visible,
  onRequestClose,
  children,
  transparent = true,
  animationType = "none",
  overlayConfig,
}) => {
  const { registerModal, unregisterModal, updateModal } = useModalPortal()
  const modalId = useRef(generateModalId()).current
  const isRegistered = useRef(false)

  // Store callbacks in refs to avoid effect re-runs
  const onRequestCloseRef = useRef(onRequestClose)
  const overlayConfigRef = useRef(overlayConfig)

  // Keep refs updated
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    overlayConfigRef.current = overlayConfig
  }, [overlayConfig])

  // Wrap children in a container
  const wrappedContent = useMemo(
    () => (
      <View
        style={[styles.modalContent, !transparent && styles.opaqueBackground]}
        pointerEvents="box-none"
      >
        {children}
      </View>
    ),
    [children, transparent],
  )

  // Handle visibility changes
  useEffect(() => {
    if (visible && !isRegistered.current) {
      // Modal is becoming visible
      registerModal(
        modalId,
        wrappedContent,
        animationType,
        () => onRequestCloseRef.current?.(),
        overlayConfigRef.current,
      )
      isRegistered.current = true
    } else if (visible && isRegistered.current) {
      // Modal is already visible, update content
      updateModal(modalId, wrappedContent)
    } else if (!visible && isRegistered.current) {
      // Modal is becoming hidden
      unregisterModal(modalId)
      isRegistered.current = false
    }
  }, [visible, wrappedContent, animationType])

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (isRegistered.current) {
        unregisterModal(modalId)
        isRegistered.current = false
      }
    }
  }, [])

  // This component doesn't render anything directly - it uses the portal
  return null
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
  },
  opaqueBackground: {
    backgroundColor: "#07245C",
  },
})

export default ModalWrapper
