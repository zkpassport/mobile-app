import React, { useEffect, useRef } from "react"
import { View, Text, Image, StyleSheet, Animated } from "react-native"
import Checkmark from "@/assets/images/icons/Checkmark"
import { CloseButton, BackButton } from "@/components/ui/Buttons"
import { useTranslation } from "react-i18next"
import { InformationCircleIcon } from "@/assets/images/icons/InformationCircleIcon"
import { AlertTriangleIcon } from "lucide-react-native"

interface AccessRequestHeaderProps {
  websiteName: string
  websiteDomain: string
  websiteLogo?: string
  isTrustedDomain?: boolean
  isDevMode?: boolean
  onBack: () => void
  backButton?: boolean
  purpose?: string
}

export const AccessRequestHeader: React.FC<AccessRequestHeaderProps> = ({
  websiteName,
  websiteDomain,
  websiteLogo,
  isTrustedDomain = false,
  isDevMode = false,
  onBack,
  backButton = false,
  purpose,
}) => {
  const { t } = useTranslation()
  const opacity = useRef(new Animated.Value(0)).current
  const devModeOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isTrustedDomain ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [isTrustedDomain])

  useEffect(() => {
    Animated.timing(devModeOpacity, {
      toValue: isDevMode ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [isDevMode])
  return (
    <View style={styles.container}>
      {/* Back Button */}
      {backButton ? (
        <View style={styles.backButtonContainer}>
          <BackButton onPress={onBack} />
        </View>
      ) : (
        <CloseButton onPress={onBack} style={styles.closeButton} />
      )}

      {/* Website Info */}
      <View style={styles.websiteInfo}>
        {/* Logo */}
        {websiteLogo && (
          <View style={styles.logoContainer}>
            <Image source={{ uri: websiteLogo }} style={styles.logo} resizeMode="contain" />
          </View>
        )}

        {/* Website Name */}
        <Text style={styles.websiteName}>{websiteName}</Text>

        {/* Website Domain */}
        <View style={styles.websiteDomainContainer}>
          <Text style={styles.websiteDomain}>{websiteDomain}</Text>
        </View>

        {/* Trusted domain Badge */}
        <Animated.View style={[styles.trustedBadgeText, { opacity }]}>
          <Checkmark width={12} height={12} color="#F5D69B" />
          <Text style={styles.trustedText}>{t("AccessRequestHeader.trustedDomain")}</Text>
        </Animated.View>

        {isDevMode && (
          <Animated.View style={[styles.devModeBadgeText, { opacity: devModeOpacity }]}>
            <AlertTriangleIcon width={12} height={12} color="#E6657E" />
            <Text style={styles.devModeText}>{t("AccessRequestHeader.devMode")}</Text>
          </Animated.View>
        )}

        {/* Purpose */}
        {purpose && (
          <View style={styles.purposeContainer}>
            <View style={styles.purposeLabelContainer}>
              <InformationCircleIcon width={15} height={15} color="#C7CDEA" />
              <Text style={styles.purposeLabel}>{t("verificationPurpose")}</Text>
            </View>
            <Text style={styles.purposeValue}>{purpose}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  backButtonContainer: {
    paddingVertical: 16,
    marginLeft: -16,
    alignSelf: "flex-start",
  },
  closeButton: {
    paddingVertical: 16,
    marginRight: 4,
    alignSelf: "flex-end",
  },
  websiteInfo: {
    alignItems: "center",
  },
  logoContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  websiteName: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    // fontFamily: "Inter",
    marginBottom: 8,
  },
  websiteDomainContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(251, 251, 251, 0.10)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 8,
  },
  websiteDomain: {
    fontSize: 14,
    fontWeight: "400",
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 18,
  },
  devModeBadgeText: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  devModeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#E6657E",
  },
  trustedText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ffffff",
    // fontFamily: "Inter",
    lineHeight: 12,
  },
  trustedBadgeText: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  purposeContainer: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#202D6A",
    padding: 12,
    marginTop: 24,
    gap: 4,
  },
  purposeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C7CDEA",
  },
  purposeLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  purposeValue: {
    fontSize: 14,
    fontWeight: "400",
    color: "#E7E7E7",
    lineHeight: 24,
  },
})
