import { NativeModules, Platform, DeviceEventEmitter } from "react-native"
import * as PassportReaderAndroid from "react-native-passport-reader"
import {
  PassportViewModel,
  DataGroupInfo,
  SOD,
  Binary,
  PassportReaderEvent,
  isDSCSupported,
  isIDSupported,
} from "@zkpassport/utils"
import { getVersion, negativeBytesToPositiveBytes } from "@/lib"
import MrzScanService from "./MrzScanService"
import { DSCProofService } from "./ProofService"
import { trimWhiteBorderBase64, removeBackgroundBase64 } from "../../modules/dg2-crop"

// Use native module based on platform
const PassportReader =
  Platform.OS === "ios" ? NativeModules.PassportReaderModule : PassportReaderAndroid

const PACE_POLLING_MRZ_PREFIXES = ["IDFRA"]

function requiresPacePolling(mrz: string): boolean {
  // French ID cards use PACE polling
  // TODO: Add the other countries that use PACE polling
  return PACE_POLLING_MRZ_PREFIXES.some((prefix) => mrz.startsWith(prefix))
}

export enum NfcErrorType {
  USER_CANCELLED = "USER_CANCELLED",
  MRZ_AUTH_FAILED = "MRZ_AUTH_FAILED",
  NFC_DISABLED = "NFC_DISABLED",
  GENERIC_ERROR = "GENERIC_ERROR",
  TIMEOUT = "TIMEOUT",
  /** NFC system-level failure - device restart required */
  NFC_SYSTEM_FAILURE = "NFC_SYSTEM_FAILURE",
  /** WiFi interference detected - suggest user to turn off WiFi */
  // TODO: implement this error handling
  WIFI_INTERFERENCE = "WIFI_INTERFERENCE",
}

export interface NfcScanResult {
  success: boolean
  passport?: PassportViewModel
  error?: string
  errorType?: NfcErrorType
}

class NfcScanService {
  private static instance: NfcScanService
  private mrzService: MrzScanService
  private constructor() {
    this.mrzService = MrzScanService.getInstance()
  }

  static getInstance(): NfcScanService {
    if (!NfcScanService.instance) {
      NfcScanService.instance = new NfcScanService()
    }

    return NfcScanService.instance
  }

  async checkNFCEnabled(): Promise<boolean> {
    if (Platform.OS === "android") {
      try {
        const isNfcEnabled = await PassportReader.isNFCEnabled()
        return isNfcEnabled
      } catch (error) {
        console.warn("Failed to check NFC status:", error)
        return false
      }
    }
    return true
  }

  async goToNfcSetting(): Promise<boolean> {
    if (Platform.OS === "android") {
      try {
        return await PassportReader.goToNfcSetting()
      } catch (error) {
        console.warn("Failed to open NFC settings:", error)
        return false
      }
    }
    return true
  }

  /**
   * Scans NFC chip and returns a structured result
   */
  async scanWithResult(mrz: string): Promise<NfcScanResult> {
    try {
      const result = await this.scan(mrz)
      if (typeof result === "string") {
        // Classify the error
        let errorType = NfcErrorType.GENERIC_ERROR
        const lowerResult = result.toLowerCase()

        if (result.includes("canceled")) {
          errorType = NfcErrorType.USER_CANCELLED
        } else if (
          lowerResult.includes("wifi interference") ||
          lowerResult.includes("e_wifi_interference")
        ) {
          // WiFi interference detected - suggest turning off WiFi
          errorType = NfcErrorType.WIFI_INTERFERENCE
        } else if (
          lowerResult.includes("nfc system failure") ||
          lowerResult.includes("device restart required") ||
          lowerResult.includes("nfc system is busy") ||
          lowerResult.includes("unable to create nfc session")
        ) {
          // Critical NFC system failure - requires device restart
          errorType = NfcErrorType.NFC_SYSTEM_FAILURE
        } else if (
          lowerResult.includes("security status not satisfied") ||
          lowerResult.includes("invalid mrz key")
        ) {
          errorType = NfcErrorType.MRZ_AUTH_FAILED
        } else if (lowerResult.includes("timeout") || lowerResult.includes("disconnect")) {
          errorType = NfcErrorType.TIMEOUT
        }
        return {
          success: false,
          error: result,
          errorType,
        }
      }

      return {
        success: true,
        passport: result,
      }
    } catch (error: any) {
      // Check if the error indicates NFC system failure or WiFi interference
      const errorMessage = error?.message || String(error)
      const lowerError = errorMessage.toLowerCase()

      // Check for WiFi interference first
      if (lowerError.includes("wifi interference") || error?.code === "E_WIFI_INTERFERENCE") {
        return { success: false, error: errorMessage, errorType: NfcErrorType.WIFI_INTERFERENCE }
      }

      if (
        lowerError.includes("nfc system failure") ||
        lowerError.includes("device restart required") ||
        lowerError.includes("nfc system is busy") ||
        lowerError.includes("unable to create nfc session") ||
        error?.code === "E_NFC_SYSTEM_FAILURE"
      ) {
        return {
          success: false,
          error: errorMessage,
          errorType: NfcErrorType.NFC_SYSTEM_FAILURE,
        }
      }

      return {
        success: false,
        error: errorMessage,
        errorType: NfcErrorType.GENERIC_ERROR,
      }
    }
  }

