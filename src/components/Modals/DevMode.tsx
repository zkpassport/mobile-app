import React from "react"
import { View, Text, StyleSheet, TouchableWithoutFeedback, TouchableOpacity } from "react-native"
import { ModalWrapper } from "./ModalWrapper"
import { useTranslation } from "react-i18next"
import { PrimaryButton } from "@/components/ui/Buttons"
import { Close } from "@/assets/images/icons/Close"

interface DevModeModalProps {
  visible: boolean
  onClose: () => void
  onEnableDevMode: () => Promise<void>
  isLoading: boolean
}

export const DevModeModal: React.FC<DevModeModalProps> = ({
  visible,
  onClose,
  onEnableDevMode,
}) => {
  const { t } = useTranslation()

  return (
    <ModalWrapper
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {/* Close button */}
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Close />
              </TouchableOpacity>

              {/* Title and description */}
              <View style={styles.textContainer}>
                <Text style={styles.modalTitle}>{t("developerOptions")}</Text>
                <Text style={styles.modalSubtitle}>{t("devModeDescription")}</Text>
              </View>

              {/* Buttons */}
              <View style={styles.buttonWrapper}>
                <View style={styles.buttonWrapper1}>
                  <PrimaryButton text={t("enableDevMode")} onPress={onEnableDevMode} primary />
                </View>
                <PrimaryButton text={t("cancel")} onPress={onClose} primary={false} />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(3, 3, 3, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#142262",
    borderRadius: 8,
    padding: 40,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 24,
    width: 345,
    alignItems: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  textContainer: {
    width: "100%",
    alignItems: "center",
    gap: 16,
    marginBottom: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "center",
    // fontFamily: "Inter",
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: "#E7E7E7",
    textAlign: "center",
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  buttonWrapper: {
    width: "100%",
  },
  buttonWrapper1: {
    paddingBottom: 24,
  },
})
