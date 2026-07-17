import React, { useMemo } from "react"
import { StyleSheet, Text, View, Platform, Image } from "react-native"
import Svg, { Circle as SvgCircle, Line as SvgLine, Text as SvgText } from "react-native-svg"
import { GazeDirection2D, FacePose, LivenessTargetState } from "@/services/facematch"
import {
  // COSINE_SCORE_THRESHOLD,
  GAZE_VECTOR_EPSILON,
  LIVENESS_MATCHES_PER_TARGET,
  MIN_GAZE_MAGNITUDE_THRESHOLD,
} from "./constants"
import { angleDeltaDeg, validatePoseForLiveness } from "@/services/facematch/utils"
import { useTranslation } from "react-i18next"

type GazeIndicatorProps = {
  gaze: GazeDirection2D | null | undefined
  frameSize: number
}

export const GazeIndicator: React.FC<GazeIndicatorProps> = ({ gaze, frameSize }) => {
  if (!gaze) return null

  const { magnitude, angleDeg } = gaze

  if (Math.abs(magnitude) < GAZE_VECTOR_EPSILON) return null

  // Determine color based on gaze magnitude threshold
  const isMagnitudeValid = magnitude >= MIN_GAZE_MAGNITUDE_THRESHOLD
  const color = isMagnitudeValid ? "#27F35A" : "#FF4444" // Green if valid, red if below threshold

  // Calculate direction from angle (normalized)
  const angleRad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(angleRad)
  const dy = Math.sin(angleRad)

  const cx = frameSize / 2
  const cy = frameSize / 2
  const baseLength = frameSize * 0.32

  // Scale length based on direction: longer for horizontal (left/right), shorter for vertical (up/down)
  // abs(dx) is high for horizontal, abs(dy) is high for vertical
  const directionScale = 0.7 + 0.6 * Math.abs(dx) // 0.7x for pure vertical, 1.3x for pure horizontal
  const lineLength = baseLength * magnitude * 3 * directionScale

  const endX = cx + dx * lineLength
  const endY = cy + dy * lineLength
  const labelDistance = lineLength + 24
  const labelX = cx + dx * labelDistance
  const labelY = cy + dy * labelDistance
  const angleLabel = `${Math.round(angleDeg)}°`

  return (
    <Svg
      key="gaze-indicator"
      width={frameSize}
      height={frameSize}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <SvgCircle cx={cx} cy={cy} r={4} fill={color} opacity={0.9} />
      <SvgLine
        x1={cx}
        y1={cy}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.85}
      />
      <SvgText
        x={labelX}
        y={labelY}
        fill={color}
        fontSize={14}
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {angleLabel}
      </SvgText>
    </Svg>
  )
}

type FacialLandmarksProps = {
  landmarks:
    | [[number, number], [number, number], [number, number], [number, number], [number, number]]
    | null
    | undefined
  frameSize: number
  photoDimensions: { width: number; height: number } | null
}

