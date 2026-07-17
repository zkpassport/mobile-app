import React, { createContext, useState, useContext, useEffect, ReactNode } from "react"
import { Alert } from "react-native"
import { setJSExceptionHandler, setNativeExceptionHandler } from "react-native-exception-handler"
import RNRestart from "react-native-restart"
import { useTranslation } from "react-i18next"
import {
  ErrorContextType,
  ErrorLog,
  MissingCscaError,
  ZKPassportError,
  EventType,
  ErrorType,
  ErrorSubType,
} from "@/types/Error"
import {
  clearProofMemoryCrashData,
  getDeviceMetadata,
  getIDMetadata,
  shouldAutoReportError,
  truncateToLines,
} from "@/lib/errorUtils"
import { sendAnonymousMetadata } from "@/lib"
import { type PassportViewModel } from "@zkpassport/utils"
import { useStorage } from "@/context/StorageContext"
import { AlertModal, ErrorOverlay } from "@/components/Modals"
import { reportDiagnostics, sendDiagnostics } from "@/services/EventReportingService"

interface ErrorProviderProps {
  children: ReactNode
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined)

export const useError = () => {
  const context = useContext(ErrorContext)
  if (context === undefined) {
    throw new Error("useError must be used within an ErrorProvider")
  }
  return context
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const { t } = useTranslation()
  const storage = useStorage()
  const [error, setError] = useState<Error | null>(null)
  const [errorInfo, setErrorInfo] = useState<React.ErrorInfo | null>(null)
  const [showErrorOverlay, setShowErrorOverlay] = useState<boolean>(false)
  const [currentErrorLog, setCurrentErrorLog] = useState<ErrorLog | null>(null)
  const [hasErrorReportingConsent, setHasErrorReportingConsent] = useState<boolean | null>(null)
  const [showAutoErrorReportModal, setShowAutoErrorReportModal] = useState<boolean>(false)
  const [autoReportedError, setAutoReportedError] = useState<string | null>(null)
  const [isReportingError, setIsReportingError] = useState<boolean>(false)
  const retryProofGenerationRef = React.useRef<(() => Promise<void>) | null>(null)
  const [deviceUUID, setDeviceUUID] = useState<string | null>(null)
  const hasRetriedCircuitErrorRef = React.useRef<boolean>(false)

  // Helper function to store error logs locally
  const storeErrorLocally = async (errorLog: ErrorLog) => {
    try {
      const existingLogs = await storage.getItem("errorLogs")
      const logs = existingLogs ? JSON.parse(existingLogs) : []
      logs.push(errorLog)

      // Keep only the last 20 errors to avoid storage issues
      const trimmedLogs = logs.slice(-20)
      await storage.setItem("errorLogs", JSON.stringify(trimmedLogs))
    } catch (storageError) {
      console.error("Failed to store error locally: " + storageError)
    }
  }

  // helper to get the device UUID
  const getDeviceUUID = async () => {
    const uuid = await storage.getItem("deviceUuid")
    if (!uuid) {
      console.log("Device UUID not found")
    }
    return uuid
  }

  // effect that runs when an error occurs
  useEffect(() => {
    const fetchDeviceUUID = async () => {
      const uuid = await getDeviceUUID()
      if (uuid) {
        setDeviceUUID(uuid)
      }
    }
    fetchDeviceUUID()
  }, [error])

  const clearError = () => {
    setError(null)
    setErrorInfo(null)
    setShowErrorOverlay(false)
    setIsReportingError(false)
    clearProofMemoryCrashData(storage)
    // Don't reset hasRetriedCircuitError here - it should persist until successful operation
  }

  // Load consent preference on mount
  useEffect(() => {
    loadErrorReportingConsent()
  }, [])

  const loadErrorReportingConsent = async () => {
    try {
      const consent = await storage.getItem("errorReportingConsent")
      setHasErrorReportingConsent(consent === "enabled")
    } catch (error) {
      console.error("Error loading error reporting consent: " + error)
      setHasErrorReportingConsent(false)
    }
  }

  const setErrorReportingConsent = async (consent: boolean) => {
    try {
      await storage.setItem("errorReportingConsent", consent ? "enabled" : "disabled")
      setHasErrorReportingConsent(consent)
    } catch (error) {
      console.error("Error saving error reporting consent: " + error)
    }
  }

  // Helper function to get metadata for error and success logs
  const getMetadata = async (currentPassport?: PassportViewModel, mrz?: string | null) => {
    const [{ id_info }, { device_info, deviceUuid }] = await Promise.all([
      getIDMetadata(currentPassport, mrz),
      getDeviceMetadata(storage),
    ])
    return { id_info, device_info, deviceUuid }
  }

  // Helper function to enrich error log with metadata in background (non-blocking)
  const sendErrorInBackground = async (
    basicErrorLog: ErrorLog,
    currentPassport?: PassportViewModel,
    mrz?: string | null,
    error?: Error,
  ) => {
    try {
      // Async metadata gathering happens in background
      const { id_info, device_info, deviceUuid } = await getMetadata(currentPassport, mrz)

      const enrichedLog: ErrorLog = {
        ...basicErrorLog,
        device_uuid: deviceUuid || undefined,
        id_info: id_info || null,
        device_info: device_info || null,
      }

      reportDiagnostics(enrichedLog)

      // Send anonymous metadata for CSCA errors (fire and forget)
      if (error instanceof MissingCscaError && currentPassport) {
        sendAnonymousMetadata(currentPassport)
      }

      // Show success modal on UI thread
      setAutoReportedError(error?.message || "")
      setShowAutoErrorReportModal(true)
    } catch (error) {
      console.log("Background error enrichment failed:", error)
    }
  }

  // Function to report errors - NON-BLOCKING with fast/slow paths
  const reportError = async (
    error: Error,
    errorInfo: React.ErrorInfo | null = null,
    currentPassport?: PassportViewModel,
    mrz?: string | null,
  ): Promise<boolean> => {
    // Prevent infinite loops by checking if we're already reporting an error
    if (isReportingError) {
      console.log("Already reporting an error, skipping to prevent infinite loop")
      return false
    }

    setIsReportingError(true)

    try {
      // FAST PATH: Synchronous operations only (critical for UI responsiveness)
      const errorMessage = typeof error === "string" ? error : error.message

      // Extract timing data from ZKPassportError context
      let operationTiming = undefined
      if (error instanceof ZKPassportError && error.context?.timing) {
        operationTiming = error.context.timing
      }

      // Create basic error log without metadata (fast)
      const basicErrorLog: ErrorLog = {
        success: "false",
        message: errorMessage,
        context: (error as ZKPassportError).context || undefined,
        stack: typeof error === "string" ? undefined : error.stack,
        error_type: (error as ZKPassportError).errorType as
          | ErrorType
          | EventType
          | Error
          | undefined,
        error_subtype: (error as ZKPassportError).errorSubType as ErrorSubType | undefined,
        component_stack: errorInfo?.componentStack || undefined,
        operation_timing: operationTiming,
        device_uuid: undefined, // Will be enriched in background
        id_info: null, // Will be enriched in background
        device_info: null, // Will be enriched in background
      }

      console.log("Error being reported - Basic Log:", basicErrorLog)

      // Store error locally (fast, no network)
      await storeErrorLocally(basicErrorLog)

      // Store the current error log for potential API reporting
      setCurrentErrorLog(basicErrorLog)

      // Handle circuit errors with auto-retry
      if (
        basicErrorLog?.error_type === ErrorType.CIRCUIT_ERROR ||
        basicErrorLog?.error_type === ErrorType.COMMITMENT_MISMATCH ||
        basicErrorLog?.error_type === ErrorType.CLOUD_PROVER_ERROR
      ) {
        // If this is the first CircuitError or CommitmentMismatchError, auto-retry
        if (!hasRetriedCircuitErrorRef.current) {
          console.log("First CircuitError detected - auto-retrying...")
          hasRetriedCircuitErrorRef.current = true
          clearError()

          // Execute retry if available
          if (retryProofGenerationRef.current) {
            await retryProofGenerationRef.current()
          }
          setIsReportingError(false)
          return false
        }
      }

      // Check state first, then fallback to AsyncStorage if state is null
      let shouldAutoReport = await shouldAutoReportError(hasErrorReportingConsent, storage)

      if (shouldAutoReport) {
        // SLOW PATH: Fire and forget - metadata gathering + API call in background
        sendErrorInBackground(basicErrorLog, currentPassport, mrz, error)

        setIsReportingError(false)
        return true // Error will be reported in background
      } else {
        // If auto-reporting is disabled, show appropriate error modal based on error type
        setError(error)
        setErrorInfo(errorInfo)
        // Only show error to user if error is not instance of ZKPassportError or
        // if error is instance of ZKPassportError and options.showUser is true
        if (
          !(error instanceof ZKPassportError) ||
          (error instanceof ZKPassportError && (error as ZKPassportError).options?.showUser)
        ) {
          setShowErrorOverlay(true)
        }
      }

      setIsReportingError(false)
      return false // Error was not automatically reported
    } catch (reportingError) {
      console.error("Error while reporting error: " + reportingError)
      setIsReportingError(false)
      return false // Error occurred during reporting
    }
  }

  // Called on successful proof generation so the next circuit error auto-retries again.
  const resetCircuitErrorRetry = () => {
    hasRetriedCircuitErrorRef.current = false
  }

  // Function to send the current error to API (called by user confirmation or if consent is enabled)
  const sendErrorToAPI = async (errorLog: ErrorLog): Promise<boolean> => {
    if (!errorLog) {
      return false
    }
    return sendDiagnostics(errorLog)
  }

  // Set up global JS error handler
  useEffect(() => {
    const jsExceptionHandler = async (error: Error, isFatal: boolean) => {
      // Update error state
      setError(error)

      // Report error and check if it was automatically sent
      // cannot pass in the passport here because it's not yet saved, or available in this context
      // TODO: Consider if there's a better way to handle this and always pass in the passport if available
      const wasAutoReported = await reportError(error)

      // Only show error overlay if the error wasn't automatically reported
      if (!wasAutoReported) {
        setShowErrorOverlay(true)
      }

      // For non-fatal errors, we just show the error UI
      // For fatal errors, we show an alert and then restart the app
      if (isFatal) {
        Alert.alert(
          t("errorTitle"),
          t("errorMessage"),
          [
            {
              text: t("restart"),
              onPress: () => RNRestart.Restart(),
            },
          ],
          { cancelable: false },
        )
      }
    }

    // Set up JS exception handler
    setJSExceptionHandler(jsExceptionHandler, true)

    // Set up native exception handler
    setNativeExceptionHandler(
      async (exceptionString) => {
        // Native exceptions can only be logged - the app will restart automatically
        const nativeError = new Error(`Native Exception: ${exceptionString}`)
        console.log("hasErrorReportingConsent, nativeexception: " + hasErrorReportingConsent)

        // Report the native error (this will handle consent checking and modal display)
        await reportError(nativeError)
      },
      true,
      false,
    )

    return () => {
      // No cleanup needed for exception handlers
    }
  }, [t])

  const setRetryProofGeneration = (fn: (() => Promise<void>) | null) => {
    retryProofGenerationRef.current = fn
  }

  return (
    <ErrorContext.Provider
      value={{
        error,
        setError,
        errorInfo,
        setErrorInfo,
        reportError,
        resetCircuitErrorRetry,
        sendErrorToAPI,
        clearError,
        showErrorOverlay,
        setShowErrorOverlay,
        hasErrorReportingConsent,
        setErrorReportingConsent,
        showAutoErrorReportModal,
        setShowAutoErrorReportModal,
        currentErrorLog,
        retryProofGeneration: retryProofGenerationRef.current,
        setRetryProofGeneration,
        hasRetriedCircuitError: hasRetriedCircuitErrorRef.current,
      }}
    >
      {children}
      <ErrorOverlay deviceUUID={deviceUUID || ""} />
      <AlertModal
        visible={
          showAutoErrorReportModal &&
          (((error as ZKPassportError)?.errorType !== ErrorType.CIRCUIT_ERROR &&
            (error as ZKPassportError)?.errorType !== ErrorType.COMMITMENT_MISMATCH &&
            (error as ZKPassportError)?.errorType !== ErrorType.CLOUD_PROVER_ERROR) ||
            hasRetriedCircuitErrorRef.current)
        }
        onClose={() => {
          setShowAutoErrorReportModal(false)
          setAutoReportedError(null)
        }}
        onAccept={() => {
          setShowAutoErrorReportModal(false)
          setAutoReportedError(null)
        }}
        icon={require("@/assets/images/zkpassport-logo.png")}
        iconSize={50}
        title={t("modals.errorReport.title")}
        disclaimer={truncateToLines(autoReportedError || "")}
        description={t("modals.errorReport.description")}
        buttonText={t("modals.errorReport.dismiss")}
      />
    </ErrorContext.Provider>
  )
}

export default ErrorProvider
