import React, { useMemo } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native"
import { PrimaryButton } from "@/components/ui/Buttons"
import { ModalWrapper } from "./ModalWrapper"
import { DocumentType } from "@/types/DocumentInfo"
import { Trans, useTranslation } from "react-i18next"

const IMAGES = {
  passportIcao: require("@/assets/images/Passport/PassportICAO.png"),
  idCardIcao: require("@/assets/images/IDCard/IDCardICAO.png"),
} as const

type Content = {
  titleKey: string
  descriptionKey: string
  image: any
}

const CONTENT: Record<Exclude<DocumentType, DocumentType.OTHER>, Content> = {
  [DocumentType.PASSPORT]: {
    titleKey: "modals.checkPassport.title.passport",
    descriptionKey: "modals.checkPassport.description.passport",
    image: IMAGES.passportIcao,
  },
  [DocumentType.ID_CARD]: {
    titleKey: "modals.checkPassport.title.idCard",
    descriptionKey: "modals.checkPassport.description.idCard",
    image: IMAGES.idCardIcao,
  },
  [DocumentType.RESIDENCE_PERMIT]: {
    titleKey: "modals.checkPassport.title.residencePermit",
    descriptionKey: "modals.checkPassport.description.residencePermit",
    image: IMAGES.idCardIcao,
  },
}

interface CheckPassportModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: () => void
  onDecline: () => void
  idType: DocumentType
}

export const CheckPassportModal: React.FC<CheckPassportModalProps> = ({
  visible,
  onClose,
  onConfirm,
  onDecline,
  idType,
}) => {
  const { t } = useTranslation()
  const content = useMemo(
    () => CONTENT[idType as keyof typeof CONTENT] ?? CONTENT[DocumentType.PASSPORT],
    [idType],
  )

  return (
    <ModalWrapper visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.container} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.modalContainer}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>

          <View style={styles.contentWrapper}>
            <Text style={styles.title}>{t(content?.titleKey ?? "")}</Text>

            <Text style={styles.description}>
              <Trans
                i18nKey={content?.descriptionKey ?? ""}
                components={{
                  bold: <Text style={styles.bold} />,
                }}
              />
            </Text>

            <View style={styles.imageContainer}>
              <Image source={content.image} style={styles.passportImage} resizeMode="contain" />
            </View>

            <PrimaryButton
              text={t("modals.checkPassport.yesIHaveIt")}
              onPress={onConfirm}
              primary
            />

            <View style={styles.buttonWrapper2}>
              <PrimaryButton
                text={t("modals.checkPassport.noIDontHaveIt")}
                onPress={onDecline}
                primary={false}
                borderless={true}
              />
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  modalContainer: {
    backgroundColor: "#142262",
    borderRadius: 8,
    width: "95%",
    height: "75%",
    maxWidth: 400,
    position: "relative",
  },
  contentWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  closeButton: {
    position: "absolute",
    top: 2,
    right: 8,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FBFBFB",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 16,
    lineHeight: 32,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
    marginBottom: 32,
  },
  bold: {
    fontWeight: "700",
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  passportImage: {
    width: 200,
    height: 200,
  },
  buttonWrapper2: {
    paddingTop: 24,
  },
  closeText: {
    color: "#F2DCB0",
    fontSize: 28,
    fontWeight: "500",
    // fontFamily: "Inter",
    position: "absolute",
    left: 20,
    top: 0,
  },
})
