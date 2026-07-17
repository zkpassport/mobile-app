import {
  Device_Info,
  ID_Info,
  ZKPassportError,
  MissingCscaError,
  CloudProverError,
  CloudProverErrorSubType,
  UnsupportedPassportError,
  CircuitError,
  CircuitErrorSubType,
  NFCScanError,
  NFCScanErrorSubType,
  MRZReadError,
  MRZReadErrorSubType,
  WebSocketError,
  WebSocketErrorSubType,
  OperationTiming,
} from "@/types/Error"
import * as Localization from "expo-localization"
import { type PassportViewModel, type ProofResult } from "@zkpassport/utils"
import { Commitments, OuterCircuitInputs } from "@/types"
import { estimatePassportIssueDate } from "./passport-chip-positions"
import MrzScanService from "@/services/MrzScanService"
import { getDocumentType, getIssuingCountryCode } from "./credentials"
import * as Device from "expo-device"
import { formatDateDisplay, getVersion } from "."
import { DiskStorageService, StorageService } from "@/services/StorageService"

/**
 * Function to safely run a function that might throw an error
 * @param fn Function to run safely
 * @param fallback Optional fallback value to return if the function fails
 * @returns The result of the function or the fallback value
 */
export function runSafely<T>(fn: () => T, fallback?: T): T | undefined {
  try {
    return fn()
  } catch (error) {
    console.error("Error in runSafely: " + error)
    return fallback
  }
}

/**
 * Function to safely run an async function that might throw an error
 * @param fn Async function to run safely
 * @param fallback Optional fallback value to return if the function fails
 * @returns Promise that resolves to the result of the function or the fallback value
 */
export async function runSafelyAsync<T>(
  fn: () => Promise<T>,
  fallback?: T,
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    console.log("Error in runSafelyAsync: " + error)
    return fallback
  }
}

/**
 * Parse and enhance an error object to get more meaningful information
 * @param error The error to parse
 * @returns Enhanced error with a better message
 */
export function parseError(error: unknown): Error {
  // If it's already an Error instance
  if (error instanceof Error) {
    return error
  }

  // If it's a string, create a new Error
  if (typeof error === "string") {
    return new Error(error)
  }

  // If it's an object with a message property
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message)
  }

  // If we can't determine the type, stringify it
  try {
    const message = JSON.stringify(error)
    return new Error(`Unknown error: ${message}`)
  } catch {
    return new Error("Unknown error occurred")
  }
}

export const clearProofMemoryCrashData = async (
  storage: StorageService = new DiskStorageService(),
) => {
  const settings = await storage.getItem("settings")
  if (settings) {
    const parsedSettings = JSON.parse(settings)
    parsedSettings.generatingBaseSubproofs = false
    parsedSettings.circuitBeingProven = ""
    parsedSettings.hasCrashedDuringBaseSubproofsGeneration = true
    parsedSettings.startedGeneratingBaseSubproofsAt = 0
    try {
      await storage.setItem("settings", JSON.stringify(parsedSettings))
    } catch (error) {
      console.error("Error saving settings: " + error)
    }
  }
}

export const shouldAutoReportError = async (
  hasErrorReportingConsent?: boolean | null,
  storage: StorageService = new DiskStorageService(),
) => {
  let shouldAutoReport = hasErrorReportingConsent === true
  if (hasErrorReportingConsent === null) {
    try {
      const storedConsent = await storage.getItem("errorReportingConsent")
      shouldAutoReport = storedConsent === "enabled"
      console.log("Fallback storage check, consent: " + storedConsent)
    } catch (error) {
      console.error("Error reading consent from storage: " + error)
      shouldAutoReport = false
    }
  }
  return shouldAutoReport
}

