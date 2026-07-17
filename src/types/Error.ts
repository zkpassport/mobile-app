import { DSC } from "@zkpassport/utils"

export enum ErrorType {
  WEBSOCKET_ERROR = "WEBSOCKET_ERROR",
  MISSING_CSCA = "MISSING_CSCA",
  UNSUPPORTED_HASH_ALG_DSC = "UNSUPPORTED_HASH_ALG_DSC",
  UNSUPPORTED_HASH_ALG_ECONTENT = "UNSUPPORTED_HASH_ALG_ECONTENT",
  UNSUPPORTED_HASH_ALG_DG = "UNSUPPORTED_HASH_ALG_DG",
  UNSUPPORTED_PASSPORT = "UNSUPPORTED_PASSPORT",
  CIRCUIT_ERROR = "CIRCUIT_ERROR",
  BASE_SUBPROOF_ERROR = "BASE_SUBPROOF_ERROR",
  DISCLOSURE_CIRCUIT_ERROR = "DISCLOSURE_CIRCUIT_ERROR",
  APP_QUIT_UNEXPECTEDLY = "APP_QUIT_UNEXPECTEDLY",
  NATIVE_EXCEPTION = "NATIVE_EXCEPTION",
  CLOUD_PROVER_ERROR = "CLOUD_PROVER_ERROR",
  MRZ_READ_ERROR = "MRZ_READ_ERROR",
  NFC_SCAN_ERROR = "NFC_SCAN_ERROR",
  ECONTENT_LEN_EXCEEDS_MAX = "ECONTENT_LEN_EXCEEDS_MAX",
  TBS_LEN_EXCEEDS_MAX = "TBS_LEN_EXCEEDS_MAX",
  SIGNEDATTR_LEN_EXCEEDS_MAX = "SIGNEDATTR_LEN_EXCEEDS_MAX",
  APP_ATTEST_NOT_SUPPORTED = "APP_ATTEST_NOT_SUPPORTED",
  COMMITMENT_MISMATCH = "COMMITMENT_MISMATCH",
  SANCTIONS_FAILED = "SANCTIONS_FAILED",
  SDK_VERSION_NOT_SUPPORTED = "SDK_VERSION_NOT_SUPPORTED",
}

export type ErrorSubType =
  | CloudProverErrorSubType
  | CircuitErrorSubType
  | NFCScanErrorSubType
  | MRZReadErrorSubType
  | WebSocketErrorSubType

// Error modal states
export type CertificateModalState = {
  visible: boolean
  error: ZKPassportError | null
  autoReported: boolean
}

// Cloud Prover Error Subtypes
export enum CloudProverErrorSubType {
  EMPTY_REQUEST = "EMPTY_REQUEST",
  MISSING_BB_VERSION = "MISSING_BB_VERSION",
  MISSING_INPUTS = "MISSING_INPUTS",
  UNSUPPORTED_BB_VERSION = "UNSUPPORTED_BB_VERSION",
  MISSING_BB_BINARY_PATH = "MISSING_BB_BINARY_PATH",
  SERVER_ERROR = "SERVER_ERROR",
}

export enum CircuitErrorSubType {
  BaseSubproofError = "BaseSubproofError",
  DisclosureCircuitError = "DisclosureCircuitError",
  CircuitNotFound = "CircuitNotFound",
  UnsupportedNumberOfSubproofs = "UnsupportedNumberOfSubproofs",
  ProofGenerationFailed = "ProofGenerationFailed",
  MissingAttestation = "MissingAttestation",
}

// NFC Scan Error Subtypes
export enum NFCScanErrorSubType {
  CHIP_READ_FAILED = "CHIP_READ_FAILED",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  NFC_DISABLED = "NFC_DISABLED",
  UNSUPPORTED_CHIP = "UNSUPPORTED_CHIP",
  CONNECTION_LOST = "CONNECTION_LOST",
  TIMEOUT = "TIMEOUT",
  SCAN_CANCELLED = "SCAN_CANCELLED",
  ALREADY_SCANNING = "ALREADY_SCANNING",
}

// MRZ Read Error Subtypes
export enum MRZReadErrorSubType {
  SCAN_FAILED = "SCAN_FAILED",
  CHECKSUM_ERROR = "CHECKSUM_ERROR",
  MANUAL_ENTRY_FAILED = "MANUAL_ENTRY_FAILED",
  PARSING_ERROR = "PARSING_ERROR",
  TIMEOUT = "TIMEOUT",
}

// WebSocket Error Subtypes
export enum WebSocketErrorSubType {
  CONNECTION_FAILED = "CONNECTION_FAILED",
  MESSAGE_SEND_FAILED = "MESSAGE_SEND_FAILED",
  CONNECTION_CLOSE_FAILED = "CONNECTION_CLOSE_FAILED",
  BRIDGE_ERROR = "BRIDGE_ERROR",
  DOMAIN_VERIFICATION_FAILED = "DOMAIN_VERIFICATION_FAILED",
  DOMAIN_VERIFICATION_TIMEOUT = "DOMAIN_VERIFICATION_TIMEOUT",
  INVALID_PARAMETERS = "INVALID_PARAMETERS",
}

