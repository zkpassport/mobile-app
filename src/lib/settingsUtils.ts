import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import * as Keychain from "react-native-keychain"
import { t } from "i18next"
import { MySettings } from "@/context/SettingsContext"
import { Binary, PassportViewModel, SOD } from "@zkpassport/utils"
import { getBiometricInfo } from "./permissions"

// Default settings
export const defaultSettings: MySettings = {
  passports: [],
  showResetDataButton: false,
  fullProofMode: false,
  faceMatchDebug: false,
  generatingBaseSubproofs: false,
  circuitBeingProven: "",
  startedGeneratingBaseSubproofsAt: 0,
  baseSubproofs: {},
  cleanExitDuringProofGeneration: false,
  memoryTooLow: false,
  hideIDDetails: false,
  hasSeenBiometricCheck: false,
  hasAddedIdBefore: false,
  currentProofGenerationProgress: undefined,
  history: [],
  requireAuthForVerification: false,
}

export async function deleteFromSecureStorage(key: string) {
  if (Platform.OS === "android") {
    const biometricInfo = await getBiometricInfo()
    await SecureStore.deleteItemAsync(key, {
      requireAuthentication: biometricInfo === "enabled",
      keychainService: key,
      authenticationPrompt: t("permissions.biometricPrompt"),
    })
  } else {
    await Keychain.resetGenericPassword({
      service: key,
    })
  }
}

/**
 *
 * @param key - The key to get the value from
 * @param throwError - Whether to throw an error if the value is failed to be retrieved
 * i.e. authentication failed, it will return null if the value is not defined after a valid auth
 * @returns The value from the secure storage
 */
export async function getValueFromSecureStorage(key: string, throwError = false) {
  if (Platform.OS === "android") {
    try {
      const biometricInfo = await getBiometricInfo()
      return await SecureStore.getItemAsync(key, {
        requireAuthentication: biometricInfo === "enabled",
        keychainService: key,
        authenticationPrompt: t("permissions.biometricPrompt"),
      })
    } catch (error) {
      console.log("Error getting value from secure storage: " + error)
      if (throwError) {
        throw error
      }
      return null
    }
  } else {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: key,
      })
      if (credentials) {
        return credentials.password
      } else {
        return null
      }
    } catch (error) {
      console.log("Error getting value from secure storage: " + error)
      if (throwError) {
        throw error
      }
      return null
    }
  }
}

export async function saveToSecureStorage(key: string, value: string, throwError = false) {
  if (Platform.OS === "android") {
    try {
      const biometricInfo = await getBiometricInfo()
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: biometricInfo === "enabled",
        keychainService: key,
        authenticationPrompt: t("permissions.biometricPrompt"),
      })
    } catch (error) {
      console.log("Error saving to secure storage: " + error)
      if (throwError) {
        throw error
      }
    }
  } else {
    try {
      const biometricInfo = await getBiometricInfo()
      await Keychain.setGenericPassword(key, value, {
        service: key,
        accessControl:
          biometricInfo === "enabled"
            ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
            : Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
      })
    } catch (error) {
      console.log("Error saving to secure storage: " + error)
      if (throwError) {
        throw error
      }
    }
  }
}

// Helper function to convert stored passport data to PassportViewModel
export const convertToPassportViewModel = (passportData: any): PassportViewModel => {
  // Recursive function to convert serialized Binary (string) to actual Binary
  const convertBytesToBinary = (obj: any): any => {
    if (!obj || typeof obj !== "object") return obj

    if (Array.isArray(obj)) {
      return obj.map((item) => convertBytesToBinary(item))
    }

    const newObj: any = {}
    for (const key in obj) {
      if (key === "bytes" && typeof obj[key] === "string") {
        newObj[key] = Binary.from(obj[key])
      } else {
        newObj[key] = convertBytesToBinary(obj[key])
      }
    }
    return newObj
  }

  // Apply conversions
  const passport = convertBytesToBinary(passportData) as PassportViewModel
  passport.sod = SOD.fromDER(passport.sod.bytes)

  // Patch for old ID with badly formatted MRZ
  passport.mrz = passport.mrz.replaceAll(" ", "").replaceAll("\n", "")

  return passport
}
