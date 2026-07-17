import { Camera } from "expo-camera"
import * as LocalAuthentication from "expo-local-authentication"
import { Alert, Platform, Linking } from "react-native"
import { t } from "i18next"

export const checkCameraPermission = async () => {
  // First check current permission status without requesting
  const { status: currentStatus } = await Camera.getCameraPermissionsAsync()

  if (currentStatus === "granted") {
    return true
  }

  // If not granted, request permission
  const { status } = await Camera.requestCameraPermissionsAsync()
  if (status !== "granted") {
    Alert.alert(t("permissions.cameraTitle"), t("permissions.cameraMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("settings"),
        onPress: () =>
          Platform.OS === "ios" ? Linking.openURL("app-settings:") : Linking.openSettings(),
      },
    ])
    return false
  }
  return true
}

export const waitForBiometricMessage = async () => {
  const biometricInfo = await getBiometricInfo()
  return new Promise<boolean>((resolve) => {
    if (biometricInfo === "disabled") {
      Alert.alert(t("permissions.biometricTitle"), t("permissions.biometricWarning"), [
        { text: t("ignore"), style: "default", onPress: () => resolve(true) },
        {
          text: t("enable"),
          onPress: () => {
            if (Platform.OS === "ios") Linking.openURL("app-settings:")
            else Linking.openSettings()
            resolve(false)
          },
        },
      ])
      return
    }
    resolve(true)
  })
}

export async function getBiometricInfo(): Promise<"no_hardware" | "disabled" | "enabled"> {
  const compatible = await LocalAuthentication.hasHardwareAsync()
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!compatible) {
    console.log("No biometrics hardware")
    return "no_hardware"
  }
  if (!enrolled) {
    console.log("Biometrics disabled")
    return "disabled"
  }
  console.log("Biometrics enabled")
  return "enabled"
}

export const checkBiometricCompatibility = async (showAlert: boolean = false) => {
  // Make sure isSupported is not considered in in isAvailable in expo-local-authentication -> LocalAuthenticationModule.swift
  // otherwise it won't correctly if the user disables Face ID or Touch ID in settings
  const compatible = await LocalAuthentication.hasHardwareAsync()
  if (!compatible && showAlert) {
    Alert.alert(t("permissions.biometricTitle"), t("permissions.biometricNotAvailable"))
  }
  return compatible
}

export const checkBiometricPermission = async () => {
  const compatible = await checkBiometricCompatibility()
  if (!compatible) {
    // If biometric is not compatible, we still want to allow the user to use the app
    return true
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!enrolled) {
    Alert.alert(t("permissions.biometricTitle"), t("permissions.biometricNotEnrolled"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("settings"),
        onPress: () =>
          Platform.OS === "ios" ? Linking.openURL("app-settings:") : Linking.openSettings(),
      },
    ])
    return false
  }

  return true
}

export const authenticateWithBiometrics = async () => {
  const hasPermission = await checkBiometricPermission()
  if (!hasPermission) return false

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t("permissions.biometricPrompt"),
      fallbackLabel: t("permissions.biometricFallback"),
      cancelLabel: t("cancel"),
      disableDeviceFallback: false,
    })
    return result.success
  } catch (error) {
    console.error("Biometric authentication error: " + error)
    return false
  }
}
