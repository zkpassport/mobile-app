import { StyleSheet, Text, View, Image, ActivityIndicator } from "react-native"
import { SegmentedRing } from "./SegmentedRing"
import { RING_START_ANGLE, TOTAL_SEGMENTS } from "./constants"
import { InfoContainer } from "../ui/Cards/InfoContainer"
import { Trans, useTranslation } from "react-i18next"

interface FaceMatchSuccessProps {
  /** Size of the frame containing the success indicator */
  frameSize: number
  /** Size of the full segmented ring container */
  segSize: number
}

export function FaceMatchSuccess({ frameSize, segSize }: FaceMatchSuccessProps) {
  const { t } = useTranslation()
  const segmentsTotal = TOTAL_SEGMENTS

  return (
    <View style={styles.container}>
      {/* Segmented ring - fully completed state */}
      <View
        style={{
          width: segSize,
          height: segSize,
        }}
        pointerEvents="none"
      >
        <SegmentedRing
          size={segSize}
          ringThickness={22}
          segmentsTotal={segmentsTotal}
          segmentsActive={segmentsTotal} // All segments active for success state
          gapDegrees={2}
          startAngle={RING_START_ANGLE}
          inactiveColor="rgba(163, 172, 184, 0.3)"
          activeColor="#F4D8A0"
          completedColor="#F4D8A0"
        >
          {/* Success indicator circle with biometric icon */}
          <View
            style={[
              styles.successCircle,
              {
                width: frameSize,
                height: frameSize,
                borderRadius: frameSize / 2,
              },
            ]}
          >
            {/* Biometric success illustration */}
            <View style={styles.illustrationContainer}>
              <Image
                source={require("@/assets/images/icons/FacematchComplete.png")}
                style={styles.completionIcon}
                resizeMode="contain"
              />
            </View>
          </View>
        </SegmentedRing>
      </View>

      <View style={styles.bottomContainer}>
        {/* Success text */}
        <View style={styles.successTextContainer}>
          <Text style={styles.successText}>
            <Trans
              i18nKey="facematch.successfullyCompleted"
              components={{
                bold: <Text style={styles.successTextGold} />,
              }}
            />
          </Text>
        </View>

        {/* Info box at the bottom */}
        <InfoContainer text={t("facematch.facialDataSecure")} />

        {/* Attestation generation progress indicator */}
        <View style={styles.attestationContainer}>
          <ActivityIndicator size="small" color="#F3D7A1" />
          <Text style={styles.attestationText}>{t("facematch.generatingAttestation")}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "flex-start",
    position: "relative",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  successCircle: {
    backgroundColor: "#1a2e82",
    justifyContent: "center",
    alignItems: "center",
  },
  illustrationContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  completionIcon: {
    width: 200,
    height: 200,
  },
  successTextContainer: {
    paddingHorizontal: 30,
  },
  successText: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    textAlign: "center",
    letterSpacing: 0.3,
    color: "#FBFBFB",
  },
  successTextGold: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    textAlign: "center",
    letterSpacing: 0.3,
    color: "#F4D8A0",
  },
  bottomContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 32,
  },
  attestationContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 8,
  },
  attestationText: {
    color: "#A3ACB8",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
})
