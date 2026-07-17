// Error overlay component
import React, { useState, useEffect } from "react"
import { clearProofMemoryCrashData } from "@/lib/errorUtils"
import { useError } from "@/context/ErrorContext"
import { ErrorType, ZKPassportError } from "@/types/Error"
import { AlertModal } from "../AlertModal"
import { t } from "i18next"

interface ErrorOverlayProps {
  deviceUUID?: string
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = () => {
  const {
    error,
    showErrorOverlay,
    currentErrorLog,
    sendErrorToAPI,
    clearError,
    hasRetriedCircuitError,
  } = useError()

  const [reported, setReported] = useState(false)

  // Reset reported state when error changes
  useEffect(() => {
    setReported(false)
  }, [error])

  // Auto-close modal when report is successfully sent
  useEffect(() => {
    if (reported) {
      const timer = setTimeout(() => {
        clearError()
      }, 1000) // Give user time to see "Report Sent" message

      return () => clearTimeout(timer)
    }
  }, [reported])

  if (!error || !showErrorOverlay) return null

  // If it's a CircuitError but first time, don't show modal (auto-retry is happening)
  if (
    ((error as ZKPassportError)?.errorType === ErrorType.CIRCUIT_ERROR ||
      (error as ZKPassportError)?.errorType === ErrorType.COMMITMENT_MISMATCH ||
      (error as ZKPassportError)?.errorType === ErrorType.CLOUD_PROVER_ERROR) &&
    !hasRetriedCircuitError
  ) {
    return null
  }

  // For all other errors, show the standard modal
  const handleSendReport = async () => {
    if (!currentErrorLog) return

    const success = await sendErrorToAPI(currentErrorLog)
    if (
      (typeof error === "string" &&
        error === "The app quit unexpectedly during the generation of the proofs") ||
      (error &&
        error.message &&
        error.message.includes("The app quit unexpectedly during the generation of the proofs"))
    ) {
      await clearProofMemoryCrashData()
    }
    setReported(success)
  }

  return (
    <AlertModal
      visible={showErrorOverlay}
      onClose={clearError}
      onAccept={handleSendReport}
      icon={require("@/assets/images/icons/AlertTriangle.png")}
      iconSize={50}
      title={t("somethingWentWrong")}
      description={t("unexpectedErrorDescription")}
      buttonText={t("sendReport")}
      buttonText2={t("dismiss")}
    />
  )
}
