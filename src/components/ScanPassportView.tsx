import React, { useState, useEffect, useCallback, useRef } from "react"
import { View, Platform, StyleSheet, Text } from "react-native"
import { useSettings } from "@/context/SettingsContext"
import NFCModalView from "@/components/NFCModalView"
import { PassportReaderEvent } from "@/types"
import { checkCameraPermission } from "@/lib/permissions"
import { useError } from "@/context/ErrorContext"
import { createMRZReadError } from "@/lib/errorUtils"
import { AlertModal, CheckPassportModal } from "@/components/Modals"
import { NFC_MAX_ATTEMPTS } from "@/lib/constants"
import MrzScanService from "@/services/MrzScanService"
import { usePassportScanning } from "@/hooks/usePassportScanning"
import { PassportViewModel } from "@zkpassport/utils"
import { DocumentType } from "@/types/DocumentInfo"
import { ErrorLog } from "@/types/Error"
import { reportEvent } from "@/services/EventReportingService"
import NfcScanService from "@/services/NfcScanService"
import EventPage, { EventPageType } from "@/components/Info/EventPage"
import { PrepareIDView, ChooseIDTypeView, GetReadyToScan, ManualMRZEditor } from "./ScanPassport"
import { Trans, useTranslation } from "react-i18next"

export type ScanPassportNavigationStep =
  | "CHOOSE_ID_TYPE"
  | "GET_READY_TO_SCAN"
  | "MRZ_SUCCESS"
  | "PREPARE_ID"
  | "NFC_CHIP_SCAN_FAIL"
  | "NFC_SUCCESS"
  | "ID_NOT_SUPPORTED"
  | "EXPIRED_ID"
  | "CHIP_NOT_DETECTED"
  | "DOC_NOT_SUPPORTED"

type NFCModalContent = {
  titleKey: string
  descriptionKey: string
  attempt: number
}

const NFC_MODAL_CONTENT: NFCModalContent[] = [
  {
    titleKey: "scanning.nfcRetry.attempt1.title",
    descriptionKey: "scanning.nfcRetry.attempt1.description",
    attempt: 1,
  },
  {
    titleKey: "scanning.nfcRetry.attempt2.title",
    descriptionKey: "scanning.nfcRetry.attempt2.description",
    attempt: 2,
  },
  {
    titleKey: "scanning.nfcRetry.attempt3.title",
    descriptionKey: "scanning.nfcRetry.attempt3.description",
    attempt: 3,
  },
]

const NFC_TIMEOUT_MODAL_CONTENT: NFCModalContent[] = [
  {
    titleKey: "scanning.nfcTimeout.attempt1.title",
    descriptionKey: "scanning.nfcTimeout.attempt1.description",
    attempt: 1,
  },
  {
    titleKey: "scanning.nfcTimeout.attempt2.title",
    descriptionKey: "scanning.nfcTimeout.attempt2.description",
    attempt: 2,
  },
  {
    titleKey: "scanning.nfcTimeout.attempt3.title",
    descriptionKey: "scanning.nfcTimeout.attempt3.description",
    attempt: 3,
  },
]

