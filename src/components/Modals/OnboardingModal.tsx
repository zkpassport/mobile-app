import React, { useState, useEffect } from "react"
import { View, Text, StyleSheet, Image, BackHandler, Animated, Linking } from "react-native"
import { ModalWrapper } from "./ModalWrapper"
import { PrimaryButton } from "@/components/ui/Buttons"
import { ChevronRightIcon } from "lucide-react-native"
import Checkmark from "@/assets/images/icons/Checkmark"
import { PaginationButtons } from "../ui/Buttons/PaginationButtons"
import { PrivacyFeature } from "../ui/Text/PrivacyFeature"
import { ModalHandle } from "../ui/ModalHandle"
import { useModalSwipeDown } from "@/hooks/useModalSwipeDown"
import { t } from "i18next"
import { useTranslation } from "react-i18next"

type OnboardingPage = 0 | 1 | 2
const MAX_PAGE = 2

const ONBOARDING_IMAGES = {
  scan: require("@/assets/images/onboarding/ID.png"),
  privacy: require("@/assets/images/onboarding/Lock.png"),
  verified: require("@/assets/images/onboarding/18.png"),
} as const

type OnboardingContent = {
  title: string
  image: any
  items: {
    title: string
    description: string
  }[]
}

const ONBOARDING_CONTENT: Record<OnboardingPage, OnboardingContent> = {
  0: {
    title: t("onboardingModal.title.0"),
    image: ONBOARDING_IMAGES.scan,
    items: [
      {
        title: t("onboardingModal.items.0.title1"),
        description: t("onboardingModal.items.0.description1"),
      },
      {
        title: t("onboardingModal.items.0.title2"),
        description: t("onboardingModal.items.0.description2"),
      },
    ],
  },
  1: {
    title: t("onboardingModal.title.1"),
    image: ONBOARDING_IMAGES.privacy,
    items: [
      {
        title: t("onboardingModal.items.1.title1"),
        description: t("onboardingModal.items.1.description1"),
      },
      {
        title: t("onboardingModal.items.1.title2"),
        description: t("onboardingModal.items.1.description2"),
      },
    ],
  },
  2: {
    title: t("onboardingModal.title.2"),
    image: ONBOARDING_IMAGES.verified,
    items: [
      {
        title: t("onboardingModal.items.2.title1"),
        description: t("onboardingModal.items.2.description1"),
      },
      {
        title: t("onboardingModal.items.2.title2"),
        description: t("onboardingModal.items.2.description2"),
      },
    ],
  },
}

interface OnboardingModalProps {
  visible: boolean
  onComplete: () => void
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ visible, onComplete }) => {
  const { panResponder, translateY } = useModalSwipeDown(onComplete, 100, visible)

  const [page, setPage] = useState<OnboardingPage>(0)
  const { t } = useTranslation()

  const content = ONBOARDING_CONTENT[page]

  useEffect(() => {
    if (!visible) {
      setPage(0)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return

    const onBackPress = () => {
      if (page > 0) {
        setPage((p) => (p - 1) as OnboardingPage)
        return true
      }
      return false
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
    return () => subscription.remove()
  }, [visible, page])

  const handleNext = () => {
    console.log("handleNext")
    if (page < 2) {
      setPage((p) => (p + 1) as OnboardingPage)
    } else {
      onComplete()
    }
  }

  return (
    <ModalWrapper
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onComplete}
    >
      <View style={styles.container}>
        <Animated.View
          style={[styles.bottomSheet, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <ModalHandle />

          {/* Content */}
          <View style={styles.content}>
            {/* Image */}
            <View style={styles.imageContainer}>
              <Image source={content.image} style={styles.image} resizeMode="contain" />
            </View>

            {/* Title and Items */}
            <View style={styles.textContainer}>
              <Text style={styles.title}>{content.title}</Text>

              <View style={styles.itemsContainer}>
                {content.items.map((item, index) => (
                  <PrivacyFeature
                    key={index}
                    icon={<Checkmark width={18} height={18} color="#F6D38F" />}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* Bottom buttons */}
          <View style={styles.bottomSection}>
            <PaginationButtons page={page} />

            <View style={styles.buttonContainer}>
              <PrimaryButton
                text={
                  page === MAX_PAGE ? t("onboardingModal.startScan") : t("onboardingModal.next")
                }
                onPress={handleNext}
                primary
                iconPosition="right"
                icon={<ChevronRightIcon width={20} height={20} color="#000000" />}
              />
            </View>
          </View>

          <Text
            style={[styles.termsNotice, page !== MAX_PAGE && styles.termsNoticeHidden]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {t("onboardingModal.agreePrefix")}
            <Text
              style={styles.termsLink}
              onPress={
                page === MAX_PAGE ? () => Linking.openURL("https://zkpassport.id/terms") : undefined
              }
            >
              {t("onboardingModal.termsLink")}
            </Text>
            {t("onboardingModal.and")}
            <Text
              style={styles.termsLink}
              onPress={
                page === MAX_PAGE
                  ? () => Linking.openURL("https://zkpassport.id/privacy-policy")
                  : undefined
              }
            >
              {t("onboardingModal.privacyLink")}
            </Text>
          </Text>
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
  bottomSheet: {
    backgroundColor: "#142262",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  imageContainer: {
    width: "100%",
    height: 168,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  image: {
    width: 216,
    height: 168,
  },
  textContainer: {
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "left",
  },
  itemsContainer: {
    gap: 16,
  },
  bottomSection: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buttonContainer: {},
  termsNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(251, 251, 251, 0.6)",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  termsNoticeHidden: {
    opacity: 0,
  },
  termsLink: {
    color: "rgba(251, 251, 251, 0.85)",
    textDecorationLine: "underline",
  },
})
