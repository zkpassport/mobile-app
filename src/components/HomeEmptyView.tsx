import React, { useState, useEffect } from "react"
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Alert,
  BackHandler,
} from "react-native"
import { useSettings } from "@/context/SettingsContext"
import { useTranslation } from "react-i18next"
import { useError } from "@/context/ErrorContext"
import { useStorage } from "@/context/StorageContext"
import { useHideTabBar } from "@/context/TabBarVisibilityContext"
import { QuestionCircleIcon } from "@/assets/images/icons/QuestionCircleIcon"
import { PrimaryButton } from "@/components/ui/Buttons"
import { PassportIcon } from "@/assets/images/icons/PassportIcon"
import WhyScanView from "./Info/WhyScanId"
import { AlertModal, DevModeModal, OnboardingModal } from "./Modals"
import { useRouter } from "expo-router"
import { LinearGrad } from "./ui/Text/LinearGradient"

const HomeEmptyView = ({ canLoadPassport = false }) => {
  const router = useRouter()
  const { t } = useTranslation()
  const storage = useStorage()
  const { loadPassports, saveMockPassports } = useSettings()
  const [showDevModeModal, setShowDevModeModal] = useState(false)
  const [showWhyScanView, setShowWhyScanView] = useState(false)
  const [isLoadingMockData, setIsLoadingMockData] = useState(false)
  const [showErrorConsentModal, setShowErrorConsentModal] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const { setErrorReportingConsent } = useError()

  // Hide tab bar when showing empty view
  useHideTabBar(true)

  // Handle back button/gesture for conditional views
  useEffect(() => {
    const onBackPress = () => {
      if (showWhyScanView) {
        setShowWhyScanView(false)
        return true
      }
      return false
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [showWhyScanView])

  // button for the onboarding modal
  const handleOnboardingModal = () => {
    setShowOnboardingModal(true)
  }

  const handleScanPassport = async () => {
    try {
      setShowOnboardingModal(false)
      const consent = await storage.getItem("errorReportingConsent")
      // If consent has never been set, show the modal
      if (consent === null) {
        setShowErrorConsentModal(true)
      } else {
        // If consent is already set, proceed directly to scanning
        router.push("/scan-passport")
      }
    } catch (error) {
      console.error("Error checking error reporting consent: " + error)
      // On error, proceed with scanning
      router.push("/scan-passport")
    }
  }

  const handleLoadPassport = async () => {
    await loadPassports()
  }

  // Function to handle long press and show dev mode modal
  const handleLongPress = () => {
    console.log("Long press detected - showing dev mode options")
    setShowDevModeModal(true)
  }

  // Function to load mock passport data
  const handleEnableDevMode = async () => {
    try {
      console.log("Loading mock passport data")
      setIsLoadingMockData(true)

      await saveMockPassports()

      // Close the dev mode modal
      setShowDevModeModal(false)

      // Show success message
      Alert.alert(t("devModeEnabled"), t("mockPassportsLoadedMessage"), [{ text: t("ok") }])
    } catch (error) {
      console.error("Error enabling dev mode: " + error)
    } finally {
      setIsLoadingMockData(false)
    }
  }

  // Function to show WhyScan view
  const handleShowWhyScan = () => {
    setShowWhyScanView(true)
  }

  return (
    <>
      {showWhyScanView ? (
        <WhyScanView onBack={() => setShowWhyScanView(false)} onScan={handleScanPassport} />
      ) : (
        <View style={styles.container}>
          <View style={styles.content}>
            <Image
              source={require("@/assets/images/zkpassport-app-home-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>{t("homeView.tagline")}</Text>

            {!canLoadPassport && (
              <TouchableOpacity style={styles.linkContainer} onPress={handleShowWhyScan}>
                <QuestionCircleIcon width={16} height={16} color="#F3D9A4" />
                <LinearGrad
                  text={t("homeView.whyScanLink")}
                  colors={["#F2DCB0", "#F6D38F"]}
                  textStyle={styles.linkText}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Invisible touchable area at the top of the screen for dev mode */}
          {!canLoadPassport && (
            <TouchableWithoutFeedback onLongPress={handleLongPress}>
              <View style={styles.hiddenDevModeArea} />
            </TouchableWithoutFeedback>
          )}

          <View style={styles.bottomSection}>
            <View style={styles.buttonWrapper}>
              <PrimaryButton
                text={canLoadPassport ? t("homeView.loadIDs") : t("homeView.scanButton")}
                icon={<PassportIcon width={24} height={24} />}
                primary
                onPress={canLoadPassport ? handleLoadPassport : handleOnboardingModal}
              />
            </View>
          </View>

          {/* Dev Mode Modal */}
          <DevModeModal
            visible={showDevModeModal}
            onClose={() => setShowDevModeModal(false)}
            onEnableDevMode={handleEnableDevMode}
            isLoading={isLoadingMockData}
          />
        </View>
      )}

      {/* Onboarding Modal */}
      <OnboardingModal visible={showOnboardingModal} onComplete={handleScanPassport} />

      <AlertModal
        visible={showErrorConsentModal}
        onClose={async () => {
          await setErrorReportingConsent(false)
          setShowErrorConsentModal(false)
          router.push("/scan-passport")
        }}
        onAccept={async () => {
          await setErrorReportingConsent(true)
          setShowErrorConsentModal(false)
          router.push("/scan-passport")
        }}
        icon={require("@/assets/images/zkpassport-logo.png")}
        iconSize={50}
        title={t("homeView.errorReportingConsent.title")}
        description={t("homeView.errorReportingConsent.description")}
        disclaimer={t("homeView.errorReportingConsent.disclaimer")}
        buttonText={t("homeView.errorReportingConsent.sendReports")}
        buttonText2={t("homeView.errorReportingConsent.notNow")}
        description2={true}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#142262",
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  content: {
    flex: 6,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  logo: {
    width: Dimensions.get("window").width * 0.6,
    height: 50,
    marginBottom: 24,
  },
  tagline: {
    fontSize: 18,
    color: "white",
    textAlign: "center",
    // fontFamily: "Inter",
    fontWeight: "600",
  },
  bottomSection: {
    justifyContent: "center",
    paddingBottom: 12,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 24,
  },
  linkText: {
    marginLeft: 8,
    fontSize: 14,
    color: "white",
    textAlign: "center",
    // fontFamily: "Inter",
    fontWeight: "500",
  },
  buttonWrapper: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hiddenDevModeArea: {
    position: "absolute",
    top: "60%",
    left: "15%",
    width: "65%",
    height: 150,
    zIndex: 1,
  },
})

export default HomeEmptyView
