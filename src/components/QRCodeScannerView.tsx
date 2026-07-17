import React, { useState, useEffect, useRef } from "react"
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Platform,
  Image,
} from "react-native"
import { CameraView, BarcodeScanningResult, Camera } from "expo-camera"
import * as Haptics from "expo-haptics"
import type { QRCodeData, Query, Service } from "@zkpassport/utils"
import { NullifierType } from "@zkpassport/utils"
import { useTranslation } from "react-i18next"
import { checkCameraPermission } from "@/lib/permissions"
import { checkVersions, handleIncorrectSDKVersion, VersionCheck } from "@/lib"
import { reportActivity } from "@/services/ActivityReportingService"
import { ErrorType } from "@/types/Error"
import { Cross, X } from "lucide-react-native"
import { LightOn } from "@/assets/images/icons/LightOn"
import { LightOff } from "@/assets/images/icons/LightOff"
import { useHideTabBar } from "@/context/TabBarVisibilityContext"
import ScanLineImage from "@/assets/images/Scan.png"

export type QRCodeScannerViewProps = {
  onScan: (data: QRCodeData) => void
  onCancel: () => void
}

const { width } = Dimensions.get("window")

// Scan area dimensions
const SCAN_AREA_SIZE = width * 0.7
const SCAN_LINE_WIDTH = SCAN_AREA_SIZE * 0.15
const SCAN_LINE_PADDING = 15 // Padding from the corners

