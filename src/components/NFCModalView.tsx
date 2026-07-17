import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { PassportReaderEvent } from "@/types"
import { ModalWrapper } from "./Modals/ModalWrapper"
import { useTranslation } from "react-i18next"
import { SaveNFC } from "@/assets/images/icons/SaveNFC"
import LottieView from "lottie-react-native"

// Helper to check if event is a connection loss event
const isConnectionLostEvent = (event: PassportReaderEvent): boolean => {
  return (
    event === "CONNECTION_LOST" ||
    event === "CONNECTION_LOST_RETAG_1" ||
    event === "CONNECTION_LOST_RETAG_2" ||
    event === "CONNECTION_LOST_RETAG_3" ||
    event === "CONNECTION_LOST_MAX_RETRIES" ||
    event === "WRONG_TAG_RETAG"
  )
}

// Helper to check if event is a tag reconnected event
const isTagReconnectedEvent = (event: PassportReaderEvent): boolean => {
  return (
    event === "TAG_RECONNECTED" ||
    event === "TAG_RECONNECTED_1" ||
    event === "TAG_RECONNECTED_2" ||
    event === "TAG_RECONNECTED_3"
  )
}

const currentEventToMessage = (event: PassportReaderEvent, t: (key: string) => string) => {
  switch (event) {
    case "GET_COM_STARTED":
    case "GET_COM_SUCCEEDED":
      return t("nfcReading.readingCommon")
    case "GET_DG1_STARTED":
    case "GET_DG1_SUCCEEDED":
      return t("nfcReading.readingMRZ")
    case "GET_DG2_STARTED":
    case "GET_DG2_SUCCEEDED":
      return t("nfcReading.readingPhoto")
    case "GET_DG5_STARTED":
    case "GET_DG5_SUCCEEDED":
      return t("nfcReading.readingPortrait")
    case "GET_DG7_STARTED":
    case "GET_DG7_SUCCEEDED":
      return t("nfcReading.readingSignature")
    case "GET_DG14_STARTED":
    case "GET_DG14_SUCCEEDED":
      return t("nfcReading.readingSecurityOptions")
    case "GET_DG15_STARTED":
    case "GET_DG15_SUCCEEDED":
      return t("nfcReading.readingPublicKey")
    case "GET_SOD_STARTED":
    case "GET_SOD_SUCCEEDED":
      return t("nfcReading.readingSecurityData")
    case "BAC_STARTED":
    case "BAC_SUCCEEDED":
      return t("nfcReading.authenticating")
    case "BAC_FAILED":
      return t("nfcReading.authenticationFailed")
    case "PACE_STARTED":
    case "PACE_SUCCEEDED":
      return t("nfcReading.authenticating")
    case "PACE_FAILED":
      return t("nfcReading.paceFailed")
    case "GET_PHOTO_STARTED":
    case "GET_PHOTO_SUCCEEDED":
      return t("nfcReading.readingPhotoDetails")
    case "PASSPORT_READ_FAILED":
      return t("nfcReading.passportReadFailed")
    case "PREP_DATA":
      return t("nfcReading.passportScanned")
    case "SCAN_STARTED":
      return t("nfcReading.scanning")
    case "SAVING_PASSPORT":
      return t("nfcReading.savingPassportDescription")
    // Connection loss events
    case "CONNECTION_LOST":
    case "CONNECTION_LOST_RETAG_1":
      return t("nfcReading.connectionLost.retag1")
    case "CONNECTION_LOST_RETAG_2":
      return t("nfcReading.connectionLost.retag2")
    case "CONNECTION_LOST_RETAG_3":
      return t("nfcReading.connectionLost.retag3")
    case "CONNECTION_LOST_MAX_RETRIES":
      return t("nfcReading.connectionLost.maxRetries")
    case "TAG_RECONNECTED":
    case "TAG_RECONNECTED_1":
    case "TAG_RECONNECTED_2":
    case "TAG_RECONNECTED_3":
      return t("nfcReading.tagReconnected")
    case "WRONG_TAG_RETAG":
      return t("nfcReading.wrongTagRetag")
    default:
      return t("nfcReading.reading")
  }
}

const NFCModalView = ({
  visible,
  currentEvent,
  onClose,
}: {
  visible: boolean
  currentEvent: PassportReaderEvent | null
  onClose: () => void
}) => {
  const { t } = useTranslation()

  const isConnectionLost = currentEvent ? isConnectionLostEvent(currentEvent) : false
  const isTagReconnected = currentEvent ? isTagReconnectedEvent(currentEvent) : false

  const getTitle = () => {
    if (currentEvent === "SAVING_PASSPORT" || currentEvent === "PREP_DATA") {
      return t("nfcReading.savingID")
    }
    if (isConnectionLost) {
      return t("nfcReading.connectionLost.title")
    }
    if (isTagReconnected) {
      return t("nfcReading.tagReconnectedTitle")
    }
    return t("nfcReading.readyToScan")
  }

  const isSaving = currentEvent === "SAVING_PASSPORT" || currentEvent === "PREP_DATA"

  return (
    <ModalWrapper
      transparent={true}
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.homeIndicator} />
        <View style={styles.content}>
          <View style={styles.instructionWrapper}>
            <Text style={styles.title}>{getTitle()}</Text>
            {!currentEvent && <Text style={styles.instructions}>{t("nfcReading.holdPhone")}</Text>}
            {currentEvent && (
              <Text style={styles.instructions}>{currentEventToMessage(currentEvent, t)}</Text>
            )}
          </View>
          <View style={styles.iconContainer}>
            {isSaving ? (
              <SaveNFC />
            ) : (
              <LottieView
                source={require("@/assets/animations/nfc-animation.json")}
                loop={true}
                autoPlay={true}
                style={styles.nfcAnimation}
              />
            )}
          </View>
        </View>
        <View style={styles.buttonWrapper}>
          <TouchableOpacity
            disabled={isSaving}
            style={[styles.cancelButton, isSaving && styles.disabledButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#142262",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  homeIndicator: {
    width: 80,
    height: 5,
    backgroundColor: "#7483C7",
    borderRadius: 100,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 32,
    gap: 32,
  },
  instructionWrapper: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "white",
    // fontFamily: "Metropolis",
    textAlign: "center",
  },
  instructions: {
    fontSize: 16,
    textAlign: "center",
    color: "white",
    // fontFamily: "Metropolis",
    lineHeight: 22,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  phoneIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -25,
    marginLeft: -17.5,
  },
  buttonWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#F2DCB0",
    borderRadius: 9999,
    paddingHorizontal: 58,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "rgba(242, 220, 176, 0.05)",
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
    // fontFamily: "Metropolis",
    color: "#F2DCB0",
    textAlign: "center",
  },
  nfcAnimation: {
    width: 200,
    height: 200,
    marginVertical: -30,
  },
})

export default NFCModalView