export enum EventType {
  PROOF_GENERATION_CANCELLED = "proof_generation_cancelled",
  REQUEST_REJECTED = "request_rejected",
}

export type OperationType =
  | "mrz_scan"
  | "nfc_scan"
  | "proof_generation"
  | "base_subproof_generation"
  | "face_match"
  | "cloud_prover"
  | "onboarding"
  | "camera_scan"
  | "manual_mrz_entry"
  | "mrz_scan_camera"
  | "mrz_scan_manual"
  | "dsc_subproof"
  | "id_check_subproof"
  | "integrity_check_subproof"
  | "access_request"
  | "disclosure_proofs"

export interface SubOperationTiming {
  time_elapsed_ms: number
  sub_operations?: {
    [key: string]: SubOperationTiming
  }
}

export interface OperationTiming {
  operation_type: OperationType
  time_elapsed_ms: number
  sub_operations?: {
    [key: string]: SubOperationTiming
  }
  metadata?: {
    manual_entry_attempted?: boolean
    scan_attempts?: number
    user_cancelled?: boolean
    document_type?: string
    timeout?: boolean
    circuit_name?: string
    from_cache?: boolean
    retry_count?: number
    completed?: boolean
    last_step?: string
    error_details?: string
    baseproofs_cached?: boolean
    identity_proof_regenerated?: boolean
    face_match_info?: FaceMatchMetrics
  }
}

export interface FaceMatchMetrics {
  cosine_avg_similarity?: number
  cosine_std_dev?: number
  cosine_min?: number
  cosine_max?: number
  pitch_avg?: number
  pitch_std_dev?: number
  pitch_min?: number
  pitch_max?: number
  yaw_avg?: number
  yaw_std_dev?: number
  yaw_min?: number
  yaw_max?: number
  roll_avg?: number
  roll_std_dev?: number
  roll_min?: number
  roll_max?: number
  sample_count?: number
  mode?: "regular" | "strict"
  completed?: boolean
}

export interface ErrorLog {
  device_uuid?: string
  success?: string
  error_type?: ErrorType | EventType | Error
  error_subtype?: ErrorSubType
  id_info?: ID_Info | null
  message: string
  context?: ZKPassportError | string | undefined
  stack?: string
  device_info?: Device_Info | null
  component_stack?: string
  operation_timing?: OperationTiming
}

export interface ID_Info {
  redacted_sod?: string | null
  document_issuer?: string | null
  document_nationality?: string | null
  document_type?: string | null
  document_type_code?: string | null
  document_expiry?: string | null
  issuing_date?: string
  issuing_date_dg12?: string
}

export interface Device_Info {
  device_region?: string | null
  device_model?: string | null
  device_brand?: string | null
  device_model_id?: string | null
  os_name?: string | null
  os_version?: string | null
  os_build_id?: string | null
  os_internal_build_id?: string | null
  os_build_id_android?: string | null
  app_version?: string | null
  device_memory?: number | null
  max_memory_android?: number | null
  is_rooted?: boolean | null
  side_loading?: boolean | null
  real_device?: boolean | null
  cpu_architecture?: string[] | null
  device_year_class?: number | null
}

export interface ErrorContextType {
  error: Error | null
  setError: (error: Error | null) => void
  errorInfo: React.ErrorInfo | null
  setErrorInfo: (errorInfo: React.ErrorInfo | null) => void
  reportError: (
    error: Error,
    errorInfo?: React.ErrorInfo | null,
    passport?: any | null,
    mrz?: string | null,
  ) => Promise<boolean>
  resetCircuitErrorRetry: () => void
  sendErrorToAPI: (errorLog: ErrorLog) => Promise<boolean>
  clearError: () => void
  showErrorOverlay: boolean
  setShowErrorOverlay: (show: boolean) => void
  hasErrorReportingConsent: boolean | null
  setErrorReportingConsent: (consent: boolean) => Promise<void>
  showAutoErrorReportModal: boolean
  setShowAutoErrorReportModal: (show: boolean) => void
  currentErrorLog: ErrorLog | null
  retryProofGeneration: (() => Promise<void>) | null
  setRetryProofGeneration: (retryFn: (() => Promise<void>) | null) => void
  hasRetriedCircuitError: boolean
}

export interface ZKPassportErrorOptions {
  showUser: boolean
}

export class ZKPassportError extends Error {
  public errorType: string
  public errorSubType?: string
  public context?: any
  public options?: ZKPassportErrorOptions

  constructor(
    message: string,
    errorType: string,
    errorSubType?: string,
    context?: any,
    options?: ZKPassportErrorOptions,
  ) {
    super(message)
    this.name = "ZKPassportError"
    this.errorType = errorType
    this.errorSubType = errorSubType
    this.context = context
    this.options = { showUser: true, ...options }

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZKPassportError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorType: this.errorType,
      errorSubType: this.errorSubType,
      context: this.context,
      stack: this.stack,
    }
  }
}