export const getIDMetadata = async (currentPassport?: PassportViewModel, mrz?: string | null) => {
  const redactedSOD = runSafely(() => {
    if (currentPassport) return currentPassport.sod.getRedactedSOD().toBase64()
  })

  const issuingDate = runSafely(() => {
    let date = currentPassport?.dateOfIssue

    if (!date && currentPassport?.mrz) {
      date = estimatePassportIssueDate(currentPassport.mrz)?.toISOString().split("T")[0]
    }

    if (!date && mrz) {
      date = estimatePassportIssueDate(mrz)?.toISOString().split("T")[0]
    }

    // If still no issuing date, use SOD certificate validity notBefore as fallback
    if (!date && currentPassport?.sod?.certificate?.tbs?.validity?.notBefore) {
      const notBeforeDate = new Date(currentPassport.sod.certificate.tbs.validity.notBefore)
      if (!isNaN(notBeforeDate.getTime())) {
        date = notBeforeDate.toISOString().split("T")[0]
        console.log("Using SOD certificate notBefore date as issuing date:", date)
      }
    }

    return date
  })

  const issuingDateDG12 = runSafely(() => {
    const date = currentPassport?.dateOfIssue
    return date
  })

  const document_issuer = runSafely(() => {
    if (currentPassport?.mrz) {
      return getIssuingCountryCode(currentPassport)
    } else if (mrz) {
      console.log("mrz doc issuer", mrz)
      return getIssuingCountryCodeFromMRZ(mrz)
    } else {
      return undefined
    }
  })

  const document_nationality = runSafely(() => {
    return currentPassport?.nationality
  })

  const documentExpiry = runSafely(() => {
    if (currentPassport) {
      const expiry = currentPassport.passportExpiry
      return formatDateDisplay(expiry)
    } else if (mrz) {
      return getDocumentExpiry(mrz)
    }
    return undefined
  })

  const document_type = runSafely(() => {
    if (currentPassport?.mrz) {
      return getDocumentType(
        currentPassport.mrz,
        getIssuingCountryCode(currentPassport),
        currentPassport.nationality,
      )
    } else if (mrz) {
      return getDocumentType(mrz, getIssuingCountryCodeFromMRZ(mrz), currentPassport?.nationality)
    } else {
      return undefined
    }
  })

  const document_type_code = runSafely(() => {
    if (currentPassport?.mrz) {
      return currentPassport.mrz.substring(0, 2)
    } else if (mrz) {
      return mrz.substring(0, 2)
    } else {
      return undefined
    }
  })

  const id_info: ID_Info = {
    redacted_sod: redactedSOD,
    issuing_date: issuingDate,
    issuing_date_dg12: issuingDateDG12,
    document_issuer,
    document_nationality,
    document_type,
    document_type_code,
    document_expiry: documentExpiry,
  }

  return { id_info }
}

export const getDocumentExpiry = (mrz: string | null) => {
  if (!mrz) return undefined
  const mrzService = MrzScanService.getInstance()
  const parsedMrz = mrzService.parseMRZ(mrz)
  return parsedMrz?.dateOfExpiry
}

// TODO: Find out why this needs to be placed here to work
function getIssuingCountryCodeFromMRZ(mrz: string) {
  if (!mrz) return undefined
  const alpha3Code = mrz.slice(2, 5)
  if (alpha3Code === "D<<") {
    return "DEU"
  }
  return alpha3Code
}

