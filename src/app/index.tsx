import React, { useState, useEffect, useRef, useMemo } from "react"
import { View, StyleSheet, Animated, Dimensions, Platform, BackHandler } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { useTranslation } from "react-i18next"

import HomeEmptyView from "@/components/HomeEmptyView"
import UpdateModalView from "@/components/UpdateModalView"
import { useFonts } from "expo-font"
import { SplashScreen } from "expo-router"
import type { QRCodeData, PassportViewModel } from "@zkpassport/utils"
import { useSettings } from "@/context/SettingsContext"
import { useParseDeepLinkParams } from "@/hooks/useParseDeepLinkParams"
import LoadingView from "@/components/LoadingView"
import { prepareSrs } from "@/lib/noir"
import { getCurrentDeepLinkTopic, setCurrentDeepLinkTopic } from "@/lib/navigationState"
import { checkVersions, SDKVersionCheckResult, VersionCheck } from "@/lib"
import { reportActivity } from "@/services/ActivityReportingService"
import { ErrorType } from "@/types/Error"
import IDPage from "@/components/PassportView/IDPage"
import { AlertModal } from "@/components/Modals"
import { Colors } from "@/constants/Colors"
import { useQRScanner } from "@/context/QRScannerContext"

const HomeView = () => {
  const { t } = useTranslation()
  const { scanPassport: scanPassportParam, sdkVersionCheckResult: sdkVersionCheckResultStr } =
    useLocalSearchParams<{
      scanPassport?: string | string[]
      sdkVersionCheckResult?: string
    }>()
  const sdkVersionCheckResult = sdkVersionCheckResultStr
    ? (JSON.parse(sdkVersionCheckResultStr) as SDKVersionCheckResult)
    : undefined
  const {
    isShowingScanner,
    closeScanner,
    handleScannedCode,
    isCodeScanHandled,
    setCodeScanHandled,
  } = useQRScanner()
  const [showUpdateAppModal, setShowUpdateAppModal] = useState(false)
  const [showIncompatibleSdkModal, setShowIncompatibleSdkModal] = useState(false)
  const [requiredVersion, setRequiredVersion] = useState("")
  const contentOpacity = useRef(new Animated.Value(0)).current
  const [loaded] = useFonts({
    Metropolis: require("@/assets/fonts/Metropolis-Medium.otf"),
    MetropolisBold: require("@/assets/fonts/Metropolis-Bold.otf"),
    MetropolisSemiBold: require("@/assets/fonts/Metropolis-SemiBold.otf"),
  })
  const { currentPassport, settings, failedToLoadPassport, passports, passportsLoaded } =
    useSettings()
  const [showLoader, setShowLoader] = useState(false)
  const deepLinkParams = useParseDeepLinkParams()
  const insets = useSafeAreaInsets()

  // Convert passports object to array for the IDPage component
  const allPassports = useMemo(() => {
    if (!settings.passports || settings.passports.length === 0) return []
    return settings.passports
      .map((p) => passports[p.id])
      .filter((p): p is PassportViewModel => p !== null && p !== undefined)
  }, [passports, settings.passports])
  const hasAnyPassports = allPassports.length > 0
  const shouldShowIdPage = !failedToLoadPassport && (hasAnyPassports || settings.hasAddedIdBefore)

  // Track which URLs we've already handled for SDK version errors
  const [versionCheckedParams, setVersionCheckedParams] = useState<QRCodeData | null>(null)

  // Add loading state fade animations
  const loaderOpacity = useRef(new Animated.Value(1)).current

  // When the scanner is focused, the back gesture will close the scanner.
  useEffect(() => {
    const onBackPress = () => {
      if (isShowingScanner) {
        closeScanner()
        return true
      }
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!sdkVersionCheckResult) {
      return
    }
    setShowIncompatibleSdkModal(true)

    router.setParams({
      sdkVersionCheckResult: undefined,
    })
  }, [sdkVersionCheckResult])

  // Handle deep link checking here instead of deep link params hook
  // Will run whenever the deep link params change
  useEffect(() => {
    if (!deepLinkParams) {
      setVersionCheckedParams(null)
      return
    }

    setCodeScanHandled(false)

    const checkVersionsAsync = async () => {
      // Check both app and SDK version
      const check: VersionCheck = {
        appVersion: true,
        sdkVersion: !!deepLinkParams.sdkVersion,
      }

      const { appVersion, sdkVersion } = await checkVersions(
        check,
        settings.passports?.length ?? 0,
        deepLinkParams.sdkVersion ?? undefined,
      )

      // Handle app version update requirement
      if (appVersion?.needToUpdate) {
        setRequiredVersion(appVersion.requiredVersion)
        setShowUpdateAppModal(true)
        return
      }

      // Handle SDK version incompatibility
      if (sdkVersion && !sdkVersion.sdkVersionSupported) {
        if (deepLinkParams.pubkey && deepLinkParams.domain) {
          reportActivity({
            requestId: deepLinkParams.pubkey,
            domain: deepLinkParams.domain,
            scope: deepLinkParams.service?.scope,
            devMode: deepLinkParams.devMode ?? false,
            status: "failed",
            errorCode: ErrorType.SDK_VERSION_NOT_SUPPORTED,
          })
        }
        // Show the SDK incompatibility modal
        setShowIncompatibleSdkModal(true)
        router.setParams({
          sdkVersionCheckResult: JSON.stringify(sdkVersion),
        })
        return
      }

      // Version checks passed, params are valid
      setVersionCheckedParams(deepLinkParams)
    }

    checkVersionsAsync()
  }, [deepLinkParams])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()

      if (!versionCheckedParams) {
        return
      }

      if (
        passportsLoaded &&
        versionCheckedParams.topic &&
        versionCheckedParams.query &&
        versionCheckedParams.pubkey &&
        versionCheckedParams.domain &&
        versionCheckedParams.service &&
        getCurrentDeepLinkTopic() !== versionCheckedParams.topic &&
        !isCodeScanHandled()
      ) {
        setCodeScanHandled(true)
        setCurrentDeepLinkTopic(versionCheckedParams.topic)
        setTimeout(() => {
          handleScannedCode(versionCheckedParams as QRCodeData, "deeplink")
        }, 300)
      }
    }
  }, [loaded, versionCheckedParams, currentPassport, passportsLoaded])

  // Smooth transition from loader to content
  useEffect(() => {
    if (currentPassport && showLoader) {
      Animated.timing(loaderOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setShowLoader(false)
      })
    }
  }, [currentPassport, showLoader])

  useEffect(() => {
    if (!showLoader) {
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start()
    }
  }, [showLoader])

  useEffect(() => {
    if (settings && settings.passports && settings.passports.length > 0) {
      if (!currentPassport) {
        console.log("loading passport")
        setShowLoader(true)
      }
    } else {
      setShowLoader(false)
    }
  }, [currentPassport, settings])

  useEffect(() => {
    // Handle other initialization logic
    prepareSrs()
    const check: VersionCheck = {
      appVersion: true,
      sdkVersion: false,
    }

    checkVersions(
      check, // check: VersionCheck
      settings.passports?.length ?? 0, // scannedIdCount: number
      null, // sdkVersion: null (not available on mount)
      true, // onMount: true
    ).then(({ appVersion }) => {
      if (appVersion?.needToUpdate) {
        setRequiredVersion(appVersion.requiredVersion)
        setShowUpdateAppModal(true)
      }
    })
  }, [])

  // If useEffect to handle param changes - navigate to scan route
  useEffect(() => {
    if (scanPassportParam === "true") {
      router.push("/scan-passport")
    }
  }, [scanPassportParam])

  const handleAddID = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    router.push("/scan-passport")
  }

  useEffect(() => {
    if (failedToLoadPassport) {
      setShowLoader(false)
    }
  }, [failedToLoadPassport])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {showLoader && !failedToLoadPassport && (
        <Animated.View style={{ flex: 1, opacity: loaderOpacity }}>
          <LoadingView
            loaded={!!currentPassport}
            onHide={() => {
              setShowLoader(false)
            }}
          />
        </Animated.View>
      )}
      {!showLoader && (
        <Animated.View style={[styles.mainContainer, { opacity: contentOpacity }]}>
          {shouldShowIdPage ? (
            <IDPage
              ids={allPassports}
              passportIds={settings.passports?.map((p) => p.id) || []}
              onAddID={handleAddID}
              onShowDetails={(id) => console.log("Show details for:", id)}
              onOptions={(id) => console.log("Options for:", id)}
            />
          ) : (
            <HomeEmptyView canLoadPassport={failedToLoadPassport} />
          )}
        </Animated.View>
      )}

      {showUpdateAppModal && (
        <View style={styles.modalOverlay}>
          <UpdateModalView requiredVersion={requiredVersion} />
        </View>
      )}

      <AlertModal
        visible={showIncompatibleSdkModal}
        onClose={() => {
          setShowIncompatibleSdkModal(false)
          // Clear the URL param to prevent modal from showing again on navigation
          router.setParams({ sdkVersionCheckResult: undefined })
        }}
        onAccept={() => {
          setShowIncompatibleSdkModal(false)
          // Clear the URL param to prevent modal from showing again on navigation
          router.setParams({ sdkVersionCheckResult: undefined })
        }}
        icon={require("@/assets/images/zkpassport-logo.png")}
        iconSize={50}
        title={t("modals.incompatibleSdk.title")}
        description={t("modals.incompatibleSdk.description", {
          sdkVersion: sdkVersionCheckResult?.sdkVersion,
          minVersion: sdkVersionCheckResult?.sdkVersionRangeSupported.min,
          maxVersion: sdkVersionCheckResult?.sdkVersionRangeSupported.max,
        })}
        disclaimer={t("modals.incompatibleSdk.disclaimer")}
        buttonText={t("ok")}
        description2={true}
      />
    </View>
  )
}

