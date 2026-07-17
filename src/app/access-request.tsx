import React, { useEffect } from "react"
import { View, StyleSheet, BackHandler } from "react-native"
import { useLocalSearchParams, router } from "expo-router"
import { StatusBar } from "expo-status-bar"
import AccessRequestView from "@/components/AccessRequestView"
import { useSettings } from "@/context/SettingsContext"
import { QRCodeData } from "@zkpassport/utils"

const AccessRequestModal = () => {
  const {
    topic,
    query,
    domain,
    pubkey,
    mode,
    purpose,
    logo,
    name,
    scope,
    chainId,
    cloudProverUrl,
    sdkVersion,
    bridgeUrl,
    timestamp,
    devMode,
    passportId,
    uniqueIdentifierType,
    oprfKeyId,
    returnDeepLink,
  } = useLocalSearchParams()
  const { currentPassport, settings, passports } = useSettings()

  // Use the passed passportId if available, otherwise use settings.activePassport directly
  // This allows deep links to work without passportId while still using the selected ID from the home page
  // We use settings.activePassport directly instead of currentPassport to avoid stale memoized values
  const activePassportId =
    passportId && typeof passportId === "string" ? passportId : settings.activePassport

  const selectedPassport =
    activePassportId && passports[activePassportId] ? passports[activePassportId] : currentPassport

  // handle back gesture
  useEffect(() => {
    const onBackPress = () => {
      handleBack()
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [])

  const handleBack = () => {
    // Properly dismiss the modal
    if (router.canDismiss()) {
      router.dismiss()
    } else {
      router.back()
    }
  }

  // Reconstruct the QRCodeData from URL params
  const credentialsRequest: QRCodeData | null = topic
    ? {
        topic: topic as string,
        query: query ? JSON.parse(decodeURIComponent(query as string)) : undefined,
        domain: domain as string,
        pubkey: pubkey as string,
        mode: mode as any,
        service: {
          purpose: purpose as string,
          logo: logo as string,
          name: name as string,
          scope: scope as string,
          chainId: chainId ? parseInt(chainId as string) : undefined,
          cloudProverUrl: cloudProverUrl as string,
          bridgeUrl: bridgeUrl as string,
        },
        sdkVersion: sdkVersion as string,
        timestamp: timestamp ? Number(timestamp) : null,
        devMode: devMode ? devMode.toString() === "true" : false,
        uniqueIdentifierType: uniqueIdentifierType != null ? Number(uniqueIdentifierType) : null,
        oprfKeyId: (oprfKeyId as string) ?? null,
        returnDeepLink: (returnDeepLink as string) ?? null,
      }
    : null

  // If no credentials request, go back
  if (!credentialsRequest) {
    return null
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <AccessRequestView
        onClose={handleBack}
        credentialsRequest={credentialsRequest}
        passport={selectedPassport}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
})

export default AccessRequestModal