const ScanPassportView = ({
  initialStep,
  onFinish,
  onCancel,
}: {
  initialStep: ScanPassportNavigationStep
  onFinish: () => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  const { savePassport, getMrzs, getMasterKey } = useSettings()
  const { reportError } = useError()
  const mrzService = MrzScanService.getInstance()
  const nfcService = NfcScanService.getInstance()

  const [scannedPassport, setScannedPassport] = useState<PassportViewModel | null>(null)
  const [passportSaved, setPassportSaved] = useState(false)
  const [shouldContinue, setShouldContinue] = useState(false)
  const [isUnsupportedId, setIsUnsupportedId] = useState(false)
  const [savingId, setSavingId] = useState(false)
  const savingIDRef = useRef(false)

  const handleOnNFCSuccess = async (passport: PassportViewModel, unsupportedId?: boolean) => {
    // Store passport and show success page first
    setScannedPassport(passport)
    setIsUnsupportedId(!!unsupportedId)
    if (unsupportedId) {
      setCurrentStep("ID_NOT_SUPPORTED")
    } else {
      setCurrentStep("NFC_SUCCESS")
    }
  }

  const handleNfcSuccessPageInit = async () => {}

  const handleNfcSuccessPageContinue = async () => {
    if (savingIDRef.current) {
      return
    }

    // Check if ID was saved and allow the flow to continue
    if (scannedPassport) {
      if (!passportSaved) {
        setSavingId(true)
        savingIDRef.current = true
        // Check if the master key is defined to avoid trying to save the ID if it's undefined
        const masterKey = await getMasterKey()
        if (!masterKey) {
          // Block the continue button action if the master key is undefined
          console.log("Master key is undefined, user cannot continue")
          setSavingId(false)
          savingIDRef.current = false
          return
        }
        // Save the ID if it wasn't saved yet on init
        await savePassport(scannedPassport, isUnsupportedId, masterKey)
        await new Promise((resolve) => setTimeout(resolve, 100))
        setPassportSaved(true)
        setSavingId(false)
        savingIDRef.current = false
      }
      setShouldContinue(true)
    }
  }

  useEffect(() => {
    if (shouldContinue && passportSaved) {
      resetFlowState()
      onFinish()
    }
  }, [shouldContinue, passportSaved])

  const handleOnMrzSuccess = (scannedMrz: string, scannedDocType: string) => {
    // Extract MRZ data and convert dates to display format
    const extracted = mrzService.extractMrzData(scannedMrz, scannedDocType as DocumentType)
    if (extracted) {
      setExtractedMrzData({
        documentNumber: extracted.documentNumber,
        dateOfBirth: convertMRZDateToDisplay(extracted.dateOfBirth),
        dateOfExpiry: convertMRZDateToDisplay(extracted.dateOfExpiry),
      })
    }
    // Show manual MRZ editor in confirmation mode after MRZ scan
    setShowManualMrzEditor(true)
    setShowMrzConfirmationMode(true)
  }

  const handleMrzSuccessPageContinue = () => {
    // After showing success page, move to PREPARE_ID
    setCurrentStep("PREPARE_ID")
    setScanStep("PREPARE_ID")
  }

  // Use the scanning hook
  const {
    // Core scanning state
    mrz,
    documentType,
    nfcAttempts,
    scanMrz,
    scanNfc,
    cancelScan,
    openNfcSettings,
    setDocumentType,
    setMrz,
    showNfcDisabledModal,
    setShowNfcDisabledModal,
    pendingNfcScan,
    setPendingNfcScan,
    showMrzTimeoutModal,
    setShowMrzTimeoutModal,
    setCurrentStep: setScanStep,
    startManualMrzEntry,
    endManualMrzEntry,
    initializeOnboardingTimer,
  } = usePassportScanning({
    maxNfcAttempts: NFC_MAX_ATTEMPTS,
    reportError,
    onMrzSuccess: handleOnMrzSuccess,
    onNfcSuccess: handleOnNFCSuccess,
    initialStep,
  })

  // Local UI state
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [showNFCModal, setShowNFCModal] = useState(false)
  const [currentEvent, setCurrentEvent] = useState<PassportReaderEvent | null>(null)
  const [showManualMrzEditor, setShowManualMrzEditor] = useState(false)
  const [showNfcRetryModal, setShowNfcRetryModal] = useState(false)
  const [showNfcTimeoutModal, setShowNfcTimeoutModal] = useState(false)
  const [showMrzErrorModal, setShowMrzErrorModal] = useState(false)
  const [currentMrzError, setCurrentMrzError] = useState<Error | string | null>(null)
  const [showNfcReadyModal, setShowNfcReadyModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [showCheckPassportModal, setShowCheckPassportModal] = useState(false)
  const [userWentToNfcSettings, setUserWentToNfcSettings] = useState(false)
  const [hasCancelledScan, setHasCancelledScan] = useState(false)
  const [showNfcSystemFailureModal, setShowNfcSystemFailureModal] = useState(false)
  const [showWifiInterferenceModal, setShowWifiInterferenceModal] = useState(false)

  const [showMrzConfirmationMode, setShowMrzConfirmationMode] = useState(false)
  const [extractedMrzData, setExtractedMrzData] = useState<
    | {
        documentNumber: string | null
        dateOfBirth: string | null
        dateOfExpiry: string | null
      }
    | undefined
  >(undefined)
  const { sendErrorToAPI } = useError()

  // Helper to return to a clean slate
  const resetFlowState = useCallback(() => {
    setCurrentStep(initialStep)
    setScanStep(initialStep)
    setScannedPassport(null)
    setIsUnsupportedId(false)
    setCurrentEvent(null)
    setShowManualMrzEditor(false)
    setShowNfcRetryModal(false)
    setShowNfcTimeoutModal(false)
    setShowMrzErrorModal(false)
    setCurrentMrzError(null)
    setShowNfcReadyModal(false)
    setShowDuplicateModal(false)
    setShowCheckPassportModal(false)
    setUserWentToNfcSettings(false)
    setHasCancelledScan(false)
    setShowMrzConfirmationMode(false)
    setExtractedMrzData(undefined)
    setPendingNfcScan(false)
    setShowNFCModal(false)
    endManualMrzEntry(false)
  }, [initialStep, endManualMrzEntry, setPendingNfcScan, setScanStep])

  // Helper function to convert MRZ date (YYMMDD) to display format (DDMMYYYY)
  const convertMRZDateToDisplay = (mrzDate: string): string => {
    if (mrzDate.length !== 6) return mrzDate
    const yy = mrzDate.substring(0, 2)
    const mm = mrzDate.substring(2, 4)
    const dd = mrzDate.substring(4, 6)
    const year = parseInt(yy) < 40 ? `20${yy}` : `19${yy}`
    return `${dd}${mm}${year}`
  }

  const handleManualMrzEntry = async (
    documentNumber: string,
    dateOfBirth: string,
    dateOfExpiry: string,
    docType: DocumentType,
  ) => {
    const constructedMrz = mrzService.constructMrzFromManualInput(
      documentNumber,
      dateOfBirth,
      dateOfExpiry,
      docType,
    )
    // This can return null, but is caught by conditional check below
    const parsedMrz = mrzService.parseMRZ(constructedMrz)

    // If in confirmation mode, don't end timer (it's part of MRZ scan flow)
    // End manual MRZ timer with success/failure only for manual entry
    const manualMrzTiming = showMrzConfirmationMode ? null : endManualMrzEntry(!!parsedMrz)

    if (parsedMrz) {
      // Check for duplicate MRZ before proceeding
      const isDuplicate = await mrzService.isDuplicateMrz(constructedMrz, getMrzs)
      if (isDuplicate) {
        setShowDuplicateModal(true)
        setShowManualMrzEditor(false)
        setShowMrzConfirmationMode(false)
        return
      }

      // Check if the ID is expired
      /* const isExpired = mrzService.isExpired(constructedMrz)
      if (isExpired) {
        setShowManualMrzEditor(false)
        setShowMrzConfirmationMode(false)
        setCurrentStep("EXPIRED_ID")
        setScanStep("EXPIRED_ID")
        return
      }*/

      // Update document type
      setDocumentType(docType)

      // Set the MRZ
      if (mrz) {
        const originalMrzData = mrzService.extractMrzData(mrz!, docType as DocumentType)
        if (
          originalMrzData &&
          (originalMrzData.documentNumber !== documentNumber ||
            originalMrzData.dateOfBirth !== dateOfBirth ||
            originalMrzData.dateOfExpiry !== dateOfExpiry)
        ) {
          // Only set new manual MRZ if it's different from the original MRZ data
          // This way we can keep the extra details of the original MRZ such as issuing country
          // which is useful to detect document using PACE polling
          console.log("Manual MRZ data is different from original MRZ data")
          setMrz(constructedMrz)
        } else {
          console.log(
            "Manual MRZ data is the same as original MRZ data, not setting new manual MRZ",
          )
        }
      } else {
        console.log("No original MRZ data, setting new manual MRZ")
        setMrz(constructedMrz)
      }

      setShowManualMrzEditor(false)
      setShowMrzConfirmationMode(false)

      // Move to PREPARE_ID to start NFC scan
      setCurrentStep("PREPARE_ID")
      setScanStep("PREPARE_ID")

      // Report manual MRZ success (non-blocking) - only if it's true manual entry
      if (!showMrzConfirmationMode) {
        reportEvent(
          "mrz_scan_succeeded",
          {
            manual_entry: true,
            document_type: docType,
          },
          null,
          { mrz: constructedMrz, operationTiming: manualMrzTiming ?? undefined },
        )
      }
    } else {
      // Create manual MRZ entry error with timing
      const mrzError = createMRZReadError(
        constructedMrz,
        false,
        true,
        documentType,
        undefined,
        manualMrzTiming || undefined,
      )

      // Show MRZ error modal with the specific error
      setCurrentMrzError(mrzError)
      setShowMrzErrorModal(true)
    }
  }

  const handleBack = () => {
    if (currentStep === "CHOOSE_ID_TYPE") {
      onCancel()
    } else {
      setCurrentStep((prevStep) => {
        switch (prevStep) {
          case "GET_READY_TO_SCAN":
            // Go back to ID type selection
            return "CHOOSE_ID_TYPE"
          case "MRZ_SUCCESS":
            // Go back to GetReadyToScan (step 1)
            return "GET_READY_TO_SCAN"
          case "PREPARE_ID":
            // Go back to MRZ success page
            return "GET_READY_TO_SCAN"
          default:
            return prevStep
        }
      })
    }
  }

  const handleSelectIDType = (idType: DocumentType) => {
    // Start the onboarding timer now, so that we make sure the user
    // confirmed their ID has the ICAO icon on it
    initializeOnboardingTimer()
    setDocumentType(idType)
    setExtractedMrzData(undefined)
    setShowMrzConfirmationMode(false)
    setCurrentStep("GET_READY_TO_SCAN")
    setScanStep("GET_READY_TO_SCAN")
    setHasCancelledScan(false)
  }

  const handleManualEntryFromGetReady = () => {
    setShowManualMrzEditor(true)
    startManualMrzEntry()
  }

  const handlePrepareIdScan = () => {
    // Start NFC scan directly
    checkNfcAndScanPassport()
  }

  const handleNfcReadyAccept = () => {
    setShowNfcReadyModal(false)
    // Reset the settings flag since user is now scanning
    setUserWentToNfcSettings(false)
    // Clear pending scan flag
    if (pendingNfcScan) {
      setPendingNfcScan(false)
    }
    // Small delay before starting scan
    setTimeout(() => {
      checkNfcAndScanPassport()
    }, 100)
  }

  const handleNfcReadyCancel = () => {
    setShowNfcReadyModal(false)
  }

  const checkNfcAndScanPassport = async () => {
    if (Platform.OS !== "ios") {
      setShowNFCModal(true)
    }

    // Setup event listener
    const eventListener = nfcService.addPassportReaderListener((event: PassportReaderEvent) => {
      setCurrentEvent(event)
    })
    let result = await scanNfc()
    console.log("NFC scan result:", result.error, result.success, result.passport?.passportNumber)

    if (result.success) {
      // Success is handled by the hook's onNfcSuccess callback
      // Check if this was an unsupported ID
      if (result.unsupportedId && result.passport) {
        handleOnNFCSuccess(result.passport, true)
      }
      setCurrentEvent(null)
      setShowNFCModal(false)
    } else if (result.cancelled) {
      setCurrentEvent(null)
      setShowNFCModal(false)
    } else if (result.nfcSystemFailure) {
      // Critical NFC system failure - device restart required
      setCurrentEvent(null)
      setShowNFCModal(false)
      setShowNfcSystemFailureModal(true)
    } else if (result.wifiInterference) {
      // WiFi interference - show modal
      setCurrentEvent(null)
      setShowNFCModal(false)
      setShowWifiInterferenceModal(true)
    } else if (result.mrzError) {
      // MRZ authentication error
      setCurrentEvent(null)
      setShowNFCModal(false)
      setCurrentStep("GET_READY_TO_SCAN")
      setScanStep("GET_READY_TO_SCAN")
      setCurrentMrzError(result.error)
      setShowMrzErrorModal(true)
    } else if (result.nfcDisabled) {
      // NFC disabled modal is handled by the hook
    } else if (result.isTimeout && result.canRetry) {
      // Show timeout-specific retry modal
      setShowNFCModal(false)
      setShowNfcTimeoutModal(true)
    } else if (result.canRetry) {
      setShowNFCModal(false)
      setShowNfcRetryModal(true)
    } else if (result.canRetry === false) {
      setShowNFCModal(false)
      setCurrentStep("NFC_CHIP_SCAN_FAIL")
      setScanStep("NFC_CHIP_SCAN_FAIL")
    } else {
      // Max attempts reached or other error
      setShowNFCModal(false)
    }

    // Cleanup
    if (eventListener && eventListener.remove) {
      eventListener.remove()
    }
  }

  // NFC state monitoring is handled by the hook
  const onScanMRZ = useCallback(async () => {
    const canUseCamera = await checkCameraPermission()
    if (!canUseCamera) {
      return
    }

    const result = await scanMrz(documentType)

    if (result.success) {
      // Success is already handled by the hook
      setHasCancelledScan(false)
    } else if (result.cancelled) {
      console.log("User cancelled MRZ scan")
      setHasCancelledScan(true)
      // User can try again by clicking "Start scan" again
    } else if (result.error) {
      setCurrentMrzError(result.error)

      // TODO: Checksum errors (CHECKSUM_ERROR subtype) may need different handling in the future
      // For now, showing alert modal for all MRZ errors
      setShowMrzErrorModal(true)
    }
  }, [documentType, scanMrz, mrz])

  const onCancelScan = () => {
    cancelScan()
    setShowNFCModal(false)
    setCurrentEvent(null)
  }

  const handleNfcRetry = async () => {
    setShowNfcRetryModal(false)
    // Reset state before retry
    setCurrentEvent(null)
    // Cancel any ongoing NFC operation
    await cancelScan()
    // Small delay to ensure modal is fully closed before starting new scan
    setTimeout(() => {
      checkNfcAndScanPassport()
    }, 300)
  }

  const handleNfcRetryCancel = async () => {
    setShowNfcRetryModal(false)
    setCurrentEvent(null)
    await cancelScan()
  }

  const handleNfcTimeoutRetry = async () => {
    setShowNfcTimeoutModal(false)
    // Reset state before retry
    setCurrentEvent(null)
    // Cancel any ongoing NFC operation
    await cancelScan()
    // Small delay to ensure modal is fully closed before starting new scan
    setTimeout(() => {
      checkNfcAndScanPassport()
    }, 300)
  }

  const handleNfcTimeoutCancel = async () => {
    setShowNfcTimeoutModal(false)
    setCurrentEvent(null)
    await cancelScan()
  }

  const handleShowCheckPassportModal = () => {
    setShowNfcTimeoutModal(false)
    setShowCheckPassportModal(true)
  }

  const handleCheckPassportConfirm = () => {
    // User confirms they have NFC symbol -> show CHIP_NOT_DETECTED
    setShowCheckPassportModal(false)
    setCurrentStep("CHIP_NOT_DETECTED")
    setScanStep("CHIP_NOT_DETECTED")
  }

  const handleCheckPassportDecline = () => {
    // User says they don't have NFC symbol -> show DOC_NOT_SUPPORTED
    setShowCheckPassportModal(false)
    setCurrentStep("DOC_NOT_SUPPORTED")
    setScanStep("DOC_NOT_SUPPORTED")
  }

  const handleCheckPassportClose = () => {
    setShowCheckPassportModal(false)
  }

  const handleNfcSystemFailureClose = () => {
    setShowNfcSystemFailureModal(false)
    // Go back to choose ID type after dismissing the error
    setCurrentStep("CHOOSE_ID_TYPE")
    setScanStep("CHOOSE_ID_TYPE")
  }

  const handleWifiInterferenceRetry = async () => {
    setShowWifiInterferenceModal(false)
    // Reset state before retry
    setCurrentEvent(null)
    // Cancel any ongoing NFC operation
    await cancelScan()
    // Small delay to ensure modal is fully closed before starting new scan
    setTimeout(() => {
      checkNfcAndScanPassport()
    }, 300)
  }

  const handleWifiInterferenceCancel = () => {
    setShowWifiInterferenceModal(false)
  }

  const handleMrzErrorClose = () => {
    setShowMrzErrorModal(false)
    setCurrentMrzError(null)
    setShowManualMrzEditor(true)
    startManualMrzEntry()
    setShowMrzConfirmationMode(false)
  }

  const handleDuplicateClose = () => {
    setShowDuplicateModal(false)
    setExtractedMrzData(undefined)
    setShowMrzConfirmationMode(false)
    setCurrentStep("GET_READY_TO_SCAN")
    setScanStep("GET_READY_TO_SCAN")
  }

  const handleTimeout = () => {
    setShowMrzErrorModal(false)
    setCurrentMrzError(null)
    setShowManualMrzEditor(true)
    startManualMrzEntry()
  }

  const handleManualMrzClose = () => {
    setShowManualMrzEditor(false)
    setShowMrzConfirmationMode(false)
    // Only end timer if not in confirmation mode
    if (!showMrzConfirmationMode) {
      const timing = endManualMrzEntry(false)
      if (timing) {
        reportEvent("manual_mrz_cancelled", undefined, null, { operationTiming: timing })
      }
    }
  }

  const handleNfcScanFailedPageContinue = () => {
    setCurrentStep("CHOOSE_ID_TYPE")
    setScanStep("CHOOSE_ID_TYPE")
  }

  const handleExpiredIdPageContinue = () => {
    setExtractedMrzData(undefined)
    setShowMrzConfirmationMode(false)
    setCurrentStep("CHOOSE_ID_TYPE")
    setScanStep("CHOOSE_ID_TYPE")
  }

  const handleChipNotDetectedPageContinue = () => {
    setCurrentStep("CHOOSE_ID_TYPE")
    setScanStep("CHOOSE_ID_TYPE")
  }

  const handleDocNotSupportedPageContinue = () => {
    setCurrentStep("CHOOSE_ID_TYPE")
    setScanStep("CHOOSE_ID_TYPE")
  }

  // Monitor for NFC being re-enabled after user goes to settings
  // Only show the ready modal on Android when user manually enabled NFC through settings
  useEffect(() => {
    if (
      Platform.OS === "android" &&
      userWentToNfcSettings &&
      !showNfcDisabledModal &&
      pendingNfcScan &&
      mrz
    ) {
      // NFC was re-enabled after user went to settings, show ready modal
      setShowNfcReadyModal(true)
    }
  }, [showNfcDisabledModal, pendingNfcScan, mrz, userWentToNfcSettings])

  return (
    <View style={styles.container}>
      <NFCModalView
        visible={showNFCModal}
        currentEvent={currentEvent}
        onClose={() => onCancelScan()}
      />
      {/* Duplicate alert modal */}
      <AlertModal
        visible={showDuplicateModal}
        onClose={handleDuplicateClose}
        onAccept={handleDuplicateClose}
        icon={require("@/assets/images/icons/AlertTriangle.png")}
        iconSize={64}
        title={t("scanning.modals.duplicate.title")}
        description={t("scanning.modals.duplicate.description")}
        buttonText={t("scanning.modals.duplicate.chooseAnother")}
        buttonText2={t("cancel")}
      />
      {/* NFC retry alert modal */}
      <AlertModal
        visible={showNfcRetryModal}
        onClose={handleNfcRetryCancel}
        onAccept={handleNfcRetry}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={
          nfcAttempts > 0 && nfcAttempts - 1 < NFC_MODAL_CONTENT.length
            ? t(NFC_MODAL_CONTENT[nfcAttempts - 1].titleKey)
            : ""
        }
        description={
          nfcAttempts > 0 && nfcAttempts - 1 < NFC_MODAL_CONTENT.length ? (
            <Trans
              i18nKey={NFC_MODAL_CONTENT[nfcAttempts - 1]?.descriptionKey ?? ""}
              components={{ bold: <Text style={{ fontWeight: "700" }} /> }}
            />
          ) : (
            ""
          )
        }
        disclaimer={t("scanning.attemptOf", {
          attempt:
            nfcAttempts > 0 && nfcAttempts - 1 < NFC_MODAL_CONTENT.length
              ? (NFC_MODAL_CONTENT[nfcAttempts - 1]?.attempt ?? 0)
              : 0,
          max: NFC_MAX_ATTEMPTS,
        })}
        buttonText={t("scanning.tryAgain")}
        buttonText2={t("cancel")}
      />
      {/* NFC timeout retry alert modal */}
      <AlertModal
        visible={showNfcTimeoutModal}
        onClose={handleNfcTimeoutCancel}
        onAccept={handleNfcTimeoutRetry}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={
          nfcAttempts > 0 && nfcAttempts - 1 < NFC_TIMEOUT_MODAL_CONTENT.length
            ? t(NFC_TIMEOUT_MODAL_CONTENT[nfcAttempts - 1]?.titleKey ?? "")
            : ""
        }
        description={
          nfcAttempts > 0 && nfcAttempts - 1 < NFC_TIMEOUT_MODAL_CONTENT.length
            ? t(NFC_TIMEOUT_MODAL_CONTENT[nfcAttempts - 1]?.descriptionKey ?? "")
            : ""
        }
        disclaimer={t("scanning.attemptOf", {
          attempt:
            nfcAttempts > 0 && nfcAttempts - 1 < NFC_TIMEOUT_MODAL_CONTENT.length
              ? (NFC_TIMEOUT_MODAL_CONTENT[nfcAttempts - 1]?.attempt ?? 0)
              : 0,
          max: NFC_MAX_ATTEMPTS,
        })}
        buttonText={t("scanning.tryAgain")}
        buttonText2={t("cancel")}
        linkText={nfcAttempts === 2 ? t("scanning.howToCheck") : undefined}
        onLinkPress={nfcAttempts === 2 ? handleShowCheckPassportModal : undefined}
      />
      {/* NFC system failure alert modal - device restart required */}
      <AlertModal
        visible={showNfcSystemFailureModal}
        onClose={handleNfcSystemFailureClose}
        onAccept={handleNfcSystemFailureClose}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={t("scanning.modals.nfcSystemFailure.title")}
        description={
          <Trans
            i18nKey="scanning.modals.nfcSystemFailure.description"
            components={{ bold: <Text style={{ fontWeight: "700" }} /> }}
          />
        }
      />
      {/* WiFi interference alert modal - iOS only */}
      <AlertModal
        visible={showWifiInterferenceModal}
        onClose={handleWifiInterferenceCancel}
        onAccept={handleWifiInterferenceRetry}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={t("scanning.modals.wifiInterference.title")}
        description={
          <Trans
            i18nKey="scanning.modals.wifiInterference.description"
            components={{ bold: <Text style={{ fontWeight: "700" }} /> }}
          />
        }
        buttonText={t("scanning.tryAgain")}
        buttonText2={t("cancel")}
      />
      {/* Check passport modal */}
      <CheckPassportModal
        visible={showCheckPassportModal}
        onClose={handleCheckPassportClose}
        onConfirm={handleCheckPassportConfirm}
        onDecline={handleCheckPassportDecline}
        idType={documentType as DocumentType}
      />
      {/* MRZ timeout alert modal - Code not detected */}
      <AlertModal
        visible={showMrzTimeoutModal}
        onClose={() => setShowMrzTimeoutModal(false)}
        onAccept={() => {
          setShowMrzTimeoutModal(false)
          // Retry scan
          handleTimeout()
        }}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={t("scanning.modals.mrzTimeout.title")}
        description={t("scanning.modals.mrzTimeout.description")}
        buttonText={t("scanning.modals.mrzTimeout.enterManually")}
        buttonText2={t("cancel")}
      />
      {/* NFC disabled alert modal - Android */}
      <AlertModal
        visible={showNfcDisabledModal}
        onClose={() => setShowNfcDisabledModal(false)}
        onAccept={async () => {
          setShowNfcDisabledModal(false)
          // Mark that user is being sent to settings to enable NFC
          setUserWentToNfcSettings(true)
          try {
            await openNfcSettings()
          } catch (error) {
            console.error("Error opening NFC settings:", error)
          }
        }}
        icon={require("@/assets/images/icons/nfc-icon.png")}
        iconSize={64}
        title={t("scanning.modals.nfcDisabled.title")}
        description={t("scanning.modals.nfcDisabled.description")}
        disclaimer={t("scanning.modals.nfcDisabled.disclaimer")}
        buttonText={t("scanning.modals.nfcDisabled.enableNFC")}
        buttonText2={t("cancel")}
      />
      {/* NFC ready alert modal - Only shown on Android after user enables NFC in settings */}
      <AlertModal
        visible={showNfcReadyModal}
        onClose={handleNfcReadyCancel}
        onAccept={handleNfcReadyAccept}
        icon={require("@/assets/images/icons/nfc-icon.png")}
        iconSize={64}
        title={t("scanning.modals.nfcReady.title")}
        description={t("scanning.modals.nfcReady.description")}
        buttonText={t("scanning.modals.nfcReady.startScan")}
        buttonText2={t("cancel")}
      />
      {/* TODO: Change to the new modal
      <MRZErrorModal
        visible={showMrzErrorModal}
        onClose={handleMrzErrorClose}
        error={currentMrzError || ""}
        onManualEntry={handleMrzErrorManualEntry}
      /> */}
      {/* Not sure if this one is needed or if it is legacy */}
      <AlertModal
        visible={showMrzErrorModal}
        onClose={handleMrzErrorClose}
        onAccept={async () => {
          await sendErrorToAPI(currentMrzError as ErrorLog)
          handleMrzErrorClose()
        }}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={t("scanning.modals.mrzScanFailed.title")}
        description={t("scanning.modals.mrzScanFailed.description")}
        buttonText={t("scanning.modals.mrzScanFailed.sendReport")}
        buttonText2={t("scanning.modals.mrzScanFailed.enterManually")}
      />
      {/* TODO: Change to the new modal, hook this in */}
      <ManualMRZEditor
        visible={showManualMrzEditor}
        onClose={handleManualMrzClose}
        onConfirm={handleManualMrzEntry}
        documentType={documentType as DocumentType}
        initialMrz={showMrzConfirmationMode ? extractedMrzData : undefined}
        confirmationMode={showMrzConfirmationMode}
      />
      {currentStep === "CHOOSE_ID_TYPE" && (
        <ChooseIDTypeView onBack={handleBack} onSelectIDType={handleSelectIDType} />
      )}
      {currentStep === "GET_READY_TO_SCAN" && (
        <GetReadyToScan
          onBack={handleBack}
          onStartScan={onScanMRZ}
          onManualEntry={handleManualEntryFromGetReady}
          showManualEntry={hasCancelledScan}
          idType={documentType as DocumentType}
        />
      )}
      {currentStep === "MRZ_SUCCESS" && (
        <EventPage
          onContinue={handleMrzSuccessPageContinue}
          stepType={EventPageType.MRZ}
          initialCountdown={5}
        />
      )}
      {currentStep === "PREPARE_ID" && (
        <PrepareIDView
          onBack={handleBack}
          onScan={handlePrepareIdScan}
          // onDebugManualMRZ={handleDebugManualMRZ}
          documentType={documentType as DocumentType}
          key={documentType}
        />
      )}
      {currentStep === "NFC_CHIP_SCAN_FAIL" && (
        <EventPage
          onContinue={handleNfcScanFailedPageContinue}
          stepType={EventPageType.NFC_FAILED}
        />
      )}
      {currentStep === "NFC_SUCCESS" && (
        <EventPage
          onInit={handleNfcSuccessPageInit}
          onContinue={handleNfcSuccessPageContinue}
          stepType={EventPageType.NFC}
          initialCountdown={5}
          loading={savingId}
        />
      )}
      {currentStep === "ID_NOT_SUPPORTED" && (
        <EventPage
          onInit={handleNfcSuccessPageInit}
          onContinue={handleNfcSuccessPageContinue}
          stepType={EventPageType.NOT_SUPPORTED}
        />
      )}
      {currentStep === "EXPIRED_ID" && (
        <EventPage onContinue={handleExpiredIdPageContinue} stepType={EventPageType.EXPIRED_ID} />
      )}
      {currentStep === "CHIP_NOT_DETECTED" && (
        <EventPage
          onContinue={handleChipNotDetectedPageContinue}
          stepType={EventPageType.CHIP_NOT_DETECTED}
        />
      )}
      {currentStep === "DOC_NOT_SUPPORTED" && (
        <EventPage
          onContinue={handleDocNotSupportedPageContinue}
          stepType={EventPageType.DOC_NOT_SUPPORTED}
        />
      )}
    </View>
  )
}

export default ScanPassportView

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
})