export const FacialLandmarks: React.FC<FacialLandmarksProps> = ({
  landmarks,
  frameSize,
  photoDimensions,
}) => {
  const { t } = useTranslation()

  if (!landmarks || !photoDimensions) return null

  // Map landmarks from image space to frame space
  const mappedLandmarks = landmarks.map(([x, y]) => {
    let xNorm = (x / photoDimensions.width) * 1.1
    let yNorm = (y / photoDimensions.height) * 1.1

    // Android: invert both x and y coordinates
    if (Platform.OS === "android") {
      xNorm = 1 - xNorm
    }

    return [xNorm * frameSize, yNorm * frameSize]
  })

  const labels = [
    t("facematch.debug.leftEye"),
    t("facematch.debug.rightEye"),
    t("facematch.debug.nose"),
    t("facematch.debug.leftMouth"),
    t("facematch.debug.rightMouth"),
  ]
  const colors = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#95E1D3", "#F38181"]

  return (
    <Svg width={frameSize} height={frameSize} style={StyleSheet.absoluteFill} pointerEvents="none">
      {mappedLandmarks.map(([x, y], index) => (
        <React.Fragment key={index}>
          {/* Point */}
          <SvgCircle cx={x} cy={y} r={5} fill={colors[index]} opacity={0.9} />
          {/* Label */}
          <SvgText
            x={x}
            y={y - 12}
            fill={colors[index]}
            fontSize={10}
            fontWeight="bold"
            textAnchor="middle"
          >
            {labels[index]}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  )
}

type DebugInfoProps = {
  cosineScore: number | null
  pose: FacePose | null | undefined
  gaze: GazeDirection2D | null | undefined
  livenessMode: boolean
  currentLivenessTarget: LivenessTargetState | null
  livenessProgress: any
  segmentsActive: number
  segmentsTotal: number
}

export const useDebugInfo = ({
  cosineScore,
  pose,
  gaze,
  livenessMode,
  currentLivenessTarget,
  livenessProgress,
  segmentsActive,
  segmentsTotal,
}: DebugInfoProps): string | null => {
  return useMemo(() => {
    if (cosineScore === null) return null

    const parts: string[] = [`Sim: ${cosineScore.toFixed(2)}`]

    if (livenessMode && currentLivenessTarget) {
      if (gaze) {
        const delta = angleDeltaDeg(gaze.angleDeg, currentLivenessTarget.target.angleDeg)
        parts.push(
          `Gaze ${Math.round(gaze.angleDeg)}° (Δ${delta.toFixed(1)}°) Mag: ${gaze.magnitude.toFixed(2)}`,
        )

        // Add pose validation info
        const poseValidation = validatePoseForLiveness(
          gaze.magnitude,
          gaze.angleDeg,
          currentLivenessTarget.target.angleDeg,
        )
        const directions = ["L", "U", "R", "D"]
        const directionLabel = directions[currentLivenessTarget.target.order] || "?"
        parts.push(
          `${directionLabel}: M${poseValidation.magnitudeValid ? "✓" : "✗"} A${poseValidation.angleValid ? "✓" : "✗"}`,
        )
      }
      parts.push(
        `Target #${currentLivenessTarget.target.segmentIndex} (${Math.round(
          currentLivenessTarget.target.angleDeg,
        )}°)`,
      )
      parts.push(
        `Active ${currentLivenessTarget.activeSegmentIndex} (${Math.round(
          currentLivenessTarget.activeAngleDeg,
        )}°)`,
      )
      if (livenessProgress) {
        const summary = currentLivenessTarget.schedule
          .map((entry) => {
            const count = livenessProgress.matchesPerTarget.get(entry.segmentIndex) ?? 0
            return `${entry.segmentIndex}:${count}/${LIVENESS_MATCHES_PER_TARGET}`
          })
          .join("→")
        parts.push(`Progress ${summary}`)
      }
      parts.push(`Segments ${segmentsActive}/${segmentsTotal}`)
    }
    return parts.join(" | ")
  }, [
    cosineScore,
    pose,
    gaze,
    livenessMode,
    currentLivenessTarget,
    livenessProgress,
    segmentsActive,
    segmentsTotal,
  ])
}

type DebugScorePillProps = {
  debugInfo: string | null
  isMatch: boolean
}

export const DebugScorePill: React.FC<DebugScorePillProps> = ({ debugInfo, isMatch }) => {
  if (!debugInfo) return null

  return (
    <View style={[styles.scorePill, isMatch ? styles.scorePillMatch : undefined]}>
      <Text style={[styles.scoreText, isMatch ? styles.scoreTextMatch : undefined]}>
        {debugInfo}
      </Text>
    </View>
  )
}

type DebugPhotoProps = {
  photoUri: string | null
}

export const DebugPhoto: React.FC<DebugPhotoProps> = ({ photoUri }) => {
  const { t } = useTranslation()

  if (!photoUri) return null

  return (
    <View style={styles.debugPhotoContainer}>
      <Image source={{ uri: photoUri }} style={styles.debugPhoto} />
      <Text style={styles.debugPhotoLabel}>{t("facematch.debug.modelInput")}</Text>
    </View>
  )
}

type EmbeddingTimingProps = {
  startTime: number | null
  duration: number | null
  isRunning: boolean
}

export const EmbeddingTimingIndicator: React.FC<EmbeddingTimingProps> = ({
  startTime,
  duration,
  isRunning,
}) => {
  const { t } = useTranslation()

  if (!startTime) return null

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    })
  }

  const getStatusText = () => {
    if (isRunning) {
      return `${formatTime(startTime)} → ⏳...`
    } else if (duration !== null) {
      return `${formatTime(startTime)} → ${duration}ms`
    }
    return null
  }

  const statusText = getStatusText()
  if (!statusText) return null

  return (
    <View style={styles.embeddingTimingContainer}>
      <Text style={styles.embeddingTimingLabel}>{t("facematch.debug.embedding")}</Text>
      <Text style={styles.embeddingTimingText}>{statusText}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scorePill: {
    position: "absolute",
    top: 160,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#4b5563",
  },
  scorePillMatch: {
    backgroundColor: "rgba(16,185,129,0.7)", // emerald-500 with opacity
    borderColor: "#10B981",
  },
  scoreText: {
    color: "#f9fafb",
    fontWeight: "700",
  },
  scoreTextMatch: {
    color: "#d1fae5",
  },
  debugPhotoContainer: {
    position: "absolute",
    bottom: 0,
    left: 20,
    width: 120,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 8,
    borderWidth: 2,
    padding: 4,
  },
  debugPhoto: {
    width: "100%",
    height: "85%",
    borderRadius: 4,
  },
  debugPhotoLabel: {
    position: "absolute",
    bottom: 2,
    left: 4,
    right: 4,
    color: "#27F35A",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 2,
    paddingVertical: 1,
  },
  embeddingTimingContainer: {
    position: "absolute",
    bottom: 0,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 8,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 200,
  },
  embeddingTimingLabel: {
    color: "#27F35A",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 2,
  },
  embeddingTimingText: {
    color: "#f9fafb",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
})
