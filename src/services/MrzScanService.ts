import { NativeModules, Platform } from "react-native"
import { MRZReadError } from "@/types/Error"
import { createMRZReadError } from "@/lib/errorUtils"
import { TFunction } from "i18next"
import { DocumentType } from "@/types/DocumentInfo"
import { getDocumentType } from "@/lib/credentials"
import { getPassportExpiryDate } from "@/lib"

const LINKING_ERROR =
  `The package 'react-native-mrz-scanner' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: "" }) +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n"

const MrzScanner = NativeModules.MrzScannerModule
  ? NativeModules.MrzScannerModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR)
        },
      },
    )

export interface MRZScanResult {
  success: boolean
  mrz?: string
  parsedData?: MRZParsedData
  documentType?: DocumentType
  countryCode?: string
  error?: MRZReadError
  isCancelled?: boolean
  isDuplicate?: boolean
  isTimeout?: boolean
}

export type MRZParsedData = {
  documentNumber: string
  dateOfBirth: string
  dateOfExpiry: string
}

export class MrzScanService {
  private static instance: MrzScanService
  private reportError?: (
    error: Error,
    errorInfo?: any,
    passport?: any,
    mrz?: string,
  ) => Promise<boolean>

  private constructor() {}

  public setErrorReporting(
    reportError: (error: Error, errorInfo?: any, passport?: any, mrz?: string) => Promise<boolean>,
  ) {
    this.reportError = reportError
  }

  static getInstance(): MrzScanService {
    if (!MrzScanService.instance) {
      MrzScanService.instance = new MrzScanService()
    }
    return MrzScanService.instance
  }

  async scan(options?: { documentType?: DocumentType }): Promise<MRZScanResult> {
    let mrz = ""
    // let confidence = 0
    try {
      if (Platform.OS === "android") {
        const documentType = (() => {
          switch (options?.documentType) {
            case DocumentType.ID_CARD:
              return "ID_CARD"
            case DocumentType.RESIDENCE_PERMIT:
              return "RESIDENCE_PERMIT"
            default:
              return "PASSPORT"
          }
        })()
        const result = await MrzScanner.scan({
          documentType: documentType,
        })
        mrz = result.mrz
        // confidence = result.confidence
      } else {
        // iOS path - pass documentType to native module
        mrz = await MrzScanner.scan({
          documentType: options?.documentType || "passport",
        })
      }
      const parsedMrz = this.parseMRZ(mrz)
      const documentType = getDocumentType(mrz)
      const countryCode = this.getCountryCodeFromMRZ(mrz)
      if (parsedMrz) {
        return {
          success: true,
          mrz: mrz,
          parsedData: parsedMrz,
          documentType: documentType as DocumentType,
          countryCode,
        }
      } else {
        // Create MRZ read error for invalid checksum
        const mrzError = createMRZReadError(mrz, true, false, documentType, countryCode)
        return {
          success: false,
          mrz: mrz,
          documentType: documentType as DocumentType,
          countryCode,
          error: mrzError,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Check if user cancelled
      if (errorMessage.toLowerCase().includes("cancel")) {
        return {
          success: false,
          isCancelled: true,
        }
      }
      // Check if timeout occurred - don't report timeout as error
      if (errorMessage.toLowerCase().includes("timeout")) {
        return {
          success: false,
          isTimeout: true,
        }
      }
      // Report error if error reporting is configured (non-blocking)
      const mrzError = createMRZReadError(null, false, false)
      if (this.reportError) {
        this.reportError(mrzError)
      }

      return {
        success: false,
        error: mrzError,
      }
    }
  }

  public detectAndSwapTD3Lines(mrz: string): string {
    // leaving in for now, but we have this logic in the native code now
    if (mrz.length !== 88) return mrz

    const firstLine = mrz.slice(0, 44)
    const secondLine = mrz.slice(44, 88)

    // In correct order, line 2 contains:
    // - Date of birth at positions 13-18 (6 digits)
    // - Date of expiry at positions 21-26 (6 digits)
    // If we find these date patterns in the first line, it means the lines are swapped
    const dobInFirstLine = firstLine.slice(13, 19)
    const doeInFirstLine = firstLine.slice(21, 27)

    const hasDobPattern = /^\d{6}$/.test(dobInFirstLine)
    const hasDoePattern = /^\d{6}$/.test(doeInFirstLine)

    // If both DOB and DOE patterns are found in first line, lines are swapped
    if (hasDobPattern && hasDoePattern) {
      console.log("Detected swapped TD3 lines (dates found in first line), correcting...")
      return secondLine + firstLine
    }

    return mrz
  }

  // TODO: should this return null or throw an error?
  public parseMRZ(mrz: string): MRZParsedData | null {
    try {
      let formattedMrz = mrz.replaceAll(/\s/gi, "")
      // console.log("Formatted MRZ: " + formattedMrz)
      let documentNumber = ""
      let dateOfBirth = ""
      let dateOfExpiry = ""

      if (formattedMrz.startsWith("P") && formattedMrz.length === 88) {
        // Check if lines are swapped (TD3 format: 2 lines of 44 chars each)
        // Line 1 should start with P< and contain mostly letters/chevrons
        // Line 2 should contain document number and dates
        formattedMrz = this.detectAndSwapTD3Lines(formattedMrz)

        // Sometimes the document number can be shorter than 9 characters,
        // these are padded with < and we need to remove them
        documentNumber = formattedMrz.slice(44, 44 + 9).replaceAll("<", "")
        dateOfBirth = formattedMrz.slice(57, 57 + 6)
        dateOfExpiry = formattedMrz.slice(65, 65 + 6)
        /* if (
          !this.verifyChecksum(documentNumber, Number(formattedMrz[44 + 9])) ||
          !this.verifyChecksum(dateOfBirth, Number(formattedMrz[57 + 6])) ||
          !this.verifyChecksum(dateOfExpiry, Number(formattedMrz[65 + 6]))
        ) {
          throw new Error("Invalid checksum")
        } */
      } else if (
        (formattedMrz.startsWith("I") ||
          formattedMrz.startsWith("A") ||
          formattedMrz.startsWith("X") ||
          formattedMrz.startsWith("C")) &&
        formattedMrz.length === 90
      ) {
        // Sometimes the document number can be shorter than 9 characters,
        // these are padded with < and we need to remove them
        documentNumber = formattedMrz.slice(5, 5 + 9).replaceAll("<", "")
        dateOfBirth = formattedMrz.slice(30, 30 + 6)
        dateOfExpiry = formattedMrz.slice(38, 38 + 6)
        let documentNumberCheckDigit = formattedMrz[5 + 9]
        // If the document number check digit is <, we need to check the extended document number
        const extendedDocumentNumber =
          documentNumberCheckDigit === "<" ? formattedMrz.slice(5 + 10, 30).replaceAll("<", "") : ""
        // If the extended document number is not empty, we need to add it to the document number
        if (extendedDocumentNumber && extendedDocumentNumber.length > 0) {
          // The last character of the extended document number is a check digit,
          // so we need to remove it
          documentNumberCheckDigit = extendedDocumentNumber[extendedDocumentNumber.length - 1]
          documentNumber = documentNumber + extendedDocumentNumber.slice(0, -1)
        }
        /* if (
          !this.verifyChecksum(documentNumber, Number(documentNumberCheckDigit)) ||
          !this.verifyChecksum(dateOfBirth, Number(formattedMrz[30 + 6])) ||
          !this.verifyChecksum(dateOfExpiry, Number(formattedMrz[38 + 6]))
        ) {
          throw new Error("Invalid checksum")
        } */
      } else {
        throw new Error("Invalid MRZ")
      }
      return {
        documentNumber,
        dateOfBirth,
        dateOfExpiry,
      }
    } catch (error) {
      console.log("Error scanning MRZ: " + error)
      return null
    }
  }

  public verifyChecksum(value: string, checkDigit: number) {
    return this.calculateCheckDigit(value) === checkDigit.toString()
  }

  public getCountryCodeFromMRZ(mrz: string | null) {
    return mrz && mrz.length >= 5 ? mrz.substring(2, 5) : "unknown"
  }

  public formatDateForDisplay(mrzDate: string): string {
    if (mrzDate.length !== 6) return mrzDate
    const year = parseInt(mrzDate.substring(0, 2))
    const month = mrzDate.substring(2, 4)
    const day = mrzDate.substring(4, 6)
    const currentYear = new Date().getFullYear()
    const currentCentury = Math.floor(currentYear / 100) * 100
    const currentYearInCentury = currentYear % 100
    let fullYear = currentCentury + year
    if (year > currentYearInCentury + 10) {
      fullYear -= 100
    }
    return `${fullYear}-${month}-${day}`
  }

  public constructMrzFromManualInput = (
    documentNumber: string,
    dateOfBirth: string,
    dateOfExpiry: string,
    documentType: DocumentType,
  ): string => {
    if (documentType === DocumentType.PASSPORT) {
      // TD3 format (passport): 2 lines of 44 characters each
      // Line 1: P<ISSname<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
      // Line 2: documentNumber(9)checkDigit(1)nationality(3)dateOfBirth(6)checkDigit(1)sex(1)dateOfExpiry(6)checkDigit(1)personalNumber(14)checkDigit(1)

      const line1 = "P<XXX" + "<".repeat(39) // Placeholder line 1

      const paddedDocNumber = this.padWithChevrons(documentNumber, 9)
      const docCheckDigit = this.calculateCheckDigit(paddedDocNumber)
      const nationality = "XXX" // Placeholder nationality
      const dobCheckDigit = this.calculateCheckDigit(dateOfBirth)
      const sex = "<" // Placeholder sex
      const expCheckDigit = this.calculateCheckDigit(dateOfExpiry)
      const personalNumber = "<".repeat(14) // Empty personal number
      const personalCheckDigit = this.calculateCheckDigit(personalNumber)

      // Calculate overall check digit
      const overallData =
        paddedDocNumber +
        docCheckDigit +
        dateOfBirth +
        dobCheckDigit +
        dateOfExpiry +
        expCheckDigit +
        personalNumber +
        personalCheckDigit
      const overallCheckDigit = this.calculateCheckDigit(overallData)

      const line2 =
        paddedDocNumber +
        docCheckDigit +
        nationality +
        dateOfBirth +
        dobCheckDigit +
        sex +
        dateOfExpiry +
        expCheckDigit +
        personalNumber +
        personalCheckDigit +
        overallCheckDigit

      return line1 + "\n" + line2
    } else {
      // TD1 format (ID card): 3 lines of 30 characters each
      // Line 1: docType(2)issuingState(3)documentNumber(9)checkDigit(1)optional(15)
      // Line 2: dateOfBirth(6)checkDigit(1)sex(1)dateOfExpiry(6)checkDigit(1)nationality(3)optional(11)checkDigit(1)
      // Line 3: names(30)

      const docTypeCode = "I<" // ID card
      const issuingState = "XXX" // Placeholder issuing state
      const paddedDocNumber = this.padWithChevrons(documentNumber, 9)
      const docCheckDigit = this.calculateCheckDigit(paddedDocNumber)
      const optional1 = "<".repeat(15)

      const line1 = docTypeCode + issuingState + paddedDocNumber + docCheckDigit + optional1

      const dobCheckDigit = this.calculateCheckDigit(dateOfBirth)
      const sex = "<" // Placeholder sex
      const expCheckDigit = this.calculateCheckDigit(dateOfExpiry)
      const nationality = "XXX" // Placeholder nationality
      const optional2 = "<".repeat(11)

      // Calculate line 2 check digit
      const line2Data =
        dateOfBirth + dobCheckDigit + sex + dateOfExpiry + expCheckDigit + nationality + optional2
      const line2CheckDigit = this.calculateCheckDigit(line2Data)

      const line2 =
        dateOfBirth +
        dobCheckDigit +
        sex +
        dateOfExpiry +
        expCheckDigit +
        nationality +
        optional2 +
        line2CheckDigit

      const line3 = "<".repeat(30) // Placeholder names

      return line1 + "\n" + line2 + "\n" + line3
    }
  }

  public padWithChevrons = (value: string, length: number): string => {
    return value.length >= length
      ? value.slice(0, length)
      : value + "<".repeat(length - value.length)
  }

  // Helper function to calculate MRZ check digit
  public calculateCheckDigit = (value: string): string => {
    const multipliers = [7, 3, 1]
    const charMap: { [key: string]: number } = {
      "0": 0,
      "1": 1,
      "2": 2,
      "3": 3,
      "4": 4,
      "5": 5,
      "6": 6,
      "7": 7,
      "8": 8,
      "9": 9,
      "<": 0,
      " ": 0,
      "A": 10,
      "B": 11,
      "C": 12,
      "D": 13,
      "E": 14,
      "F": 15,
      "G": 16,
      "H": 17,
      "I": 18,
      "J": 19,
      "K": 20,
      "L": 21,
      "M": 22,
      "N": 23,
      "O": 24,
      "P": 25,
      "Q": 26,
      "R": 27,
      "S": 28,
      "T": 29,
      "U": 30,
      "V": 31,
      "W": 32,
      "X": 33,
      "Y": 34,
      "Z": 35,
    }

    let sum = 0
    for (let i = 0; i < value.length; i++) {
      const char = value[i]
      const charValue = charMap[char] !== undefined ? charMap[char] : 0
      sum += charValue * multipliers[i % 3]
    }
    return (sum % 10).toString()
  }

  public getIssuingCountryFromMRZ = (mrz: string): string | null => {
    if (!mrz) return null
    const lines = mrz.split("\n")
    if (lines.length === 0) return null

    // For both TD3 (passport) and TD1 (ID card), issuing country is in positions 2-4 of first line
    const firstLine = lines[0].trim()
    if (firstLine.length >= 5) {
      return firstLine.substring(2, 5) // Extract 3-letter country code
    }
    return null
  }

  public extractMrzData = (mrz: string, docType: string): MRZParsedData | null => {
    try {
      let formattedMrz = mrz.replaceAll(/\s/gi, "")
      if (docType === "passport" && formattedMrz.startsWith("P") && formattedMrz.length === 88) {
        // Check and fix swapped lines for TD3 format
        formattedMrz = this.detectAndSwapTD3Lines(formattedMrz)

        // TD3 format (passport)
        const documentNumber = formattedMrz.slice(44, 44 + 9).replaceAll("<", "")
        const dateOfBirth = formattedMrz.slice(57, 57 + 6)
        const dateOfExpiry = formattedMrz.slice(65, 65 + 6)

        return { documentNumber, dateOfBirth, dateOfExpiry }
      } else if (
        (formattedMrz.startsWith("I") ||
          formattedMrz.startsWith("A") ||
          formattedMrz.startsWith("C")) &&
        formattedMrz.length === 90
      ) {
        // TD1 format (ID card)
        let documentNumber = formattedMrz.slice(5, 5 + 9).replaceAll("<", "")
        const dateOfBirth = formattedMrz.slice(30, 30 + 6)
        const dateOfExpiry = formattedMrz.slice(38, 38 + 6)

        // Handle extended document number if present
        const documentNumberCheckDigit = formattedMrz[5 + 9]
        if (documentNumberCheckDigit === "<") {
          const extendedDocumentNumber = formattedMrz.slice(5 + 10, 30).replaceAll("<", "")
          if (extendedDocumentNumber && extendedDocumentNumber.length > 0) {
            documentNumber = documentNumber + extendedDocumentNumber.slice(0, -1)
          }
        }

        return { documentNumber, dateOfBirth, dateOfExpiry }
      }
    } catch (error) {
      console.warn("Failed to extract MRZ data:", error)
    }
    return null
  }

  public validateInputs = (
    documentNumber: string,
    dateOfBirth: string,
    dateOfExpiry: string,
    t: TFunction,
  ) => {
    const newErrors = {
      documentNumber: "",
      dateOfBirth: "",
      dateOfExpiry: "",
    }

    // Validate document number (should be alphanumeric, no length asserion now)
    if (!documentNumber.trim()) {
      newErrors.documentNumber = t("errors.documentNumberRequired")
    }

    // Validate date of birth (YYMMDD format)
    if (!dateOfBirth.trim()) {
      newErrors.dateOfBirth = t("errors.dateOfBirthRequired")
    } else if (!/^\d{6}$/.test(dateOfBirth)) {
      newErrors.dateOfBirth = t("errors.invalidDateFormat")
    } else {
      const month = parseInt(dateOfBirth.slice(2, 4))
      const day = parseInt(dateOfBirth.slice(4, 6))
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        newErrors.dateOfBirth = t("errors.invalidDate")
      }
    }

    // Validate date of expiry (YYMMDD format)
    if (!dateOfExpiry.trim()) {
      newErrors.dateOfExpiry = t("errors.dateOfExpiryRequired")
    } else if (!/^\d{6}$/.test(dateOfExpiry)) {
      newErrors.dateOfExpiry = t("errors.invalidDateFormat")
    } else {
      const month = parseInt(dateOfExpiry.slice(2, 4))
      const day = parseInt(dateOfExpiry.slice(4, 6))
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        newErrors.dateOfExpiry = t("errors.invalidDate")
      }
    }
    return {
      errors: newErrors,
      isValid: !newErrors.documentNumber && !newErrors.dateOfBirth && !newErrors.dateOfExpiry,
    }
  }

  public formatDateDisplay = (dateStr: string) => {
    if (dateStr.length === 6) {
      const year = dateStr.slice(0, 2)
      const month = dateStr.slice(2, 4)
      const day = dateStr.slice(4, 6)
      return `${day}/${month}/${year}`
    }
    return ""
  }

  public async isDuplicateMrz(mrz: string, getMrzs: () => Promise<string[]>): Promise<boolean> {
    // 1. Get existing MRZs from storage
    const mrzs = await getMrzs()

    const mrzData = this.extractMrzData(mrz, "passport")
    if (!mrzData) {
      return false
    }

    // 2. Look through the existing MRZs
    for (const existingMrz of mrzs) {
      const existingMrzData = this.extractMrzData(existingMrz, "passport")
      if (existingMrzData) {
        if (
          existingMrzData.documentNumber === mrzData.documentNumber &&
          existingMrzData.dateOfBirth === mrzData.dateOfBirth &&
          existingMrzData.dateOfExpiry === mrzData.dateOfExpiry
        ) {
          return true
        }
      } else {
        return false
      }
    }

    return false
  }

  public isExpired(mrz: string): boolean {
    const parsedMrz = this.parseMRZ(mrz)
    if (!parsedMrz) {
      return false
    }

    const { dateOfExpiry } = parsedMrz
    if (!dateOfExpiry || dateOfExpiry.length !== 6) {
      return false
    }

    const expiryDate = getPassportExpiryDate(dateOfExpiry)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return expiryDate < today
  }
}

// Export both the service instance and commonly used functions
export default MrzScanService
