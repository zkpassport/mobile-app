import React, { useState } from "react"
import { View, Text, StyleSheet, Animated } from "react-native"
import { PrimaryButton } from "@/components/ui/Buttons"
import { ModalWrapper } from "./ModalWrapper"
import { PassportViewModel } from "@zkpassport/utils"
import { useModalSwipeDown } from "@/hooks/useModalSwipeDown"
import { useSettings } from "@/context/SettingsContext"
import { useTranslation } from "react-i18next"

interface DeleteIDModalProps {
  visible: boolean
  onClose: () => void
  onDeleted?: () => void
  onError?: () => void
  passport: PassportViewModel
  passportId: string
}

export const DeleteIDModal: React.FC<DeleteIDModalProps> = ({
  visible,
  onClose,
  onDeleted,
  onError,
  passportId,
}) => {
  const { t } = useTranslation()
  const { panResponder, translateY } = useModalSwipeDown(onClose, 100, visible)
  const [isLoading, setIsLoading] = useState(false)
  const { deletePassport } = useSettings()

  const handleDelete = async () => {
    setIsLoading(true)
    setTimeout(async () => {
      try {
        if (!passportId) {
          console.error("Could not find passport ID")
          throw new Error("Could not find passport ID")
        }
        await deletePassport(passportId)
        onDeleted?.()
        onClose()
        setTimeout(() => {
          setIsLoading(false)
        }, 1000)
      } catch (error) {
        console.log("Error deleting passport: " + error)
        onError?.()
        onClose()
      }
    }, 1000)
  }

  return (
    <ModalWrapper
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY }] }]}>
          {/* Swipe indicator */}
          <View style={styles.swipeHandleArea} {...panResponder.panHandlers}>
            <View style={styles.swipeIndicator} />
          </View>

          {/* ID Card Preview */}
          {/* <View style={styles.idCardPreviewContainer}>
              <IDCardPreview passport={passport} />
            </View> */}

          {/* Title */}
          <Text style={styles.title}>{t("modals.deleteID.title")}</Text>

          {/* Description */}
          <Text style={styles.description}>{t("modals.deleteID.description")}</Text>

          {/* Delete Button */}
          <View style={styles.buttonWrapper}>
            <PrimaryButton
              text={t("modals.deleteID.deleteButton")}
              onPress={handleDelete}
              primary
              loading={isLoading}
            />
          </View>
        </Animated.View>
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
  modalContainer: {
    backgroundColor: "#1F2B65",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingBottom: 48,
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
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
    marginTop: 32,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#D1D5DB",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 32,
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  buttonWrapper: {
    marginVertical: 12,
  },
  buttonWrapper2: {
    marginVertical: 12,
  },
  idCardPreviewContainer: {
    paddingVertical: 32,
  },
})
