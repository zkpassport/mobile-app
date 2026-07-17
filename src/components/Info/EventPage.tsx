import React, { useState, useEffect, useMemo, useRef } from "react"
import { View, Text, StyleSheet, Image } from "react-native"
import { Colors } from "@/constants/Colors"
import { PrimaryButton } from "@/components/ui/Buttons"
import { t } from "i18next"
import { Trans } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export enum EventPageType {
  MRZ = "mrz",
  NFC = "nfc",
  NFC_FAILED = "nfc-failed",
  NOT_SUPPORTED = "not-supported",
  NOT_SUPPORTED_INTENT = "not-supported-intent", // this is for when a user wants to scan a QR code, but their selected ID is unsupported
  EXPIRED_ID = "expired-id",
  SOMETHING_WRONG = "something-wrong",
  LOST_CONNECTION = "lost-connection",
  DELETE_ID = "delete-id",
  DELETE_WRONG = "delete-wrong",
  VERIFIED = "verified",
  NOT_SUCCESSFUL = "not-successful",
  CHIP_NOT_DETECTED = "chip-not-detected",
  DOC_NOT_SUPPORTED = "doc-not-supported",
}

type EventConfig = {
  title: string
  desc1?: string
  desc2?: string | React.ReactNode
  image: any
  primaryText: string
  secondaryText?: string
  autoContinue?: boolean
}

const EVENT_CONTENT: Record<EventPageType, EventConfig> = {
  [EventPageType.MRZ]: {
    title: t("eventPage.title.mrz"),
    desc1: t("eventPage.description.success"),
    image: require("@/assets/images/ScanSuccess.png"),
    primaryText: t("continue"),
    autoContinue: true,
  },
  [EventPageType.NFC]: {
    title: t("eventPage.title.nfc"),
    desc1: t("eventPage.description.success"),
    image: require("@/assets/images/ScanSuccess.png"),
    primaryText: t("continue"),
    autoContinue: true,
  },
  [EventPageType.NFC_FAILED]: {
    title: t("eventPage.title.nfcFailed"),
    desc1: t("eventPage.description.nfcFailed"),
    desc2: <Text style={{ fontWeight: "700" }}>{t("eventPage.secondaryText.useAnotherID")}</Text>,
    image: require("@/assets/images/SomethingWrong.png"),
    primaryText: t("chooseAnotherID"),
    autoContinue: false,
  },
  [EventPageType.NOT_SUPPORTED]: {
    title: t("eventPage.title.notSupported"),
    desc1: t("eventPage.description.notSupported"),
    image: require("@/assets/images/IDNotSupported.png"),
    primaryText: t("continue"),
    autoContinue: false,
  },
  [EventPageType.NOT_SUPPORTED_INTENT]: {
    title: t("eventPage.title.notSupported"),
    desc1: t("eventPage.description.notSupportedIntent"),
    image: require("@/assets/images/IDNotSupported.png"),
    primaryText: t("chooseAnotherID"),
    secondaryText: t("close"),
    autoContinue: false,
  },
  [EventPageType.EXPIRED_ID]: {
    title: t("eventPage.title.expiredId"),
    desc1: t("eventPage.description.expiredId"),
    image: require("@/assets/images/IDNotSupported.png"),
    primaryText: t("chooseAnotherID"),
    secondaryText: t("close"),
    autoContinue: false,
  },
  [EventPageType.SOMETHING_WRONG]: {
    title: t("eventPage.title.somethingWrong"),
    desc1: t("eventPage.description.somethingWrong"),
    desc2: (
      <Trans
        i18nKey="eventPage.secondaryText.somethingWrong"
        components={{
          bold: <Text style={{ fontWeight: "700" }} />,
        }}
      />
    ),
    image: require("@/assets/images/SomethingWrong.png"),
    primaryText: t("refreshApp"),
    autoContinue: false,
  },
  [EventPageType.LOST_CONNECTION]: {
    title: t("eventPage.title.lostConnection"),
    desc1: t("eventPage.description.lostConnection"),
    desc2: (
      <Trans
        i18nKey="eventPage.secondaryText.lostConnection"
        components={{
          bold: <Text style={{ fontWeight: "700" }} />,
        }}
      />
    ),
    image: require("@/assets/images/NoWifi.png"),
    primaryText: t("refreshApp"),
    autoContinue: false,
  },
  [EventPageType.DELETE_ID]: {
    title: t("eventPage.title.deleteId"),
    image: require("@/assets/images/ScanSuccess.png"),
    primaryText: t("close"),
    autoContinue: true,
  },
  [EventPageType.DELETE_WRONG]: {
    title: t("eventPage.title.deleteWrong"),
    image: require("@/assets/images/SomethingWrong.png"),
    primaryText: t("close"),
    autoContinue: true,
  },
  [EventPageType.VERIFIED]: {
    title: t("eventPage.title.verified"),
    desc1: t("eventPage.description.verified"),
    image: require("@/assets/images/ScanSuccess.png"),
    primaryText: t("close"),
    autoContinue: true,
  },
  [EventPageType.NOT_SUCCESSFUL]: {
    title: t("eventPage.title.notSuccessful"),
    desc1: t("eventPage.description.notSuccessful"),
    desc2: t("eventPage.secondaryText.contactServiceProvider"),
    image: require("@/assets/images/ScanSuccess.png"),
    primaryText: t("close"),
    autoContinue: true,
  },
  [EventPageType.CHIP_NOT_DETECTED]: {
    title: t("eventPage.title.chipNotDetected"),
    desc1: t("eventPage.description.chipNotDetected"),
    desc2: <Text style={{ fontWeight: "700" }}>{t("eventPage.secondaryText.useAnotherID")}</Text>,
    image: require("@/assets/images/SomethingWrong.png"),
    primaryText: t("chooseAnotherID"),
    autoContinue: true,
  },
  [EventPageType.DOC_NOT_SUPPORTED]: {
    title: t("eventPage.title.docNotSupported"),
    desc1: t("eventPage.description.docNotSupported"),
    desc2: <Text style={{ fontWeight: "700" }}>{t("eventPage.secondaryText.useAnotherID")}</Text>,
    image: require("@/assets/images/IDNotSupported.png"),
    primaryText: t("chooseAnotherID"),
    autoContinue: false,
  },
}

