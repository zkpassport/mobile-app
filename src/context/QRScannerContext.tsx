import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import { View, StyleSheet, Alert } from "react-native"
import * as Haptics from "expo-haptics"
import { router } from "expo-router"
import { useTranslation } from "react-i18next"
import type { QRCodeData } from "@zkpassport/utils"

import { checkCameraPermission } from "@/lib/permissions"
import { useSettings } from "@/context/SettingsContext"
import { useWebSocket } from "@/context/WebSocketContext"
import { useError } from "@/context/ErrorContext"
import { isAccessRequestVisible, setCurrentDeepLinkTopic } from "@/lib/navigationState"
import { createWebSocketError } from "@/lib/errorUtils"
import { WebSocketErrorSubType } from "@/types/Error"
import QRCodeScannerView from "@/components/QRCodeScannerView"
import EventPage, { EventPageType } from "@/components/Info/EventPage"
import { MrzScanService } from "@/services/MrzScanService"
import { getPassportUniqueId } from "@/lib"
import { reportEvent } from "@/services/EventReportingService"

interface QRScannerContextType {
  isShowingScanner: boolean
  openScanner: () => Promise<boolean>
  closeScanner: () => void
  handleScannedCode: (data: QRCodeData, source?: "qr" | "deeplink") => Promise<void>
  isCodeScanHandled: () => boolean
  setCodeScanHandled: (handled: boolean) => void
}

const QRScannerContext = createContext<QRScannerContextType | undefined>(undefined)

