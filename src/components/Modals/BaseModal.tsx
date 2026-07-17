import React from "react"
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform, ScrollView } from "react-native"
import { ModalWrapper } from "./ModalWrapper"
import LinearGradient from "react-native-linear-gradient"
import { useTranslation } from "react-i18next"
import { MissingCscaError } from "@/types/Error"
import { truncateToLines } from "@/lib/errorUtils"

type ModalMode =
  | "error"
  | "autoReportingFailure"
  | "consent"
  | "nfcRetry"
  | "nfcDisabled"
  | "expiredDocument"
  | "alreadyScanned"
  | "clearBaseProofs"
  | "deletePassport"
  | "deleteAllPassports"
  | "mrzError"
  | "cscaNotFound"
  | "unsupportedPassport"
  | "screenshotWarning"
  | "sdkVersionMismatch"

interface BaseModalProps {
  visible: boolean
  onClose: () => void
  mode: ModalMode

  // Error mode specific props
  error?: string | Error
  onSendReport?: () => Promise<void>
  reporting?: boolean
  reported?: boolean
  canReport?: boolean

  // Consent mode specific props
  onConsent?: (enabled: boolean) => void

  // NFC Retry mode specific props
  attemptNumber?: number
  onRetry?: () => void

  // NFC Disabled mode specific props
  onOpenSettings?: () => void

  // MRZ Error mode specific props
  onManualEntry?: () => void

  // Clear Base Proofs mode specific props
  onConfirm?: () => void

  deviceUUID?: string
}

