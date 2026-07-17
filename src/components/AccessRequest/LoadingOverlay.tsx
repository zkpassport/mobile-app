// import { useTranslation } from "react-i18next"
import { View, StyleSheet, Text, BackHandler } from "react-native"
import { HorizontalProgress } from "./HorizontalProgress"
import EventPage, { EventPageType } from "../Info/EventPage"
import { LinearGrad } from "../ui/Text/LinearGradient"
import { useEffect } from "react"
import { router } from "expo-router"
import { Trans, useTranslation } from "react-i18next"

export const LoadingOverlay = ({
  isLoading,
  isComplete,
  progress = 0,
  onComplete,
  loadingText,
  returnDeepLink,
  returnAppName,
}: {
  isLoading: boolean
  isComplete: boolean
  progress?: number
  onComplete?: () => void
  loadingText?: string
  returnDeepLink?: string | null
  returnAppName?: string | null
}) => {
  const { t } = useTranslation()
  // placeholder, see if we keep this
  console.log("progress: ", loadingText)

  useEffect(() => {
    // this prevents the back gesture swipe from doing anything on this page
    const onBackPress = () => {
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [router])

  return (
    <>
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            {/* Large percentage display */}
            <LinearGrad
              text={`${Math.round(progress)}%`}
              colors={["#F2DCB0", "#F6D38F"]}
              textStyle={styles.percentageText}
            />

            {/* Title */}
            <View style={styles.titleContainer}>
              <Text style={styles.titleGold}>
                <Trans
                  i18nKey="LoadingOverlay.verification"
                  components={{
                    bold: <Text style={styles.titleGoldBold} />,
                  }}
                />
              </Text>
            </View>

            {/* Progress bar */}
            <HorizontalProgress progress={progress} />

            {/* Instruction text */}
            <Text style={styles.loadingSecondaryText}>
              {t("LoadingOverlay.pleaseKeepPhoneAwake")}
            </Text>
          </View>
        </View>
      ) : isComplete ? (
        <EventPage
          stepType={EventPageType.VERIFIED}
          onContinue={onComplete || (() => {})}
          initialCountdown={5}
          primaryTextOverride={
            returnDeepLink
              ? returnAppName
                ? t("returnToAppNamed", { name: returnAppName })
                : t("returnToApp")
              : undefined
          }
          disableAutoContinue={!!returnDeepLink}
        />
      ) : null}
    </>
  )
}

export const styles = StyleSheet.create({
  loadingOverlay: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  percentageText: {
    color: "#F4D8A0",
    fontSize: 40,
    fontWeight: "600",
    lineHeight: 48,
    textAlign: "center",
    paddingBottom: 32,
  },
  titleContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 12,
  },
  titleGold: {
    color: "#FBFBFB",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    textAlign: "center",
  },
  titleGoldBold: {
    color: "#F4D8A0",
    fontWeight: "700",
  },
  loadingSecondaryText: {
    color: "#E7E7E7",
    fontSize: 16,
    paddingTop: 32,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 22,
  },
})
