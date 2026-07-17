import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  ScrollView,
  Linking,
} from "react-native"
import { ExternalLinkIcon } from "lucide-react-native"
import { AlertModal } from "@/components/Modals"
import { BackButton } from "@/components/ui/Buttons"
import { Colors } from "@/constants/Colors"
import { useError } from "@/context/ErrorContext"
import { useSettings } from "@/context/SettingsContext"
import { ToggleCard } from "@/components/ui/Cards"
import { FaceMatchService } from "@/services/facematch/facematch"
import { BridgeRequestStorage } from "@/services/BridgeRequest"
import { DiskStorageService } from "@/services/StorageService"
import { clearCachedCircuitManifest } from "@/lib/circuit-matcher"
import AppAttest from "../../../modules/app-attest-module"
import { useRouter } from "expo-router"
import { clearTempFiles, getVersion } from "@/lib"
import { ArchiveIcon } from "@/assets/images/icons/ArchiveIcon"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { DeveloperOptions } from "@/assets/images/icons/DeveloperOptions"
import { SecurityIcon } from "@/assets/images/icons/SecurityIcon"
import { WebsiteIcon } from "@/assets/images/icons/WebsiteIcon"
import { StatusModal } from "../Modals/StatusModal"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface SettingsPageProps {
  onBack: () => void
  onDeleteComplete?: () => void
  onDeleteCache?: () => void
  eventReportingEnabled?: boolean
  onEventReportingToggle?: (enabled: boolean) => void
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const { hasErrorReportingConsent, setErrorReportingConsent } = useError()
  const [showClearCacheModal, setShowClearCacheModal] = useState(false)
  const [showClearCacheSuccess, setShowClearCacheSuccess] = useState(false)
  const [showClearCacheError, setShowClearCacheError] = useState(false)
  const { clearBaseProofs, settings } = useSettings()
  const insets = useSafeAreaInsets()

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace("/")
      }
      return true
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
    return () => subscription.remove()
  }, [])

  const handleDeveloperOptionsPress = () => {
    router.push("/(options)/developer-options")
  }

  const handleClearCachePress = async () => {
    clearBaseProofs()
    // Also clear the circuit manifest from cache
    await clearCachedCircuitManifest()
    // Also clear the facematch cache
    try {
      // Clear the temp files (which might include some rest of the low memory prover mmap files)
      await clearTempFiles()
      // Also clear the facematch cach
      const storage = new DiskStorageService()
      const bridgeRequestStorage = new BridgeRequestStorage(storage)
      await bridgeRequestStorage.clear()
      const facematch = new FaceMatchService({ storage, appAttest: AppAttest })
      for (const passport of settings.passports) {
        await facematch.removeKeyId(passport.id)
      }
    } catch (error) {
      console.error("Error clearing facematch cache:", error)
    }
  }

  const handleSecurityPress = () => {
    router.push("/(options)/security")
  }

  const handleAboutZKPassportPress = () => {
    Linking.openURL("https://zkpassport.id")
  }

  const options = [
    {
      id: "security",
      icon: <SecurityIcon width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.security"),
      onPress: () => handleSecurityPress(),
    },
    {
      id: "clear-cache",
      icon: <ArchiveIcon width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.clearCache"),
      onPress: () => setShowClearCacheModal(true),
    },
    {
      id: "developer-options",
      icon: <DeveloperOptions width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.developerOptions"),
      onPress: handleDeveloperOptionsPress,
    },
    {
      id: "about-zkpassport",
      icon: <WebsiteIcon width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.aboutZKPassport"),
      onPress: handleAboutZKPassportPress,
      rightIcon: <ExternalLinkIcon width={20} height={20} color="#DBDFF3" />,
    },
  ]

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("settings.settings.back")} />
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{t("settings.settings.title")}</Text>
        </View>

        {/* Options List */}
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.optionItem}
            onPress={option.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.optionLeft}>
              <View style={styles.iconContainer}>{option.icon}</View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </View>
            {option.rightIcon && option.rightIcon}
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Error Reporting Toggle */}
        <View style={styles.eventReportingCard}>
          <ToggleCard
            title={t("settings.options.eventReporting")}
            description={t("settings.options.eventReportingDescription")}
            value={hasErrorReportingConsent || false}
            onChange={setErrorReportingConsent}
          />
        </View>

        <Text style={styles.versionText}>
          {t("settings.options.version")} {getVersion()}
        </Text>

        <AlertModal
          visible={showClearCacheModal}
          onClose={() => setShowClearCacheModal(false)}
          title={t("settings.options.clearCacheTitle")}
          description={t("settings.options.clearCacheDescription")}
          onAccept={() => {
            setShowClearCacheModal(false)
            handleClearCachePress()
              .then(() => {
                setShowClearCacheSuccess(true)
              })
              .catch(() => {
                setShowClearCacheError(true)
              })
          }}
          buttonText={t("settings.options.clearCacheButton")}
        />

        <StatusModal
          visible={showClearCacheSuccess}
          type="success"
          description={t("settings.options.clearCacheSuccessDescription")}
          onClose={() => {
            setShowClearCacheSuccess(false)
          }}
          initialCountdown={3}
        />

        <StatusModal
          visible={showClearCacheError}
          type="error"
          description={t("settings.options.clearCacheErrorDescription")}
          onClose={() => {
            setShowClearCacheError(false)
          }}
          initialCountdown={3}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    paddingVertical: OUTER_CONTAINER_TOP_PADDING,
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  titleContainer: {
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 36,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 24,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(59, 91, 152, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 32,
  },
  eventReportingCard: {},
  versionText: {
    fontSize: 12,
    fontWeight: "400",
    color: "#E7E7E7",
    textAlign: "center",
    marginTop: 24,
    marginBottom: 100,
  },
})

export default SettingsPage