export class MissingCscaError extends ZKPassportError {
  constructor(
    message: string,
    context: {
      nationality?: string
      dsc_certificate?: DSC
      csca_leaf?: bigint
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.MISSING_CSCA, undefined, context, options)
    this.name = "MissingCscaError"
    // Don't show it to user as there is a custom modal for this
    // Otherwise it will show two different modals for the same error
    // The custom one + the generic one
    this.options = { showUser: false, ...options }
  }
}

export enum MissingCscaErrorEnum {
  NOT_FOUND = "We couldn't find the root certificate that signed your ID",
}
export class CloudProverError extends ZKPassportError {
  constructor(
    message: string,
    errorSubType: string,
    context: {
      circuit: string
      vkeys?: string[]
      public_inputs?: any
      cloud_prover_url: string
      response_header?: string
      response_body?: string
      error_details?: any
      operation_timing?: OperationTiming
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.CLOUD_PROVER_ERROR, errorSubType, context, options)
    this.name = "CloudProverError"
  }
}

// context is passed in with the metadata
export class UnsupportedPassportError extends ZKPassportError {
  constructor(message: string, context: any, options?: ZKPassportErrorOptions) {
    super(
      message,
      ErrorType.UNSUPPORTED_PASSPORT,
      UnsupportedPassportErrorSubType.ID_NOT_SUPPORTED,
      context,
      options,
    )
    this.name = "UnsupportedPassportError"
  }
}

export enum UnsupportedPassportErrorSubType {
  ID_NOT_SUPPORTED = "ID_NOT_SUPPORTED",
}

export class CircuitError extends ZKPassportError {
  constructor(
    errorSubType: CircuitErrorSubType,
    message: string,
    context: {
      circuit_name: string
      input_size?: number
      expected_size?: number
      csca_leaf?: bigint
      attempted_circuits?: string[]
      error_details?: any
      operation_timing?: OperationTiming
      facematch_metadata?: any
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.CIRCUIT_ERROR, errorSubType, context, options)
    this.name = "CircuitError"
  }
}

export class NFCScanError extends ZKPassportError {
  constructor(
    message: string,
    errorSubType: NFCScanErrorSubType,
    context: {
      scan_attempts?: number
      document_type?: string
      document_country?: string
      nfc_enabled?: boolean
      error_details?: string
      timeout_duration?: number
      operation_timing?: OperationTiming
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.NFC_SCAN_ERROR, errorSubType, context, options)
    this.name = "NFCScanError"
  }
}

export class MRZReadError extends ZKPassportError {
  constructor(
    message: string,
    errorSubType: MRZReadErrorSubType,
    context: {
      input_method?: "camera" | "manual"
      document_type?: string
      document_country?: string
      checksum_errors?: string[]
      operation_timing?: OperationTiming
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.MRZ_READ_ERROR, errorSubType, context, options)
    this.name = "MRZReadError"
  }
}

export class WebSocketError extends ZKPassportError {
  constructor(
    message: string,
    errorSubType: WebSocketErrorSubType,
    context: {
      domain: string
      error_details?: any
    },
    options?: ZKPassportErrorOptions,
  ) {
    super(message, ErrorType.WEBSOCKET_ERROR, errorSubType, context, options)
    this.name = "WebSocketError"
  }
}

export class EContentLenExceedsMaxError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(
      message || "eContent exceeds max supported length",
      ErrorType.ECONTENT_LEN_EXCEEDS_MAX,
      undefined,
      context,
      options,
    )
    this.name = "EContentLenExceedsMaxError"
  }
}

export class TbsLenExceedsMaxError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(
      message || "TBS exceeds max supported length",
      ErrorType.TBS_LEN_EXCEEDS_MAX,
      undefined,
      context,
      options,
    )
    this.name = "TbsLenExceedsMaxError"
  }
}

export class SignedAttrLenExceedsMaxError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(
      message || "SignedAttr exceeds max supported length",
      ErrorType.SIGNEDATTR_LEN_EXCEEDS_MAX,
      undefined,
      context,
      options,
    )
    this.name = "SignedAttrLenExceedsMaxError"
  }
}

export class AppAttestNotSupportedError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(
      message || "App Attest is not supported",
      ErrorType.APP_ATTEST_NOT_SUPPORTED,
      undefined,
      context,
      options,
    )
    this.name = "AppAttestNotSupportedError"
  }
}

export class CommitmentMismatchError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(
      message || "Commitment mismatch",
      ErrorType.COMMITMENT_MISMATCH,
      undefined,
      context,
      options,
    )
    this.name = "CommitmentMismatchError"
  }
}

export class SanctionsFailedError extends ZKPassportError {
  constructor(message?: string, context?: any, options?: ZKPassportErrorOptions) {
    super(message || "Sanctions failed", ErrorType.SANCTIONS_FAILED, undefined, context, options)
    this.name = "SanctionsFailedError"
  }
}