export const getDeviceMetadata = async (storage: StorageService = new DiskStorageService()) => {
  // Parallelize all async operations
  const [deviceUuid, is_rooted, max_memory_android, side_loading] = await Promise.all([
    runSafelyAsync(async () => {
      const uuid = await storage.getItem("deviceUuid")
      if (!uuid) {
        console.log("Device UUID not found")
      }
      return uuid
    }),
    runSafelyAsync(Device.isRootedExperimentalAsync),
    runSafelyAsync(Device.getMaxMemoryAsync),
    runSafelyAsync(Device.isSideLoadingEnabledAsync),
  ])

  // Use runSafely for synchronous device property access

  // Device country, based on locale region country code (e.g. "PL")
  const device_region = runSafely(() => Localization.getLocales()[0]?.regionCode)
  // Human-friendly device model name
  // The name people would typically use to refer to the device rather than a model ID
  // May be null if it cannot be determined
  // e.g. Android: "Pixel 2", iOS: "iPhone XS Max"
  const device_model = runSafely(() => Device.modelName)
  // Model ID of device
  // On Android this value is always null
  const device_model_id = runSafely(() => Device.modelId)
  // Consumer-visible brand of the product/hardware
  // e.g. Android: "google", "xiaomi", iOS: "Apple"
  const device_brand = runSafely(() => Device.brand)
  // Name of the OS running on the device. Android: "Android", iOS: "iOS" or "iPadOS"
  const os_name = runSafely(() => Device.osName)
  // Human-readable OS version string
  // e.g. Android: "4.0.3", iOS: "12.3.1" (Note: May not always contain three numbers separated by dots)
  const os_version = runSafely(() => Device.osVersion)
  // Build ID of OS that more precisely identifies the version of the OS
  // On Android this corresponds to Build.DISPLAY (not Build.ID) and currently is a string as described here: https://source.android.com/setup/start/build-numbers
  // On iOS, this corresponds to kern.osversion and is the detailed OS version sometimes displayed next to the more human-readable version
  const os_build_id = runSafely(() => Device.osBuildId)
  // Internal build ID of OS
  // On Android this corresponds to Build.ID
  // On iOS, this is the same value as Device.osBuildId
  const os_internal_build_id = runSafely(() => Device.osInternalBuildId)
  // Uniquely identifies the build of the currently running system OS.
  // On Android it is: $(BRAND)/$(PRODUCT)/$(DEVICE)/$(BOARD):$(VERSION.RELEASE)/$(ID)/$(VERSION.INCREMENTAL):$(TYPE)/\$(TAGS)
  // e.g. google/sdk_gphone_x86/generic_x86:9/PSR1.180720.075/5124027:user/release-keys
  // On iOS this value is always null
  const os_build_id_android = runSafely(() => Device.osBuildFingerprint)
  // True if the app is running on a real device and false if running in a simulator or emulator
  const real_device = runSafely(() => Device.isDevice)
  const app_version = runSafely(() => getVersion())
  // Device's total memory in bytes. Total memory accessible to the kernel, but not necessarily to a single app
  // Basically the amount of RAM the device has not including below-kernel fixed allocations like DMA buffers, RAM for the baseband CPU etc.
  const device_memory = runSafely(() => Device.totalMemory)
  const cpu_architecture = runSafely(() => Device.supportedCpuArchitectures)
  const device_year_class = runSafely(() => Device.deviceYearClass)

  const device_info: Device_Info = {
    device_region,
    device_model,
    device_brand,
    device_model_id,
    os_name,
    os_version,
    os_build_id,
    os_internal_build_id,
    os_build_id_android,
    app_version,
    device_memory,
    max_memory_android,
    is_rooted,
    side_loading,
    real_device,
    cpu_architecture,
    device_year_class,
  }

  return { device_info, deviceUuid }
}

/**
 * Optimized function to get both ID and device metadata in parallel
 * @param currentPassport Optional passport data
 * @param mrz Optional MRZ string
 * @returns Promise with both metadata sets
 */
export const getAllMetadata = async (currentPassport?: PassportViewModel, mrz?: string | null) => {
  const [idMetadata, deviceMetadata] = await Promise.all([
    getIDMetadata(currentPassport, mrz),
    getDeviceMetadata(),
  ])

  return {
    ...idMetadata,
    ...deviceMetadata,
  }
}

export const getVkeysAndPublicInputs = (outerCircuitInputs: OuterCircuitInputs): Commitments => {
  const allVkeysHashes = {
    csc_to_dsc_proof: outerCircuitInputs.csc_to_dsc_proof.key_hash,
    dsc_to_id_data_proof: outerCircuitInputs.dsc_to_id_data_proof.key_hash,
    integrity_check_proof: outerCircuitInputs.integrity_check_proof.key_hash,
    disclosure_proofs: outerCircuitInputs.disclosure_proofs.map((proof) => proof.key_hash),
  }

  const allPublicInputs = {
    csc_to_dsc_proof: outerCircuitInputs.csc_to_dsc_proof.public_inputs,
    dsc_to_id_data_proof: outerCircuitInputs.dsc_to_id_data_proof.public_inputs,
    integrity_check_proof: outerCircuitInputs.integrity_check_proof.public_inputs,
    disclosure_proofs: outerCircuitInputs.disclosure_proofs.map((proof) => proof.public_inputs),
  }

  return {
    vkeys: allVkeysHashes,
    publicInputs: allPublicInputs,
  }
}

