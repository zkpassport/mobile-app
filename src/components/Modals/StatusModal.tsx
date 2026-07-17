import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { ModalWrapper } from "./ModalWrapper"
import { SuccessIcon } from "@/assets/images/icons/SuccessIcon"
import { ErrorIcon } from "@/assets/images/icons/ErrorIcon"

interface StatusModalProps {
  visible: boolean
  onClose: () => void
  type: "success" | "error"
  description: string
  initialCountdown: number
}

export const StatusModal: React.FC<StatusModalProps> = ({
  visible,
  onClose,
  type,
  description,
  initialCountdown = 5,
}) => {
  const [seconds, setSeconds] = useState(initialCountdown)

  useEffect(() => {
    if (!visible) {
      setSeconds(initialCountdown)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return

    if (seconds <= 0) {
      onClose()
      return
    }

    const interval = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(interval)
  }, [seconds, visible])

  return (
    <ModalWrapper
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalWrapper}>
          <View style={styles.modalContainer}>
            <View style={styles.iconContainer}>
              {type === "success" ? (
                <SuccessIcon width={16} height={16} />
              ) : (
                <ErrorIcon width={16} height={16} />
              )}
            </View>

            <Text style={styles.description}>{description}</Text>
          </View>
        </View>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalWrapper: {
    backgroundColor: "#1F2B65",
    marginHorizontal: 24,
    marginVertical: 32,
    borderRadius: 22,
  },
  modalContainer: {
    backgroundColor: "transparent",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 32,
  },
  swipeHandleArea: {
    paddingVertical: 12,
    alignItems: "center",
  },
  swipeIndicator: {
    width: 80,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
  },
  iconContainer: {
    alignSelf: "center",
    marginVertical: 24,
  },
  description: {
    fontSize: 24,
    color: "#FBFBFB",
    lineHeight: 32,
    textAlign: "center",
    marginBottom: 32,
    fontWeight: "600",
  },
  buttonWrapper: {
    marginVertical: 12,
  },
  buttonWrapper2: {
    marginVertical: 12,
  },
})