interface EventPageProps {
  onInit?: () => void
  onContinue: () => void
  onSecondary?: () => void
  stepType: EventPageType
  initialCountdown?: number
  loading?: boolean
  primaryTextOverride?: string
  disableAutoContinue?: boolean
}

const EventPage: React.FC<EventPageProps> = ({
  onInit,
  onContinue,
  onSecondary,
  stepType = EventPageType.MRZ,
  initialCountdown = 5,
  loading = false,
  primaryTextOverride,
  disableAutoContinue = false,
}) => {
  const [seconds, setSeconds] = useState(initialCountdown)
  const initializing = useRef<boolean>(false)
  const insets = useSafeAreaInsets()

  const content = useMemo(() => EVENT_CONTENT[stepType], [stepType])
  const autoContinue = content.autoContinue && !disableAutoContinue

  useEffect(() => {
    if (onInit && !initializing.current) {
      initializing.current = true
      onInit()
    }
  }, [onInit])

  useEffect(() => {
    if (!autoContinue) return

    if (seconds <= 0) {
      onContinue()
      return
    }

    const id = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [seconds, autoContinue])

  const primaryText = primaryTextOverride ?? content.primaryText
  const primaryLabel = autoContinue && seconds > 0 ? `${primaryText} (${seconds}s)` : primaryText
  const handleSecondary = onSecondary ?? onContinue

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Image source={content.image} style={styles.icon} resizeMode="contain" />
          </View>

          <Text style={styles.title}>{content.title}</Text>

          <Text style={styles.description}>{content.desc1}</Text>

          {content.desc2 && <Text style={styles.description2}>{content.desc2}</Text>}
        </View>

        <View style={styles.bottomSection}>
          <PrimaryButton text={primaryLabel} onPress={onContinue} primary loading={loading} />
          {content.secondaryText && (
            <View style={styles.secondaryButton}>
              <PrimaryButton
                text={content.secondaryText}
                onPress={handleSecondary}
                primary={false}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 40,
  },
  icon: {
    width: 160,
    height: 160,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "center",
    marginBottom: 16,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
    maxWidth: 320,
  },
  description2: {
    paddingTop: 20,
    fontSize: 16,
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
    maxWidth: 320,
  },
  secondaryButton: {
    paddingTop: 24,
  },
  bottomSection: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
})
export default EventPage