/**
 * Creates a detailed base subproof error with structured data
 */
export function createBaseSubproofError(
  originalError: Error,
  baseSubproofs: ProofResult[],
  currentCircuit: string,
  circuitVersion: string,
  timing?: OperationTiming,
): CircuitError {
  const succeededSubproofs = baseSubproofs.map((proof) => proof.name || "unknown").filter(Boolean)
  const failedCircuit = currentCircuit || "unknown"

  // Determine which subproof failed based on current circuit
  let failedSubproofName = "unknown"
  if (currentCircuit?.includes("sig_check_dsc")) {
    failedSubproofName = "DSC Circuit"
  } else if (currentCircuit?.includes("sig_check_id_data")) {
    failedSubproofName = "ID Data Circuit"
  } else if (currentCircuit?.includes("data_check_integrity")) {
    failedSubproofName = "Integrity Check Circuit"
  }

  const message = `Base subproof generation failed at ${failedSubproofName}`
  console.log("Creating base subproof error:", message)

  return new CircuitError(CircuitErrorSubType.BaseSubproofError, message, {
    circuit_name: failedCircuit,
    error_details: {
      failed_subproof: failedSubproofName,
      succeeded_subproofs: succeededSubproofs,
      total_expected: 3,
      succeeded_count: succeededSubproofs.length,
      circuit_version: circuitVersion,
      original_error: originalError.message,
    },
    operation_timing: timing,
  })
}

/**
 * Creates a detailed disclosure circuit error with structured data
 */
export function createDisclosureCircuitError(
  succeededCircuits: string[],
  failedCircuits: { name: string; error: string }[],
  circuitVersion: string,
  timing?: OperationTiming,
): CircuitError {
  const failedCircuitNames = failedCircuits.map((f) => f.name)
  const primaryFailedCircuit = failedCircuits.length > 0 ? failedCircuits[0].name : "unknown"

  const message =
    failedCircuits.length > 1
      ? `Multiple disclosure circuits failed: ${failedCircuitNames.join(", ")}`
      : `Disclosure circuit failed: ${primaryFailedCircuit}`

  console.log("Creating disclosure circuit error:", message)
  return new CircuitError(CircuitErrorSubType.DisclosureCircuitError, message, {
    circuit_name: primaryFailedCircuit,
    error_details: {
      failed_circuits: failedCircuitNames,
      succeeded_circuits: succeededCircuits,
      circuit_version: circuitVersion,
      failed_circuit_details: failedCircuits.map((f) => ({ name: f.name, error: f.error })),
    },
    operation_timing: timing,
  })
}
/**
 * Creates an unsupported passport error with structured context
 */
export function createUnsupportedPassportError(
  reason?: string,
  circuitName?: string,
  context?: any,
): UnsupportedPassportError {
  const message = circuitName ? `${reason} for circuit ${circuitName}` : `${reason}`
  return new UnsupportedPassportError(message, context)
}

export enum UnsupportedPassportEnum {
  NOT_SUPPORTED = "Your ID is not supported.",
  FAILED_ROOT_CERTIFICATE_CHECK = "Failed to retrieve the signature algorithm details of your root certificate.",
  FAILED_ID_SIG_DETAILS = "Failed to retrieve the signature algorithm details of your ID",
  FAILED_HASH_ALG_DETAILS = "Failed to retrieve the hash algorithm details of your ID",
}

/**
 * Creates an MRZ read error with structured data
 */
