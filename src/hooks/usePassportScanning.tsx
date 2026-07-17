import { useState, useCallback, useRef, useEffect } from "react"
import { Platform, AppState } from "react-native"
import MrzScanService from "@/services/MrzScanService"
import NfcScanService, { NfcErrorType } from "@/services/NfcScanService"
import { PassportViewModel } from "@zkpassport/utils"
import { createMRZReadError, createNFCScanError } from "@/lib/errorUtils"
import { MRZReadErrorSubType } from "@/types/Error"
import { waitForBiometricMessage } from "@/lib/permissions"
import { DocumentType } from "@/types/DocumentInfo"
import { createOperationTimer, OperationTimer } from "@/services/TimingService"
import { ScanPassportNavigationStep } from "@/components/ScanPassportView"
import { reportEvent } from "@/services/EventReportingService"

interface UseScanningOptions {
  maxNfcAttempts?: number
  onMrzSuccess?: (mrz: string, documentType: string) => void
  onNfcSuccess?: (passport: PassportViewModel, unsupportedId?: boolean) => void
  reportError?: (error: Error, errorInfo?: any, passport?: any, mrz?: string) => Promise<boolean>
  initialStep?: ScanPassportNavigationStep
}

const MAX_NFC_ATTEMPTS = 3

export function usePassportScanning(options: UseScanningOptions = {}) {
  const { maxNfcAttempts = MAX_NFC_ATTEMPTS, initialStep = "CHOOSE_ID_TYPE" } = options
  // State
  const [isScanning, setIsScanning] = useState(false)
  const [currentStep, setCurrentStep] = useState<ScanPassportNavigationStep>(initialStep)
  // The unmount cleanup below captures state from the first render, so it reads this ref instead
  const currentStepRef = useRef(currentStep)
  currentStepRef.current = currentStep
  const [mrz, setMrz] = useState<string | null>(null)
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.PASSPORT)
  const [nfcAttempts, setNfcAttempts] = useState(0)
  const [lastError, setLastError] = useState<Error | null>(null)
  const [showNfcDisabledModal, setShowNfcDisabledModal] = useState(false)
  const [pendingNfcScan, setPendingNfcScan] = useState(false)
  const [showMrzTimeoutModal, setShowMrzTimeoutModal] = useState(false)
  const mrzService = useRef(MrzScanService.getInstance())
  const nfcService = useRef(NfcScanService.getInstance())

  // Set up error reporting if provided
  useEffect(() => {
    if (options.reportError) {
      mrzService.current.setErrorReporting(options.reportError)
    }
  }, [options.reportError])
  // Timing refs
  const onboardingTimerRef = useRef<OperationTimer | null>(null)
  const mrzTimerRef = useRef<OperationTimer | null>(null)
  const nfcTimerRef = useRef<OperationTimer | null>(null)
  const manualMrzTimerRef = useRef<OperationTimer | null>(null)

  // Initialize onboarding timer
  const initializeOnboardingTimer = useCallback(() => {
    onboardingTimerRef.current = createOperationTimer("onboarding")

    // Start timing for initial step
    if (initialStep === "GET_READY_TO_SCAN" && onboardingTimerRef.current) {
      onboardingTimerRef.current.startSubOperation("mrz_scan")
      onboardingTimerRef.current.startNestedSubOperation("mrz_scan", "time_on_step1")
    } else if (initialStep === "PREPARE_ID" && onboardingTimerRef.current) {
      onboardingTimerRef.current.startSubOperation("nfc_scan")
      onboardingTimerRef.current.startNestedSubOperation("nfc_scan", "time_on_step2")
    }
  }, [initialStep])

  useEffect(() => {
    return () => {
      // Report flow exit if timer is still running
      if (onboardingTimerRef.current?.isRunning()) {
        const timing = onboardingTimerRef.current.end()
        reportEvent(
          "onboarding_flow_exit",
          {
            last_step: currentStepRef.current,
          },
          null,
          { operationTiming: timing },
        )
      }
    }
  }, [])
  const scanMrz = useCallback(
    async (documentType: DocumentType) => {
      // Start MRZ scan timer
      mrzTimerRef.current = createOperationTimer("mrz_scan")

      // End time on step1 when camera scan actually starts
      if (onboardingTimerRef.current) {
        // Only end time_on_step1 if it exists (i.e., we started on STEP1)
        try {
          onboardingTimerRef.current.endNestedSubOperation("mrz_scan", "time_on_step1")
        } catch (e) {
          // this will happen if we started on STEP2 (never)
          console.warn(e, "time_on_step1 does not exist")
        }
        onboardingTimerRef.current.startNestedSubOperation("mrz_scan", "camera_scan")
      }

      try {
        setIsScanning(true)
        setLastError(null)
        const result = await mrzService.current.scan({ documentType: documentType })

        // Note: duplicate and expiry checks are now done after user confirms MRZ in ManualMRZEditor
        // if (result.mrz) {
        //   const isDuplicate = await mrzService.current.isDuplicateMrz(result.mrz, getMrzs)
        //   if (isDuplicate) {
        //     return { success: false, isDuplicate: true }
        //   }

        //   // Check if the ID is expired
        //   // TODO: could pass in the expiry from the parsed data in the object instead
        //   const isExpired = mrzService.current.isExpired(result.mrz)
        //   if (isExpired) {
        //     return { success: false, isExpired: true }
        //   }
        // }

        // End MRZ timer
        const mrzTiming = mrzTimerRef.current?.end()
        if (mrzTiming) {
          mrzTiming.metadata = {
            manual_entry_attempted: false,
            scan_attempts: 1,
            document_type: result.documentType || documentType,
          }
        }

        if (result.success && result.parsedData) {
          // End camera scan and MRZ scan sub-operation in onboarding timer
          if (onboardingTimerRef.current) {
            try {
              onboardingTimerRef.current.endNestedSubOperation("mrz_scan", "camera_scan")
            } catch (e) {
              // this should never happen
              console.warn(e, "camera_scan does not exist")
            }
            onboardingTimerRef.current.endSubOperation("mrz_scan")
            // Start NFC scan and time on step2
            onboardingTimerRef.current.startSubOperation("nfc_scan")
            onboardingTimerRef.current.startNestedSubOperation("nfc_scan", "time_on_step2")
          }

          reportEvent(
            "mrz_scan_succeeded",
            {
              manual_entry: false,
              document_type: result.documentType || documentType,
            },
            null,
            { mrz: result.mrz, operationTiming: mrzTiming },
          )

          setMrz(result.mrz!)
          setDocumentType(result.documentType || DocumentType.OTHER)
          setCurrentStep("PREPARE_ID")
          if (options.onMrzSuccess) {
            options.onMrzSuccess(result.mrz!, result.documentType || DocumentType.OTHER)
          }
          return { success: true, mrz: result.mrz, timing: mrzTiming }
        } else if (result.isCancelled) {
          return { success: false, cancelled: true, timing: mrzTiming }
        } else if (result.isTimeout) {
          // Show timeout modal
          setShowMrzTimeoutModal(true)
          reportEvent(
            "mrz_scan_failed",
            {
              error_code: MRZReadErrorSubType.TIMEOUT,
              document_type: documentType,
            },
            null,
            { operationTiming: mrzTiming },
          )
          return { success: false, timeout: true, timing: mrzTiming }
        } else {
          setLastError(result.error || new Error("MRZ scan failed"))
          reportEvent(
            "mrz_scan_failed",
            {
              document_type: documentType,
              error_code: result.error?.errorSubType ?? MRZReadErrorSubType.SCAN_FAILED,
            },
            null,
            { operationTiming: mrzTiming },
          )
          return { success: false, error: result.error, timing: mrzTiming }
        }
      } catch (error) {
        console.warn(error, "MRZ scan failed")
        const mrzError = createMRZReadError(null, false, false)
        setLastError(mrzError)
        const mrzTiming = mrzTimerRef.current?.end()
        reportEvent(
          "mrz_scan_failed",
          {
            document_type: documentType,
            error_code: mrzError.errorSubType ?? MRZReadErrorSubType.SCAN_FAILED,
          },
          null,
          { operationTiming: mrzTiming },
        )
        return { success: false, error: mrzError, timing: mrzTiming }
      } finally {
        setIsScanning(false)
      }
    },
    [options, documentType],
  )

  // Scan NFC
  const scanNfc = useCallback(
    async (mrzOverride?: string) => {
      const mrzToUse = mrzOverride || mrz
      if (!mrzToUse) {
        throw new Error("MRZ is required for NFC scan")
      }

      // Start NFC scan timer
      nfcTimerRef.current = createOperationTimer("nfc_scan")
      const nfcStartedAtMs = Date.now()
      nfcTimerRef.current.addMetadata({
        scan_attempts: nfcAttempts + 1,
        document_type: documentType,
      })

      // End time on step2 and start actual NFC chip scan timing
      if (onboardingTimerRef.current) {
        try {
          onboardingTimerRef.current.endNestedSubOperation("nfc_scan", "time_on_step2")
        } catch (e) {
          // this will happen if we came from manual entry
          console.warn(e, "time_on_step2 does not exist")
        }
        onboardingTimerRef.current.startNestedSubOperation("nfc_scan", "nfc_chip_scan")
      }

      try {
        setIsScanning(true)
        setLastError(null)
        // Check biometric permission
        const canContinue = await waitForBiometricMessage()
        if (!canContinue) {
          const nfcTiming = nfcTimerRef.current?.end()
          return { success: false, error: "Permission denied", timing: nfcTiming }
        }
        // Check NFC enabled
        if (Platform.OS === "android") {
          const isEnabled = await nfcService.current.checkNFCEnabled()
          if (!isEnabled) {
            setShowNfcDisabledModal(true)
            setPendingNfcScan(true)
            const error = createNFCScanError("NFC is disabled", documentType)
            setLastError(error)
            const nfcTiming = nfcTimerRef.current?.end()
            return { success: false, error, nfcDisabled: true, timing: nfcTiming }
          }
        }

        // Scan NFC
        const result = await nfcService.current.scanWithResult(mrzToUse)

        // End NFC timer
        const nfcTiming = nfcTimerRef.current?.end()
        if (nfcTiming) {
          nfcTiming.metadata = {
            ...nfcTiming.metadata,
            from_cache: false,
          }
        }

        if (result.success && result.passport) {
          // End NFC chip scan and NFC scan sub-operation in onboarding timer
          if (onboardingTimerRef.current) {
            try {
              onboardingTimerRef.current.endNestedSubOperation("nfc_scan", "nfc_chip_scan")
            } catch (e) {
              // this should never happen
              console.warn(e, "nfc_chip_scan does not exist")
            }
            onboardingTimerRef.current.endSubOperation("nfc_scan")
          }

          // End the onboarding timer so the flow does not count as an exit on unmount
          const onboardingTiming = onboardingTimerRef.current?.end()

          setNfcAttempts(0)
          let idSupported = false
          if (result.passport) {
            idSupported = await nfcService.current.IDSupported(result.passport)
            if (!idSupported) {
              reportEvent(
                "unsupported_id_detected",
                {
                  document_type: documentType,
                },
                null,
                { passport: result.passport, operationTiming: nfcTiming },
              )

              // Call success callback with unsupportedId flag
              if (options.onNfcSuccess) {
                options.onNfcSuccess(result.passport, true)
              }

              return {
                success: true,
                passport: result.passport,
                unsupportedId: true,
                timing: nfcTiming,
              }
            }
          }
          reportEvent(
            "nfc_scan_succeeded",
            {
              duration_ms: Date.now() - nfcStartedAtMs,
              attempt_number: nfcAttempts + 1,
              document_type: documentType,
            },
            null,
            { passport: result.passport, operationTiming: onboardingTiming },
          )

          if (options.onNfcSuccess) {
            options.onNfcSuccess(result.passport)
          }

          return { success: true, passport: result.passport, timing: nfcTiming }
        } else {
          setNfcAttempts((prev) => prev + 1)

          // A user cancel is a user action, not a scan failure, so it is not reported.
          if (result.errorType && result.errorType !== NfcErrorType.USER_CANCELLED) {
            reportEvent(
              "nfc_scan_failed",
              {
                attempt_number: nfcAttempts + 1,
                document_type: documentType,
                error_code: result.errorType,
              },
              null,
              { mrz: mrzToUse, operationTiming: nfcTiming },
            )
          }

          // Handle different error types
          if (result.errorType === NfcErrorType.USER_CANCELLED) {
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                user_cancelled: true,
              }
            }
            return { success: false, cancelled: true, timing: nfcTiming }
          } else if (result.errorType === NfcErrorType.MRZ_AUTH_FAILED) {
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                error_details: "mrz_authentication_failed",
              }
            }
            const error = createMRZReadError(
              mrzToUse,
              true,
              false,
              documentType,
              undefined,
              nfcTiming,
            )
            setLastError(error)
            setCurrentStep("GET_READY_TO_SCAN")
            setNfcAttempts(0)
            return { success: false, error, mrzError: true, timing: nfcTiming }
          } else if (result.errorType === NfcErrorType.TIMEOUT) {
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                error_details: "nfc_timeout",
              }
            }
            const error = createNFCScanError(
              result.error || "NFC timeout",
              documentType,
              undefined,
              nfcAttempts >= maxNfcAttempts - 1,
              nfcTiming,
            )
            setLastError(error)

            if (nfcAttempts >= maxNfcAttempts - 1) {
              setNfcAttempts(0)
            }

            return {
              success: false,
              error,
              isTimeout: true,
              canRetry: nfcAttempts < maxNfcAttempts - 1,
              timing: nfcTiming,
            }
          } else if (result.errorType === NfcErrorType.NFC_SYSTEM_FAILURE) {
            // Critical NFC system failure - no retry possible, device restart required
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                error_details: "nfc_system_failure",
              }
            }
            const error = createNFCScanError(
              result.error || "NFC system failure",
              documentType,
              undefined,
              true, // Mark as final error
              nfcTiming,
            )
            setLastError(error)
            setNfcAttempts(0)

            return {
              success: false,
              error,
              nfcSystemFailure: true,
              canRetry: false,
              timing: nfcTiming,
            }
          } else if (result.errorType === NfcErrorType.WIFI_INTERFERENCE) {
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                error_details: "wifi_interference",
              }
            }
            const error = createNFCScanError(
              result.error || "WiFi interference",
              documentType,
              undefined,
              true,
              nfcTiming,
            )
            setLastError(error)
            setNfcAttempts(0)
            return {
              success: false,
              error,
              wifiInterference: true,
              canRetry: false,
              timing: nfcTiming,
            }
          } else {
            if (nfcTiming) {
              nfcTiming.metadata = {
                ...nfcTiming.metadata,
                error_details: result.error || "unknown",
                retry_count: nfcAttempts,
              }
            }
            const error = createNFCScanError(
              result.error || "NFC scan failed",
              documentType,
              undefined,
              nfcAttempts >= maxNfcAttempts - 1,
              nfcTiming,
            )
            setLastError(error)

            if (nfcAttempts >= maxNfcAttempts - 1) {
              setNfcAttempts(0)
              // Don't prompt user to report error on max attempts
              // Error reporting should only happen automatically if enabled
            }

            return {
              success: false,
              error,
              canRetry: nfcAttempts < maxNfcAttempts - 1,
              timing: nfcTiming,
            }
          }
        }
      } catch (error) {
        const nfcTiming = nfcTimerRef.current?.end()
        const nfcError = createNFCScanError(
          String(error),
          documentType,
          undefined,
          false,
          nfcTiming,
        )
        setLastError(nfcError)
        reportEvent(
          "nfc_scan_failed",
          {
            attempt_number: nfcAttempts + 1,
            document_type: documentType,
            error_code: NfcErrorType.GENERIC_ERROR,
          },
          null,
          { mrz: mrzToUse, operationTiming: nfcTiming },
        )
        return { success: false, error: nfcError, timing: nfcTiming }
      } finally {
        setIsScanning(false)
      }
    },
    [mrz, documentType, nfcAttempts, maxNfcAttempts, options],
  )
  // Cancel scan
  const cancelScan = useCallback(async () => {
    setIsScanning(false)
    await nfcService.current.cancel()
  }, [])
  // Reset state
  const reset = useCallback(() => {
    setIsScanning(false)
    setCurrentStep("CHOOSE_ID_TYPE")
    setMrz(null)
    setDocumentType(DocumentType.PASSPORT)
    setNfcAttempts(0)
    setLastError(null)
    setShowNfcDisabledModal(false)
    setPendingNfcScan(false)
  }, [])
  // Monitor NFC state changes when app comes to foreground
  useEffect(() => {
    if (!showNfcDisabledModal || Platform.OS !== "android") return
    const handleAppStateChange = async (newAppState: string) => {
      if (newAppState === "active") {
        const isNfcEnabled = await nfcService.current.checkNFCEnabled()
        if (isNfcEnabled) {
          setShowNfcDisabledModal(false)
          // If there was a pending scan, retry it
          if (pendingNfcScan && mrz) {
            setPendingNfcScan(false)
            // Trigger a rescan - the component should handle this
          }
        }
      }
    }
    const subscription = AppState.addEventListener("change", handleAppStateChange)
    return () => subscription.remove()
  }, [showNfcDisabledModal, pendingNfcScan, mrz])
  // Manual MRZ entry timing functions
  const startManualMrzEntry = useCallback(() => {
    manualMrzTimerRef.current = createOperationTimer("mrz_scan")
    manualMrzTimerRef.current.addMetadata({
      manual_entry_attempted: true,
    })

    // Start manual MRZ sub-operation in onboarding timer
    if (onboardingTimerRef.current) {
      // Ensure mrz_scan sub-operation exists
      if (!onboardingTimerRef.current.hasSubOperation("mrz_scan")) {
        onboardingTimerRef.current.startSubOperation("mrz_scan")
      }

      // End camera scan timing if it was running
      try {
        onboardingTimerRef.current.endNestedSubOperation("mrz_scan", "camera_scan")
      } catch (e) {
        // this will happen if manual entry was clicked before scan started
        console.warn(e, "camera_scan does not exist")
      }

      // End time_on_step1 if it was running
      try {
        onboardingTimerRef.current.endNestedSubOperation("mrz_scan", "time_on_step1")
      } catch (e) {
        // this will happen if we started on STEP2 (never)
        console.warn(e, "time_on_step1 does not exist")
      }

      onboardingTimerRef.current.startNestedSubOperation("mrz_scan", "manual_mrz_entry")
    }
  }, [])

  const endManualMrzEntry = useCallback(
    (success: boolean) => {
      let manualMrzTiming = null
      if (manualMrzTimerRef.current) {
        manualMrzTiming = manualMrzTimerRef.current.end()
        manualMrzTimerRef.current = null
      }

      // End manual MRZ sub-operation in onboarding timer
      if (onboardingTimerRef.current) {
        try {
          onboardingTimerRef.current.endNestedSubOperation("mrz_scan", "manual_mrz_entry")
        } catch (e) {
          // this will happen if manual entry was clicked before scan started
          console.warn(e, "manual_mrz_entry does not exist")
        }
      }

      if (success && onboardingTimerRef.current) {
        onboardingTimerRef.current.endSubOperation("mrz_scan")
        // Start NFC scan and time on step2
        onboardingTimerRef.current.startSubOperation("nfc_scan")
        onboardingTimerRef.current.startNestedSubOperation("nfc_scan", "time_on_step2")
      }

      return manualMrzTiming
    },
    [options],
  )

  return {
    // State
    isScanning,
    currentStep,
    mrz,
    documentType,
    nfcAttempts,
    lastError,
    showNfcDisabledModal,
    pendingNfcScan,
    showMrzTimeoutModal,
    // Actions
    scanMrz,
    scanNfc,
    cancelScan,
    reset,
    initializeOnboardingTimer,
    // Timing functions
    startManualMrzEntry,
    endManualMrzEntry,
    // Utilities
    openNfcSettings: () => nfcService.current.goToNfcSetting(),
    setDocumentType,
    setMrz,
    setShowNfcDisabledModal,
    setPendingNfcScan,
    setShowMrzTimeoutModal,
    setCurrentStep,
  }
}