export function QRScannerProvider({ children }: { children: React.ReactNode }) {
  const [isShowingScanner, setIsShowingScanner] = useState(false)
  const { t } = useTranslation()
  const { settings, currentPassport, passports, updateSettings } = useSettings()
  const { scan } = useWebSocket()
  const { reportError } = useError()
  const codeScanHandledRef = useRef(false)
  const [showExpiredIdPage, setShowExpiredIdPage] = useState(false)

  const setCodeScanHandled = useCallback((handled: boolean) => {
    codeScanHandledRef.current = handled
  }, [])

  const isCodeScanHandled = useCallback(() => {
    return codeScanHandledRef.current
  }, [])

  const openScanner = useCallback(async () => {
    // Check camera permission first
    const hasPermission = await checkCameraPermission()
    if (!hasPermission) {
      return false
    }
    setCodeScanHandled(false)

    // Haptic feedback when opening scanner
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    setIsShowingScanner(true)
    return true
  }, [])

  const closeScanner = useCallback(() => {
    setIsShowingScanner(false)
  }, [])

  const handleScannedCode = useCallback(
    async (data: QRCodeData, source: "qr" | "deeplink" = "qr") => {
      if (!settings.passports || settings.passports.length === 0) {
        Alert.alert(t("home.noID"), t("home.scanIDFirst"))
        return
      }

      closeScanner()

      const mrzService = MrzScanService.getInstance()
      const loadedPassports = Object.values(passports)
      const allIDExpired =
        loadedPassports.length > 0 &&
        loadedPassports.every((passport) => mrzService.isExpired(passport?.mrz ?? ""))
      // If all IDs are expired, show the expired ID page
      if (allIDExpired) {
        setShowExpiredIdPage(true)
        return
      }

      const currentIDExpired = mrzService.isExpired(currentPassport?.mrz ?? "")
      // If the current selected ID is expired, select the first not expired ID
      if (currentIDExpired) {
        // Select the first ID that is not expired
        const firstNotExpiredID = Object.values(passports).find(
          (passport) => !mrzService.isExpired(passport?.mrz ?? ""),
        )
        if (firstNotExpiredID) {
          await updateSettings({ activePassport: getPassportUniqueId(firstNotExpiredID) })
        } else {
          // If no ID is not expired, show the expired ID page
          // Should never happen, but just in case
          setShowExpiredIdPage(true)
          return
        }
      }

      console.log("Scanned QR code:", data)

      if (!data?.domain || !data?.topic || !data?.pubkey) {
        const error = createWebSocketError(
          "Missing required parameters",
          WebSocketErrorSubType.INVALID_PARAMETERS,
          data?.domain ?? undefined,
        )
        await reportError(error, null, currentPassport)
        console.warn("QR code missing required parameters")
        return
      }

      if (isAccessRequestVisible()) {
        return
      }

      reportEvent(
        "request_opened",
        {
          entry_method: source === "qr" ? "qr_code" : "deeplink",
          domain: data.domain,
          service_name: data.service?.name ?? undefined,
          field_count: data.query ? Object.keys(data.query).length : undefined,
          mode: data.mode,
          dev_mode: data.devMode ?? false,
          sdk_version: data.sdkVersion ?? undefined,
        },
        data.pubkey,
      )

      setCurrentDeepLinkTopic(data.topic ?? null)

      // Navigate to the modal instead of setting state
      await scan(
        data.domain!,
        data.topic!,
        data.pubkey!,
        {
          bridgeUrl: data.service?.bridgeUrl,
        },
        // Error callback
        () => router.back(),
      )

      console.log("data", data)
      console.log("data.domain", data.domain)

      // Prepare query param by encoding the JSON
      const encodedQuery = encodeURIComponent(JSON.stringify(data.query))

      const accessRequestRoute = {
        pathname: "/access-request",
        params: {
          topic: data.topic,
          query: encodedQuery,
          domain: data.domain,
          pubkey: data.pubkey,
          mode: data.mode,
          purpose: data.service?.purpose,
          logo: data.service?.logo,
          name: data.service?.name,
          scope: data.service?.scope,
          chainId: data.service?.chainId,
          cloudProverUrl: data.service?.cloudProverUrl,
          sdkVersion: data.sdkVersion,
          bridgeUrl: data.service?.bridgeUrl,
          timestamp: data.timestamp,
          devMode: data.devMode != null ? String(data.devMode) : undefined,
          uniqueIdentifierType:
            data.uniqueIdentifierType != null ? String(data.uniqueIdentifierType) : undefined,
          oprfKeyId: data.oprfKeyId ?? undefined,
          returnDeepLink: source === "deeplink" ? (data.returnDeepLink ?? undefined) : undefined,
          passportId: settings.activePassport, // Pass the currently selected passport ID
        },
      } as const

      router.push(accessRequestRoute)
    },
    [
      settings,
      currentPassport,
      passports,
      updateSettings,
      scan,
      reportError,
      t,
      closeScanner,
      isCodeScanHandled,
    ],
  )

  const handleExpiredIdPageContinue = useCallback(() => {
    setShowExpiredIdPage(false)
    closeScanner()
    router.push("/scan-passport")
  }, [closeScanner])

  return (
    <QRScannerContext.Provider
      value={{
        isShowingScanner,
        openScanner,
        closeScanner,
        handleScannedCode,
        isCodeScanHandled,
        setCodeScanHandled,
      }}
    >
      {children}

      {/* Global QR Scanner Overlay */}
      {isShowingScanner && (
        <View style={styles.scannerOverlay}>
          <QRCodeScannerView
            onScan={(data) => {
              console.log("QR scan data:", data)
              if (isCodeScanHandled()) {
                return
              }

              setCodeScanHandled(true)
              handleScannedCode(data, "qr")
            }}
            onCancel={closeScanner}
          />
        </View>
      )}
      {showExpiredIdPage && (
        <View style={styles.scannerOverlay}>
          <EventPage
            onContinue={handleExpiredIdPageContinue}
            onSecondary={() => setShowExpiredIdPage(false)}
            stepType={EventPageType.EXPIRED_ID}
          />
        </View>
      )}
    </QRScannerContext.Provider>
  )
}

export const useQRScanner = () => {
  const context = useContext(QRScannerContext)
  if (!context) {
    throw new Error("useQRScanner must be used within a QRScannerProvider")
  }
  return context
}

const styles = StyleSheet.create({
  scannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
})