export function createMRZReadError(
  mrz: string | null,
  isCheckSumError: boolean = false,
  wasManuallyEntered: boolean = false,
  documentType?: string | undefined,
  countryCode?: string | undefined,
  timing?: OperationTiming,
): MRZReadError {
  let checksumErrors: string[] = []

  // Determine error subtype
  let errorSubType = MRZReadErrorSubType.SCAN_FAILED
  if (isCheckSumError) {
    errorSubType = MRZReadErrorSubType.CHECKSUM_ERROR
    checksumErrors.push("Invalid MRZ checksum")
  } else if (wasManuallyEntered) {
    errorSubType = MRZReadErrorSubType.MANUAL_ENTRY_FAILED
  } else if (mrz && mrz.length > 0) {
    errorSubType = MRZReadErrorSubType.PARSING_ERROR
  }

  const message = isCheckSumError
    ? "MRZ checksum validation failed"
    : wasManuallyEntered
      ? "Manual MRZ entry failed"
      : "Failed to read MRZ from camera"

  console.log("Creating MRZ read error:", message)
  return new MRZReadError(message, errorSubType, {
    input_method: wasManuallyEntered ? "manual" : "camera",
    document_type: documentType,
    document_country: countryCode,
    checksum_errors: checksumErrors,
    operation_timing: timing,
  })
}

/**
 * Creates an NFC scan error with structured data
 */

// THESE are all useless.
export function createNFCScanError(
  errorMessage: string,
  documentType: string = "unknown",
  country: string = "unknown",
  nfcEnabled: boolean = true,
  timing?: OperationTiming,
): NFCScanError {
  // Determine error subtype based on error message content
  let errorSubType = NFCScanErrorSubType.CHIP_READ_FAILED

  const lowerMessage = errorMessage.toLowerCase()
  if (lowerMessage.includes("canceled") || lowerMessage.includes("cancelled")) {
    errorSubType = NFCScanErrorSubType.SCAN_CANCELLED
  } else if (
    lowerMessage.includes("already running a scan") ||
    lowerMessage.includes("already scanning")
  ) {
    errorSubType = NFCScanErrorSubType.ALREADY_SCANNING
  } else if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("time out") ||
    lowerMessage.includes("timed out")
  ) {
    errorSubType = NFCScanErrorSubType.TIMEOUT
  } else if (
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("auth") ||
    lowerMessage.includes("security status not satisfied") ||
    lowerMessage.includes("invalid mrz key")
  ) {
    errorSubType = NFCScanErrorSubType.AUTHENTICATION_FAILED
  } else if (
    lowerMessage.includes("nfc chip reading not enabled") ||
    (lowerMessage.includes("nfc") && lowerMessage.includes("disabled")) ||
    lowerMessage.includes("bac") ||
    lowerMessage.includes("PACE")
  ) {
    errorSubType = NFCScanErrorSubType.NFC_DISABLED
  } else if (
    lowerMessage.includes("lost connection to chip") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("disconnect") ||
    lowerMessage.includes("closed")
  ) {
    errorSubType = NFCScanErrorSubType.CONNECTION_LOST
  } else if (
    lowerMessage.includes("nfc chip reading not supported") ||
    lowerMessage.includes("detected tag does not support passport reading") ||
    lowerMessage.includes("not supported") ||
    lowerMessage.includes("tag response")
  ) {
    errorSubType = NFCScanErrorSubType.UNSUPPORTED_CHIP
  }

  const message = `NFC chip read failed`

  console.log("Creating NFC scan error:", message)
  return new NFCScanError(message, errorSubType, {
    document_type: documentType,
    document_country: country,
    nfc_enabled: nfcEnabled,
    error_details: errorMessage,
    operation_timing: timing,
  })
}

/**
 * Creates a generic circuit error for non-ZKPassportError instances
 */
// TODO: Attempted circuits should be caught in the timing?
export function createGenericCircuitError(
  error: unknown,
  currentCircuit: string,
  attemptedCircuits: string[],
  timing?: OperationTiming,
): ZKPassportError {
  const baseError = error instanceof Error ? error : new Error(String(error))

  return new CircuitError(CircuitErrorSubType.ProofGenerationFailed, baseError.message, {
    circuit_name: currentCircuit,
    error_details: baseError.stack || baseError.message,
    attempted_circuits: attemptedCircuits,
    operation_timing: timing,
  })
}