  async scan(mrz: string): Promise<PassportViewModel | string> {
    try {
      const mrzDetails = this.mrzService.parseMRZ(mrz)
      if (!mrzDetails) {
        return "Invalid MRZ data"
      }

      const { documentNumber, dateOfBirth, dateOfExpiry } = mrzDetails

      if (Platform.OS === "ios") {
        const isPacePolling = requiresPacePolling(mrz)
        // Passport scanning on iOS
        const passport = JSON.parse(
          await PassportReader.scan(documentNumber, dateOfBirth, dateOfExpiry, isPacePolling),
        )
        passport.sod = SOD.fromDER(Binary.from(passport.sod))
        const passportDataGroupHashes = JSON.parse(passport.dataGroupHashes)
        const passportDataGroupValues = JSON.parse(passport.dataGroupValues)
        const passportDataGroups: DataGroupInfo[] = []
        for (const key in passportDataGroupHashes) {
          passportDataGroups.push({
            groupNumber: parseInt(key.replaceAll("DG", "")),
            name: key,
            hash: passportDataGroupHashes[key],
            value: passportDataGroupValues[key] ?? [],
          })
        }

        // Process DG2 photo: crop white borders, then remove background (iOS)
        let processedPhoto = passport.originalPhoto
        try {
          if (processedPhoto) {
            // Crop white borders
            try {
              console.log("[NfcScanService] Processing DG2 photo (iOS) - Cropping white borders")
              processedPhoto = await trimWhiteBorderBase64(processedPhoto, 20)
            } catch {}
            // Remove background
            console.log("[NfcScanService] Processing DG2 photo (iOS) - Removing background")
            try {
              processedPhoto = await removeBackgroundBase64(processedPhoto)
            } catch {}
          }
        } catch (error) {
          console.warn("[NfcScanService] Failed to process DG2 photo (iOS)", error)
        }

        const passportViewModel: PassportViewModel = {
          ...passport,
          name: `${passport.firstName} ${passport.lastName}`,
          passportNumber: passport.documentNumber,
          passportExpiry: passport.documentExpiryDate,
          dataGroups: passportDataGroups,
          appVersion: getVersion(),
          photo: processedPhoto,
          originalPhoto: passport.originalPhoto,
        }
        return passportViewModel
      } else {
        // Passport scanning on Android
        const passport = await PassportReader.scan({
          documentNumber,
          dateOfBirth,
          dateOfExpiry,
        })
        const positiveSodBytes = negativeBytesToPositiveBytes(passport.sod)
        passport.sod = SOD.fromDER(Binary.from(positiveSodBytes))
        const passportDataGroupHashes = JSON.parse(passport.dataGroupHashes)
        const passportDataGroupValues = JSON.parse(passport.dataGroupValues)
        const passportDataGroups: DataGroupInfo[] = []
        for (const key in passportDataGroupHashes) {
          passportDataGroups.push({
            groupNumber: parseInt(key),
            name: `DG${key}`,
            hash: negativeBytesToPositiveBytes(passportDataGroupHashes[key]),
            value: negativeBytesToPositiveBytes(passportDataGroupValues[key] ?? []),
          })
        }

        // Process DG2 photo: crop white borders (Android)
        let processedPhoto = passport.photo.base64
        try {
          if (processedPhoto) {
            // Crop white borders
            try {
              console.log(
                "[NfcScanService] Processing DG2 photo (Android) - Cropping white borders",
              )
              processedPhoto = await trimWhiteBorderBase64(processedPhoto, 20)
            } catch {}
          }
        } catch (error) {
          console.warn("[NfcScanService] Failed to process DG2 photo (Android)", error)
        }

        const passportViewModel: PassportViewModel = {
          ...passport,
          mrz: passport.mrz.replaceAll(" ", "").replaceAll("\n", ""),
          name: `${passport.firstName} ${passport.lastName}`,
          passportNumber: passport.documentNumber,
          passportExpiry: passport.documentExpiryDate,
          photo: processedPhoto,
          originalPhoto: passport.photo.base64,
          appVersion: getVersion(),
          dataGroups: passportDataGroups,
          gender:
            passport.gender?.toLowerCase() === "male"
              ? "M"
              : passport.gender?.toLowerCase() === "female"
                ? "F"
                : "",
        }
        return passportViewModel
      }
    } catch (error: any) {
      console.log(error)
      return error && error.message ? error.message : "error"
    }
  }

  async cancel(): Promise<void> {
    if (Platform.OS === "android") {
      return PassportReader.cancel()
    }
    return Promise.resolve()
  }

  addPassportReaderListener(listener: (event: PassportReaderEvent) => void) {
    if (Platform.OS === "android") {
      return DeviceEventEmitter.addListener("PassportReaderEvent", listener)
    }
    return null
  }

  async IDSupported(passport: PassportViewModel): Promise<boolean> {
    try {
      // dsc proof service
      const dscProofService = DSCProofService.getInstance()

      const { isSupported } = await dscProofService.verifyAndGetCSC(passport, 11155111)

      const DSCSupported = isDSCSupported(passport.sod.certificate)

      const IDSupported = isIDSupported(passport)
      return isSupported && DSCSupported && IDSupported
    } catch (error) {
      console.log("Error checking ID supported:", error)
      return false
    }
  }
}

export default NfcScanService