const { width, height } = Dimensions.get("window")
const isSmallDevice = height < 700

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  backgroundGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  mainContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: isSmallDevice ? 30 : 50,
  },
  settingsButton: {
    position: "absolute",
    top: 10,
    right: 15,
    zIndex: 10,
  },
  settingsButtonTouchable: {
    borderRadius: 20,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingRight: 12,
  },
  passportCount: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 5,
  },
  connectButtonContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 30,
    width: "100%",
    alignItems: "center",
  },
  connectButton: {
    width: width * 0.85,
    maxWidth: 360,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  connectButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    paddingHorizontal: 24,
    gap: 12,
  },
  connectButtonIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    tintColor: "white",
  },
  connectButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  securityNoteContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  securityIcon: {
    marginRight: 5,
  },
  securityNote: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    textAlign: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    zIndex: 1000,
  },
  helpButtonContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 130 : 120,
    width: "100%",
    alignItems: "center",
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  helpButtonText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    marginRight: 4,
  },
  helpModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  helpModalContent: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  helpModalHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  helpModalTitle: {
    color: "#07245C",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  helpModalBody: {
    marginBottom: 24,
  },
  helpStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  helpStepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#4784FF",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  helpStepNumber: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  helpStepContent: {
    flex: 1,
    marginLeft: 12,
  },
  helpStepTitle: {
    color: "#07245C",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  helpStepDescription: {
    color: "rgba(7, 36, 92, 0.7)",
    fontSize: 13,
    lineHeight: 20,
  },
  helpModalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  helpModalSecondaryButton: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
    minWidth: 120,
  },
  helpModalSecondaryButtonText: {
    color: "rgba(0, 0, 0, 0.7)",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  helpModalPrimaryButton: {
    borderRadius: 8,
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },
  helpModalPrimaryButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  helpModalPrimaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  helpModalBlur: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
})

export default HomeView