/**
 * Creates a structured MissingCscaError
 */
// TODO: the inforamtion here might not matter too much as the metadata will be passed in anyway, so we dont need the extra context?
export function createMissingCscaError(passport: PassportViewModel): MissingCscaError {
  return new MissingCscaError(`CSCA not found for issuer: ${passport.nationality}`, {
    nationality: passport.nationality,
  })
}

export function getCloudProverErrorSubType(error: unknown): CloudProverErrorSubType {
  let errorSubType = CloudProverErrorSubType.SERVER_ERROR
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("empty request")) {
      errorSubType = CloudProverErrorSubType.EMPTY_REQUEST
    } else if (error.message.toLowerCase().includes("missing bb_version")) {
      errorSubType = CloudProverErrorSubType.MISSING_BB_VERSION
    } else if (error.message.toLowerCase().includes("witness or inputs field required")) {
      errorSubType = CloudProverErrorSubType.MISSING_INPUTS
    } else if (error.message.toLowerCase().includes("missing circuit")) {
      errorSubType = CloudProverErrorSubType.MISSING_INPUTS
    } else if (error.message.toLowerCase().includes("bb binary path not set")) {
      errorSubType = CloudProverErrorSubType.MISSING_BB_BINARY_PATH
    } else if (error.message.toLowerCase().includes("unsupported bb version")) {
      errorSubType = CloudProverErrorSubType.UNSUPPORTED_BB_VERSION
    } else if (error.message.toLowerCase().includes("failed to execute")) {
      errorSubType = CloudProverErrorSubType.SERVER_ERROR
    }
  }
  return errorSubType
}

/**
 * Creates a structured CloudProverError
 */
export function createCloudProverError(
  circuit: string,
  errorSubType: CloudProverErrorSubType,
  context: {
    proverUrl: string
    responseHeader?: string
    responseBody?: string
    vkeys?: any
    publicInputs?: any
    originalError?: Error
    timing?: OperationTiming
  },
): CloudProverError {
  const message = `Cloud prover error for circuit: ${circuit}`

  return new CloudProverError(message, errorSubType, {
    circuit,
    cloud_prover_url: context.proverUrl,
    response_header: context.responseHeader,
    response_body: context.responseBody,
    vkeys: context.vkeys,
    public_inputs: context.publicInputs,
    error_details: context.originalError?.message,
    operation_timing: context.timing,
  })
}

/**
 * Creates a structured WebSocketError
 */
export function createWebSocketError(
  message: string,
  errorSubType: WebSocketErrorSubType,
  domain?: string | undefined,
  errorDetails?: any,
  options?: {
    showUser?: boolean
  },
): WebSocketError {
  return new WebSocketError(
    message,
    errorSubType,
    {
      domain: domain ?? "",
      error_details: errorToJSON(errorDetails),
    },
    { showUser: options?.showUser ?? true },
  )
}

export function errorToJSON(error: Error): {
  name: string
  message: string
  stack?: string
} {
  try {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  } catch {
    // If it fails, return the error as a string
    return {
      name: "Unknown",
      message: String(error),
    }
  }
}

export const truncateToLines = (
  text: string,
  maxLines: number = 4,
  charsPerLine: number = 40,
): string => {
  if (!text) return text

  const maxChars = maxLines * charsPerLine

  if (text.length <= maxChars) {
    return text
  }

  // Find the last space, avoid cutting words
  let truncateIndex = maxChars
  while (
    truncateIndex > maxChars * 0.8 &&
    text[truncateIndex] !== " " &&
    text[truncateIndex] !== "\n"
  ) {
    truncateIndex--
  }

  // If space cannot be found, just cut the word
  if (truncateIndex <= maxChars * 0.8) {
    truncateIndex = maxChars
  }

  return text.substring(0, truncateIndex).trim() + "..."
}