export const BaseModal: React.FC<BaseModalProps> = ({
  visible,
  onClose,
  mode,
  error,
  onSendReport,
  reporting = false,
  reported = false,
  canReport = true,
  onConsent,
  attemptNumber = 1,
  onRetry,
  onOpenSettings,
  onManualEntry,
  onConfirm,
  deviceUUID,
}) => {
  const { t } = useTranslation()

  const handlePrimaryAction = async () => {
    if (mode === "error" && onSendReport) {
      await onSendReport()
    } else if (mode === "mrzError" && onSendReport) {
      await onSendReport()
    } else if (mode === "cscaNotFound" && onSendReport) {
      await onSendReport()
    } else if (mode === "unsupportedPassport" && onSendReport) {
      await onSendReport()
    } else if (mode === "consent" && onConsent) {
      onConsent(true)
      onClose()
    } else if (mode === "nfcRetry" && onRetry) {
      onRetry()
    } else if (mode === "nfcDisabled" && onOpenSettings) {
      onOpenSettings()
    } else if (mode === "clearBaseProofs" && onConfirm) {
      onConfirm()
      onClose()
    } else if (mode === "deletePassport" && onConfirm) {
      onConfirm()
      onClose()
    } else if (mode === "deleteAllPassports" && onConfirm) {
      onConfirm()
      onClose()
    } else {
      onClose()
    }
  }

  const handleSecondaryAction = () => {
    if (mode === "consent" && onConsent) {
      onConsent(false)
      onClose()
    } else if (mode === "mrzError" && onManualEntry) {
      onManualEntry()
      onClose()
    } else {
      onClose()
    }
  }

  const getTitle = () => {
    switch (mode) {
      case "error":
        return t("somethingWentWrong")
      case "mrzError":
        return t("mrzError.title")
      case "cscaNotFound":
        return t("errors.cscNotFound")
      case "unsupportedPassport":
        return t("errors.unsupportedPassport")
      case "autoReportingFailure":
        return t("autoErrorReporting.title")
      case "consent":
        return t("errorReporting.consentTitle")
      case "nfcRetry":
        return t("nfcModal.scanFailed")
      case "nfcDisabled":
        return t("nfcModal.nfcDisabled")
      case "expiredDocument":
        return t("expiredDocumentModal.title")
      case "alreadyScanned":
        return t("alreadyScannedModal.title")
      case "clearBaseProofs":
        return t("clearBaseProofsModal.title")
      case "deletePassport":
        return t("deletePassportModal.title")
      case "deleteAllPassports":
        return t("deleteAllPassportsModal.title")
      case "screenshotWarning":
        return t("screenshot.privacyWarningTitle")
      case "sdkVersionMismatch":
        return t("sdkVersionModal.title")
    }
  }

  const getPrimaryButtonText = () => {
    if (mode === "error") {
      if (reported) return t("reportSent")
      if (reporting) return t("sending")
      return t("sendReport")
    } else if (mode === "mrzError") {
      if (reported) return t("reportSent")
      if (reporting) return t("sending")
      return t("sendReport")
    } else if (mode === "cscaNotFound") {
      if (reported) return t("reportSent")
      if (reporting) return t("sending")
      return t("errors.cscNotFoundSendReport")
    } else if (mode === "unsupportedPassport") {
      if (reported) return t("reportSent")
      if (reporting) return t("sending")
      return t("sendReport")
    } else if (mode === "consent") {
      return t("errorReporting.enable")
    } else if (mode === "nfcRetry") {
      return t("tryAgain")
    } else if (mode === "nfcDisabled") {
      return t("nfcModal.openSettings")
    } else if (mode === "expiredDocument") {
      return t("ok")
    } else if (mode === "alreadyScanned") {
      return t("ok")
    } else if (mode === "clearBaseProofs") {
      return t("clear")
    } else if (mode === "deletePassport") {
      return t("delete")
    } else if (mode === "deleteAllPassports") {
      return t("delete")
    } else if (mode === "screenshotWarning") {
      return t("screenshot.understood")
    } else if (mode === "sdkVersionMismatch") {
      return t("ok")
    } else {
      return t("autoErrorReporting.dismiss")
    }
  }

  const getSecondaryButtonText = () => {
    if (mode === "error") {
      return t("dismiss")
    } else if (mode === "mrzError") {
      return t("mrzError.manualEntry")
    } else if (mode === "cscaNotFound") {
      return t("close")
    } else if (mode === "unsupportedPassport") {
      return t("dismiss")
    } else if (mode === "consent") {
      return t("errorReporting.notNow")
    } else if (mode === "nfcRetry") {
      return t("cancel")
    } else if (mode === "nfcDisabled") {
      return t("cancel")
    } else if (mode === "expiredDocument" || mode === "alreadyScanned") {
      return null
    } else if (mode === "clearBaseProofs") {
      return t("cancel")
    } else if (mode === "deletePassport") {
      return t("cancel")
    } else if (mode === "deleteAllPassports") {
      return t("cancel")
    } else if (mode === "sdkVersionMismatch") {
      return null
    }
    return null
  }

  const renderIcon = () => {
    if (
      mode === "error" ||
      mode === "mrzError" ||
      mode === "cscaNotFound" ||
      mode === "unsupportedPassport" ||
      mode === "nfcRetry" ||
      mode === "nfcDisabled" ||
      mode === "expiredDocument"
    ) {
      return (
        <View style={styles.errorIconContainer}>
          <Text style={styles.errorIcon}>!</Text>
        </View>
      )
    } else {
      return (
        <View style={styles.iconContainer}>
          <Image source={require("@/assets/images/zkpassport-logo.png")} style={styles.icon} />
        </View>
      )
    }
  }

  const renderContent = () => {
    if (mode === "error" && error) {
      const errorText = typeof error === "string" ? error : error.message
      // Truncate to 30 lines and have a scrollable view, include the device UUID in the error message
      const truncatedErrorText = truncateToLines(errorText, 30)

      return (
        <ScrollView style={styles.errorMessageContainer}>
          {deviceUUID && <Text style={styles.errorMessage}>{deviceUUID}</Text>}
          <Text style={styles.errorMessage}>{truncatedErrorText}</Text>
        </ScrollView>
      )
    } else if (mode === "mrzError") {
      const errorText = error
        ? typeof error === "string"
          ? error
          : error.message
        : t("mrzError.description")
      const truncatedErrorText = truncateToLines(errorText)

      return <Text style={styles.description}>{truncatedErrorText}</Text>
    } else if (mode === "cscaNotFound") {
      return <Text style={styles.description}>{t("errors.cscNotFoundDescription")}</Text>
    } else if (mode === "unsupportedPassport") {
      return <Text style={styles.description}>{t("errors.unsupportedPassportDescription")}</Text>
    } else if (mode === "autoReportingFailure") {
      return (
        <>
          <Text style={styles.description}>{t("autoErrorReporting.description")}</Text>
          {error && (
            <Text style={styles.errorMessage}>
              {truncateToLines(
                error instanceof MissingCscaError
                  ? t("errors.cscNotFoundDescription")
                  : typeof error === "string"
                    ? error
                    : error.message,
              )}
            </Text>
          )}
        </>
      )
    } else if (mode === "consent") {
      return (
        <>
          <Text style={styles.description}>{t("errorReporting.consentDescription")}</Text>
          <Text style={styles.privacy}>{t("errorReporting.consentPrivacy")}</Text>
        </>
      )
    } else if (mode === "nfcRetry") {
      return (
        <>
          <Text style={styles.description}>{t("nfcModal.retryDescription")}</Text>
          <Text style={styles.description}>
            {t("nfcModal.retryAttempt", { attempt: attemptNumber })}
          </Text>
          <Text style={styles.privacy}>{t("nfcModal.retryHint")}</Text>
        </>
      )
    } else if (mode === "nfcDisabled") {
      return (
        <>
          <Text style={styles.description}>{t("nfcModal.nfcDisabledDescription")}</Text>
          <Text style={styles.privacy}>{t("nfcModal.nfcDisabledHint")}</Text>
        </>
      )
    } else if (mode === "expiredDocument") {
      return <Text style={styles.description}>{t("expiredDocumentModal.description")}</Text>
    } else if (mode === "alreadyScanned") {
      return <Text style={styles.description}>{t("alreadyScannedModal.description")}</Text>
    } else if (mode === "clearBaseProofs") {
      return <Text style={styles.description}>{t("clearBaseProofsModal.description")}</Text>
    } else if (mode === "deletePassport") {
      return <Text style={styles.description}>{t("deletePassportModal.description")}</Text>
    } else if (mode === "deleteAllPassports") {
      return <Text style={styles.description}>{t("deleteAllPassportsModal.description")}</Text>
    } else if (mode === "screenshotWarning") {
      return <Text style={styles.description}>{t("screenshot.privacyWarningMessage")}</Text>
    } else if (mode === "sdkVersionMismatch") {
      return <Text style={styles.description}>{t("sdkVersionModal.updateAppMessage")}</Text>
    }
    return null
  }

  const renderButtons = () => {
    const secondaryText = getSecondaryButtonText()
    const showTwoButtons =
      mode === "error" ||
      mode === "mrzError" ||
      mode === "cscaNotFound" ||
      mode === "unsupportedPassport" ||
      mode === "consent" ||
      mode === "nfcRetry" ||
      mode === "nfcDisabled" ||
      mode === "clearBaseProofs" ||
      mode === "deletePassport" ||
      mode === "deleteAllPassports"

    if (showTwoButtons) {
      return (
        <>
          <TouchableOpacity
            style={[
              styles.button,
              mode === "clearBaseProofs" ||
              mode === "deletePassport" ||
              mode === "deleteAllPassports"
                ? styles.destructiveButton
                : styles.enableButton,
              (mode === "error" ||
                mode === "mrzError" ||
                mode === "cscaNotFound" ||
                mode === "unsupportedPassport") &&
                (reported || reporting || !canReport) &&
                styles.disabledButton,
            ]}
            onPress={handlePrimaryAction}
            disabled={
              (mode === "error" ||
                mode === "mrzError" ||
                mode === "cscaNotFound" ||
                mode === "unsupportedPassport") &&
              (reported || reporting || !canReport)
            }
            activeOpacity={0.8}
          >
            <Text
              style={[
                mode === "clearBaseProofs" ||
                mode === "deletePassport" ||
                mode === "deleteAllPassports"
                  ? styles.destructiveButtonText
                  : styles.enableButtonText,
                (mode === "error" ||
                  mode === "mrzError" ||
                  mode === "cscaNotFound" ||
                  mode === "unsupportedPassport") &&
                  (reported || reporting) &&
                  styles.disabledButtonText,
              ]}
            >
              {getPrimaryButtonText()}
            </Text>
          </TouchableOpacity>

          {secondaryText && (
            <TouchableOpacity
              style={[styles.button, styles.notNowButton]}
              onPress={handleSecondaryAction}
              activeOpacity={0.8}
            >
              <Text style={styles.notNowButtonText}>{secondaryText}</Text>
            </TouchableOpacity>
          )}
        </>
      )
    } else {
      // Single button for autoReportingFailure
      return (
        <TouchableOpacity
          style={[styles.button, styles.enableButton]}
          onPress={handlePrimaryAction}
          activeOpacity={0.8}
        >
          <Text style={styles.enableButtonText}>{getPrimaryButtonText()}</Text>
        </TouchableOpacity>
      )
    }
  }

  return (
    <ModalWrapper
      transparent={true}
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.modalWrapper}>
          <LinearGradient
            colors={["#4624F0", "#241A7F"]}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.innerContainer}>
              {renderIcon()}

              <Text style={styles.title}>{getTitle()}</Text>

              {renderContent()}

              <View style={styles.buttonContainer}>{renderButtons()}</View>
            </View>
          </LinearGradient>
        </View>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalWrapper: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  innerContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: Platform.OS === "ios" ? 60 : 50,
  },
  iconContainer: {
    alignSelf: "center",
    marginBottom: 24,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 40,
    height: 40,
  },
  errorIconContainer: {
    alignSelf: "center",
    marginBottom: 24,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
  },
  errorIcon: {
    color: "white",
    fontSize: 30,
    fontWeight: "bold",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    // fontFamily: "MetropolisBold",
    color: "white",
    textAlign: "center",
    marginBottom: 20,
  },
  description: {
    fontSize: 17,
    // fontFamily: "Metropolis",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 26,
    paddingHorizontal: 12,
  },
  privacy: {
    fontSize: 15,
    // fontFamily: "Metropolis",
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginBottom: 36,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  errorMessageContainer: {
    width: "100%",
    height: 150,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    marginBottom: 24,
    padding: 16,
  },
  errorMessage: {
    fontSize: 15,
    // fontFamily: "Metropolis",
    lineHeight: 22,
    textAlign: "left",
    color: "rgba(255, 255, 255, 0.9)",
  },
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  enableButton: {
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  enableButtonText: {
    color: "#4624F0",
    fontSize: 17,
    fontWeight: "700",
    // fontFamily: "MetropolisBold",
  },
  destructiveButton: {
    backgroundColor: "#FF3B30",
    shadowColor: "#FF3B30",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  destructiveButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    // fontFamily: "MetropolisBold",
  },
  notNowButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  notNowButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
    // fontFamily: "MetropolisSemiBold",
  },
  disabledButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  disabledButtonText: {
    color: "rgba(255, 255, 255, 0.8)",
  },
})
