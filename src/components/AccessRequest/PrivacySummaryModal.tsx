import React from "react"
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native"
import { useModalSwipeDown } from "@/hooks/useModalSwipeDown"
import { ModalWrapper } from "../Modals/ModalWrapper"
import Checkmark from "@/assets/images/icons/Checkmark"
import { InformationCircleIcon } from "@/assets/images/icons/InformationCircleIcon"
import { AlertTriangle } from "@/assets/images/icons/AlertTriangle"
import { CloseButton } from "@/components/ui/Buttons"
import { LinearGrad } from "../ui/Text/LinearGradient"
import { useTranslation } from "react-i18next"
import { PrivacyFeature } from "../ui/Text/PrivacyFeature"
import { ModalHandle } from "../ui/ModalHandle"
import { t } from "i18next"

// TODO: Implement this
type PrivacyMode = 0 | 1 // 0 = Standard, 1 = Full

type PrivacyFeatureType = "check" | "warning" | "info"

type PrivacyFeatureConfig = {
  type: PrivacyFeatureType
  title: string
  description: string
}

type PrivacyModeContent = {
  modeTitle: string
  modeDescription: string
  features: PrivacyFeatureConfig[]
}

const PRIVACY_MODE_CONTENT: Record<PrivacyMode, PrivacyModeContent> = {
  0: {
    modeTitle: t("PrivacySummary.standard.title"),
    modeDescription: t("PrivacySummary.standard.description"),
    features: [
      {
        type: "check",
        title: t("PrivacySummary.standard.features.notVisibleToWebsite"),
        description: t("PrivacySummary.standard.features.descriptions.notVisibleToWebsite"),
      },
      {
        type: "check",
        title: t("PrivacySummary.standard.features.notLinkableAcrossWebsites"),
        description: t("PrivacySummary.standard.features.descriptions.notLinkableAcrossWebsites"),
      },
      {
        type: "warning",
        title: t("PrivacySummary.standard.features.couldBeRecreated"),
        description: t("PrivacySummary.standard.features.descriptions.couldBeRecreated"),
      },
      {
        type: "info",
        title: t("PrivacySummary.standard.features.lowerPrivacy"),
        description: t("PrivacySummary.standard.features.descriptions.lowerPrivacy"),
      },
    ],
  },
  1: {
    modeTitle: t("PrivacySummary.full.title"),
    modeDescription: t("PrivacySummary.full.description"),
    features: [
      {
        type: "check",
        title: t("PrivacySummary.full.features.notLinkableByAnyone"),
        description: t("PrivacySummary.full.features.descriptions.notLinkableByAnyone"),
      },
      {
        type: "check",
        title: t("PrivacySummary.full.features.notLinkableAcrossWebsites"),
        description: t("PrivacySummary.full.features.descriptions.notLinkableAcrossWebsites"),
      },
      {
        type: "check",
        title: t("PrivacySummary.full.features.cannotBeRecreated"),
        description: t("PrivacySummary.full.features.descriptions.cannotBeRecreated"),
      },
      {
        type: "check",
        title: t("PrivacySummary.full.features.yourIdentityRemainsFullyPrivate"),
        description: t("PrivacySummary.full.features.descriptions.yourIdentityRemainsFullyPrivate"),
      },
    ],
  },
}

interface PrivacySummaryModalProps {
  visible: boolean
  onClose: () => void
  mode?: PrivacyMode
}

export const PrivacySummaryModal: React.FC<PrivacySummaryModalProps> = ({
  visible,
  onClose,
  mode = 0,
}) => {
  const { panResponder, translateY } = useModalSwipeDown(onClose, 100, visible)
  const { t } = useTranslation()

  const content = PRIVACY_MODE_CONTENT[mode]

  const getFeatureIcon = (type: PrivacyFeatureType) => {
    switch (type) {
      case "check":
        return <Checkmark width={18} height={18} color="#F5D69B" />
      case "warning":
        return <AlertTriangle width={18} height={18} color="#F5B765" />
      case "info":
        return <InformationCircleIcon width={18} height={18} color="#FBFBFB" />
    }
  }

  return (
    <ModalWrapper visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers}>
            <ModalHandle />
          </View>

          {/* Close Button */}
          <CloseButton onPress={onClose} style={styles.closeButton} />

          <View style={styles.content}>
            {/* Title */}
            <LinearGrad
              text={t("PrivacySummary.title")}
              colors={["#F2DCB0", "#F6D38F"]}
              textStyle={styles.title}
              containerStyle={styles.titleWrapper}
            />

            {/* Mode Title and Description */}
            <View style={styles.modeSection}>
              <Text style={styles.modeTitle}>{content.modeTitle}</Text>
              <Text style={styles.modeDescription}>{content.modeDescription}</Text>
            </View>

            {/* Privacy Features */}
            <View style={styles.featuresContainer}>
              {content.features.map((feature, index) => (
                <PrivacyFeature
                  key={index}
                  icon={getFeatureIcon(feature.type)}
                  title={feature.title}
                  description={feature.description}
                />
              ))}
            </View>
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
    backgroundColor: "#142262",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 16,
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 32,
  },
  titleWrapper: {
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    textAlign: "center",
    color: "#FFFFFF",
  },
  modeSection: {
    gap: 12,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    color: "#FBFBFB",
  },
  modeDescription: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    color: "#E7E7E7",
  },
  featuresContainer: {
    gap: 16,
  },
})