const QRCodeScannerView: React.FC<QRCodeScannerViewProps> = ({ onScan, onCancel }) => {
  const { t } = useTranslation()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)
  const [scanningMessage, setScanningMessage] = useState<string | null>(null)
  const [scanError, setScanError] = useState<boolean>(false)
  const [isFlashOn, setIsFlashOn] = useState(false)
  const scanAreaAnimation = useRef(new Animated.Value(1)).current
  const scanLineAnimation = useRef(new Animated.Value(0)).current
  const scanLineAnimationRef = useRef<Animated.CompositeAnimation | null>(null)
  const qrCodeReadRef = useRef<boolean>(false)

  useHideTabBar(true)

  const toggleFlash = () => {
    setIsFlashOn(!isFlashOn)
  }

  useEffect(() => {
    let isMounted = true

    qrCodeReadRef.current = false

    const initializeCamera = async () => {
      try {
        // First check permission status without requesting
        const { status: currentStatus } = await Camera.getCameraPermissionsAsync()

        if (!isMounted) return

        if (currentStatus === "granted") {
          setHasPermission(true)
          return
        }

        // If permission not granted, use the checkCameraPermission function which will request it
        const permissionGranted = await checkCameraPermission()

        if (!isMounted) return

        setHasPermission(permissionGranted)
      } catch (error) {
        console.error("Error checking camera permission:", error)
        if (isMounted) {
          setHasPermission(false)
        }
      }
    }

    initializeCamera()

    // Start the scan area animation
    startScanAreaAnimation()

    return () => {
      isMounted = false
    }
  }, [])

  const startScanAreaAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAreaAnimation, {
          toValue: 1.05,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAreaAnimation, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }

  const startScanLineAnimation = () => {
    // Stop any existing animation first
    stopScanLineAnimation()

    // Calculate the distance to travel (from left edge to right edge, accounting for the scan line width)
    const travelDistance = SCAN_AREA_SIZE - SCAN_LINE_WIDTH - SCAN_LINE_PADDING * 2

    scanLineAnimationRef.current = Animated.loop(
      Animated.sequence([
        // Move from left to right
        Animated.timing(scanLineAnimation, {
          toValue: travelDistance,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Move from right to left
        Animated.timing(scanLineAnimation, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    scanLineAnimationRef.current.start()
  }

  const stopScanLineAnimation = () => {
    if (scanLineAnimationRef.current) {
      scanLineAnimationRef.current.stop()
      scanLineAnimationRef.current = null
    }
    scanLineAnimation.setValue(0)
  }

  // Start/stop scan line animation based on scan state
  useEffect(() => {
    if (scanned && !scanError) {
      startScanLineAnimation()
    } else {
      stopScanLineAnimation()
    }

    return () => {
      stopScanLineAnimation()
    }
  }, [scanned, scanError])

  const handleBarCodeScanned = async (barCodeScanningResult: BarcodeScanningResult) => {
    if (
      barCodeScanningResult.data.startsWith("https://zkpassport.app/r") ||
      barCodeScanningResult.data.startsWith("https://zkpassport.id/r")
    ) {
      if (qrCodeReadRef.current) {
        return
      }
      qrCodeReadRef.current = true
      setScanned(true)
      setScanError(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setScanningMessage(t("qr_scan_success"))

      // Extract the query parameters from the URL
      const url = new URL(barCodeScanningResult.data)
      const queryParams = url.searchParams
      const queryBase64 = queryParams.get("c")
      const query: Query | null = queryBase64 ? JSON.parse(atob(queryBase64)) : null
      const topic = queryParams.get("t")
      const pubkey = queryParams.get("p")
      const domain = queryParams.get("d")
      const serviceBase64 = queryParams.get("s")
      const service: Service | null = serviceBase64 ? JSON.parse(atob(serviceBase64)) : null
      const mode = queryParams.get("m") || "fast"
      const sdkVersion = queryParams.get("v")
      const timestamp = queryParams.get("dt")
      const devMode = !!queryParams.get("dev") && queryParams.get("dev") === "1"
      const nt = queryParams.get("nt")
      const uniqueIdentifierType: NullifierType | null =
        nt != null ? (Number(nt) as NullifierType) : null
      const oprfKeyId = queryParams.get("oprf_k")
      if (sdkVersion) {
        // This check is awaited so that it does not continue to the next step
        const check: VersionCheck = {
          appVersion: false,
          sdkVersion: true,
        }
        const compatible = await checkVersions(check, undefined, sdkVersion as string)
        if (!compatible.sdkVersion?.sdkVersionSupported) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          handleIncorrectSDKVersion(compatible.sdkVersion!)
          if (pubkey && domain) {
            reportActivity({
              requestId: pubkey,
              domain,
              scope: service?.scope,
              devMode,
              status: "failed",
              errorCode: ErrorType.SDK_VERSION_NOT_SUPPORTED,
            })
          }
          // TODO: clean up state here, check this is correct
          setScanned(false)
          setScanError(false)
          setScanningMessage(null)

          onCancel()
          return
        }
      }
      // Short delay to show success message before continuing
      setTimeout(() => {
        onScan({
          query,
          topic,
          pubkey,
          domain,
          service,
          mode: mode as "compressed" | "fast",
          sdkVersion,
          timestamp: timestamp ? Number(timestamp) : null,
          devMode: devMode,
          uniqueIdentifierType,
          oprfKeyId,
          returnDeepLink: null, // not required in scan mode
        })
      }, 500)
    } else {
      console.log(
        "Scanned QR code does not match the required pattern:",
        barCodeScanningResult.data,
      )
      // Set scanned to true to prevent multiple scans and haptic feedback
      setScanned(true)
      setScanError(true)
      qrCodeReadRef.current = true
      setScanningMessage(t("invalid_qr_code"))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)

      // Reset after error
      setTimeout(() => {
        setScanningMessage(null)
        setScanned(false)
        setScanError(false)
        qrCodeReadRef.current = false
      }, 2000)
    }
  }

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t("requesting_camera_permission")}</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Cross width={64} height={64} color="#FF3B30" />
          <Text style={styles.errorText}>{t("camera_permission_denied")}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={async () => {
              // Try to request permission again
              const granted = await checkCameraPermission()
              if (granted) {
                setHasPermission(true)
              } else {
                onCancel()
              }
            }}
          >
            <Text style={styles.primaryButtonText}>{t("tryAgain")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: "#8E8E93" }]}
            onPress={onCancel}
          >
            <Text style={styles.primaryButtonText}>{t("go_back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        enableTorch={isFlashOn}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onCancel} activeOpacity={0.7}>
          <X width={28} height={28} color="#FBFBFB" />
        </TouchableOpacity>

        {/* Scanning frame */}
        <View style={styles.scanAreaContainer}>
          <Animated.View style={[styles.scanArea, { transform: [{ scale: scanAreaAnimation }] }]}>
            <View style={[styles.cornerTL, styles.corner]} />
            <View style={[styles.cornerTR, styles.corner]} />
            <View style={[styles.cornerBL, styles.corner]} />
            <View style={[styles.cornerBR, styles.corner]} />

            {/* Animated scan line - visible only when processing */}
            {scanned && !scanError && (
              <Animated.View
                style={[
                  styles.scanLineContainer,
                  {
                    transform: [{ translateX: scanLineAnimation }],
                  },
                ]}
              >
                <Image source={ScanLineImage} style={styles.scanLineImage} resizeMode="contain" />
              </Animated.View>
            )}
          </Animated.View>

          {/* Status Text */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructions}>{scanningMessage || t("position_qr_code")}</Text>
            {scanned && !scanError && (
              <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
            )}
          </View>
        </View>

        {/* Flash Toggle Button */}
        <TouchableOpacity style={styles.flashButton} onPress={toggleFlash} activeOpacity={0.7}>
          {isFlashOn ? <LightOn /> : <LightOff />}
          <Text style={styles.flashButtonText}>
            {isFlashOn ? t("qrScanner.lightOn") : t("qrScanner.lightOff")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#07245C",
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  camera: {
    flex: 1,
    backgroundColor: "#000000",
  },
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  closeButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 80,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  scanAreaContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#FFFFFF",
    borderRadius: 4,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 12,
  },
  scanLineContainer: {
    position: "absolute",
    left: SCAN_LINE_PADDING,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  scanLineImage: {
    width: SCAN_LINE_WIDTH,
    height: SCAN_AREA_SIZE,
  },
  instructionsContainer: {
    position: "absolute",
    bottom: -80,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 40,
  },
  instructions: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
    marginBottom: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  spinner: {
    marginTop: 10,
  },
  flashButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 100 : 80,
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  flashButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#07245C",
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    // fontFamily: "Metropolis",
    color: "#333333",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#07245C",
    padding: 20,
  },
  errorText: {
    marginTop: 20,
    marginBottom: 30,
    fontSize: 16,
    // fontFamily: "Metropolis",
    color: "#333333",
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    // fontFamily: "Metropolis",
    color: "#FFFFFF",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
    // fontFamily: "Metropolis",
  },
})

export default QRCodeScannerView
