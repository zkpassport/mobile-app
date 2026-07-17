import { StatusBar } from "expo-status-bar"
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Animated,
  Easing,
  SafeAreaView,
  Dimensions,
} from "react-native"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"
import FaceMatchCamera from "./FaceMatchCamera"
import { SegmentedRing } from "./SegmentedRing"
import { DirectionalArrowOverlay } from "./DirectionalArrowOverlay"
// import { FaceCrosshair } from "./FaceCrosshair"
// import { RoundedFrameWithBrackets } from "./RoundedFrameWithBrackets"
// import { MoveArrows } from "./MoveArrows"
import { FacematchMode, PassportViewModel } from "@zkpassport/utils"
import { CosineScore } from "@/services/facematch/asn"
import { Faceprint } from "@/services/facematch/facematch"
import { FaceMatchMetrics } from "@/types/Error"
import { useTranslation } from "react-i18next"
import {
  cosine,
  createInitialLivenessProgress,
  l2Norm,
  LIVENESS_SCHEDULE,
  segmentIndexToAngle,
  validatePoseForLiveness,
} from "@/services/facematch/utils"
import {
  FacePose,
  LivenessProgress,
  LivenessTargetState,
  GazeDirection2D,
  FaceEmbeddingResponse,
  FaceDetectionResponse,
  FaceLandmarks,
} from "@/services/facematch"
import {
  COSINE_SCORE_THRESHOLD,
  EMBEDDING_THROTTLE,
  GAZE_VECTOR_EPSILON,
  LIVENESS_MATCHES_PER_TARGET,
  MAX_GAZE_MAGNITUDE_THRESHOLD,
  MIN_GAZE_MAGNITUDE_THRESHOLD,
  NEEDED_MATCHES,
  QUALITY,
  RING_START_ANGLE,
  STRICT_MODE_CENTER_MATCHES,
  STRICT_MODE_TOTAL_CHECKPOINTS,
  TOTAL_SEGMENTS,
  WINDOW_SIZE,
} from "./constants"
import { CloseButton } from "@/components/ui/Buttons"
import { AlertModal } from "@/components/Modals/AlertModal"
import { Trans } from "react-i18next"
import { calculateMetrics } from "@/services/facematch/utils"
import {
  analyzeFaceDetectionFromUri,
  analyzeFaceEmbeddingFromUri,
  cleanupSessions,
  initSessions,
} from "modules/facematch"
import {
  FacialLandmarks,
  GazeIndicator,
  useDebugInfo,
  DebugPhoto,
  EmbeddingTimingIndicator,
} from "./FaceMatchDebug"
import { Camera } from "react-native-vision-camera"
import { useSettings } from "@/context/SettingsContext"
import { RoundedFrameWithBrackets } from "./RoundedFrameWithBrackets"
import { FaceMatchSuccess } from "./FaceMatchSuccess"
import { InfoContainer } from "../ui/Cards"

export default function FaceMatch({
  passport,
  onComplete,
  mode = "regular",
  onCancel,
  faceMatchTimer,
}: {
  passport: PassportViewModel
  onComplete: (
    dg2Faceprint: Faceprint,
    cosineAvgSimilarity: CosineScore,
    cosineThreshold: CosineScore,
    metrics: FaceMatchMetrics,
  ) => void
  mode?: FacematchMode
  onCancel: (metrics: FaceMatchMetrics) => void
  faceMatchTimer?: {
    startSubOperation: (name: string) => void
    endSubOperation: (name: string) => void
  } | null
}) {
  const { t } = useTranslation()
  const cameraRef = useRef<Camera | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [cosineScore, setCosineScore] = useState<number | null>(null)
  const matchWindowRef = useRef<boolean[]>([])
  const matchHistoryRef = useRef<number[]>([])
  const poseHistoryRef = useRef<FacePose[]>([])
  const livenessTargetRef = useRef<LivenessTargetState | null>(null)
  const livenessProgressRef = useRef<LivenessProgress>(createInitialLivenessProgress())
  const [livenessProgressVersion, setLivenessProgressVersion] = useState(0)
  const ringProgressAnim = useRef(new Animated.Value(0)).current
  const runningRef = useRef<boolean>(false)
  const completedRef = useRef<boolean>(false)
  const nextTimeoutRef = useRef<number | null>(null)
  const cameraReadyRef = useRef<boolean>(false)
  const captureCountRef = useRef<number>(0) // Track capture count for embedding throttling
  const [isLiveness, setIsLiveness] = useState<boolean>(false)
  const isLivenessRef = useRef<boolean>(false)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const normalMatchesRef = useRef<number>(0) // Track center pose matches in strict mode
  const previousSegmentsActiveRef = useRef<number>(0) // Track previous segments for haptic feedback
  const lastMatchTimeRef = useRef<number>(Date.now()) // Track last match time for timeout
  const timeoutCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null) // Interval to check for timeout
  const [showTimeoutModal, setShowTimeoutModal] = useState(false) // State for showing timeout modal
  const FACEMATCH_TIMEOUT_MS = 60000 // 60 seconds timeout

  const segmentsTotal = TOTAL_SEGMENTS
  const [segmentsActive, setSegmentsActive] = useState(0)
  const { width } = Dimensions.get("window")
  const ringSize = Math.min(width, 420)
  const segSize = ringSize * 1.07
  const frameSize = ringSize * 0.8
  // Calculate offset to center segmented ring around frame
  // TODO: figure out if we need this
  // const ringOffset = (segSize - frameSize) / 2
  const { settings } = useSettings()
  const debugEnabled = !!settings.faceMatchDebug

  // const something = true // TESTING

  // Animation values for square-to-circle transition
  const [faceDetected, setFaceDetected] = useState<boolean>(false)
  const borderRadiusAnim = useRef(new Animated.Value(32)).current
  const bracketsOpacityAnim = useRef(new Animated.Value(1)).current
  const segmentedRingOpacityAnim = useRef(new Animated.Value(0)).current
  const noseX = useRef(new Animated.Value(frameSize / 2)).current
  const noseY = useRef(new Animated.Value(frameSize / 2)).current

  const livenessMode = isLiveness || isLivenessRef.current
  // const [analysis, setAnalysis] = useState<string>("")
  // const [errMsg, setErrMsg] = useState<string>("")
  const [referenceEmbedding, setReferenceEmbedding] = useState<Faceprint | null>(null)
  // Debug photo state - stores the photo being sent to models for visualization
  const [debugPhotoUri, setDebugPhotoUri] = useState<string | null>(null)
  // Embedding timing state - tracks start time, duration, and running status
  const [embeddingTiming, setEmbeddingTiming] = useState<{
    startTime: number | null
    duration: number | null
    isRunning: boolean
  }>({ startTime: null, duration: null, isRunning: false })
  // Fast detection state - updates at high FPS from SCRFD
  const [liveDetection, setLiveDetection] = useState<{
    pose: FacePose
    gaze: GazeDirection2D
    landmarks: FaceLandmarks
    detectionDims: { width: number; height: number } // Dimensions used for detection (may be downscaled)
  } | null>(null)
  // Slow embedding state - updates at lower FPS from ArcFace
  const [liveAnalysis, setLiveAnalysis] = useState<{
    embedding: Faceprint
    pose: FacePose
    gaze: GazeDirection2D
    landmarks?: FaceLandmarks
  } | null>(null)
  const lastPhotoDimensionsRef = useRef<{ width: number; height: number } | null>(null)

  const resetLivenessProgress = useCallback(() => {
    livenessProgressRef.current = createInitialLivenessProgress()
    setLivenessProgressVersion((v) => v + 1)
  }, [])

  // Memoize camera callbacks to prevent unnecessary re-renders
  const handleReadyChange = useCallback((ready: boolean) => {
    cameraReadyRef.current = ready
  }, [])

  const currentLivenessTarget = useMemo<LivenessTargetState | null>(() => {
    if (!livenessMode) return null
    if (LIVENESS_SCHEDULE.length === 0) return null
    const progress = livenessProgressRef.current
    const scheduleIndex = Math.min(progress.currentIndex, LIVENESS_SCHEDULE.length - 1)
    const target = LIVENESS_SCHEDULE[scheduleIndex]
    const activeSegmentIndex = target.segmentIndex
    const activeAngleDeg = segmentIndexToAngle(activeSegmentIndex)

    return {
      activeSegmentIndex,
      activeAngleDeg,
      target,
      schedule: LIVENESS_SCHEDULE,
    }
  }, [livenessMode, livenessProgressVersion])

  useEffect(() => {
    livenessTargetRef.current = currentLivenessTarget
  }, [currentLivenessTarget])

  const livenessRingState = useMemo(() => {
    if (!livenessMode) return null
    const progress = livenessProgressRef.current
    const completedIndices = LIVENESS_SCHEDULE.filter((entry) => {
      const count = progress.matchesPerTarget.get(entry.segmentIndex) ?? 0
      return count >= LIVENESS_MATCHES_PER_TARGET
    }).map((entry) => entry.segmentIndex)

    // Calculate ring fill: 25% per completed liveness target (4 targets total)
    const completedTargets = completedIndices.length
    const segmentsToFill = Math.floor(
      (completedTargets / LIVENESS_SCHEDULE.length) * TOTAL_SEGMENTS,
    )

    return { completedIndices, segmentsToFill }
  }, [livenessMode, livenessProgressVersion, currentLivenessTarget])

  const livenessInstruction = useMemo(() => {
    if (!livenessMode) return null
    if (!currentLivenessTarget) {
      // Return default instruction when target is not ready yet
      return t("facematch.instruction_center")
    }

    const directions = ["left", "up", "right", "down"]
    const currentDirection = directions[currentLivenessTarget.target.order] || "left"
    const gazeMagnitude = liveDetection?.gaze?.magnitude
    const gazeAngleDeg = liveDetection?.gaze?.angleDeg
    const currentCosineScore = cosineScore

    // Dynamic instruction based on gaze magnitude and cosine score
    if (gazeMagnitude !== undefined && gazeAngleDeg !== undefined && currentCosineScore !== null) {
      // Check if user has reached the correct yaw threshold
      const poseValidation = validatePoseForLiveness(
        gazeMagnitude,
        gazeAngleDeg,
        currentLivenessTarget.target.angleDeg,
      )

      // If both magnitude and angle are valid, tell user to hold still
      if (poseValidation.magnitudeValid && poseValidation.angleValid) {
        return (
          <Trans
            i18nKey="facematch.hold_still"
            components={{ bold: <Text style={{ fontWeight: "700", color: "#F6D38F" }} /> }}
          />
        )
      }

      // If gaze magnitude is too high and cosine score is low, tell user to look less
      if (
        gazeMagnitude > MAX_GAZE_MAGNITUDE_THRESHOLD &&
        currentCosineScore < COSINE_SCORE_THRESHOLD
      ) {
        return (
          <Trans
            i18nKey={`facematch.look_less_${currentDirection}`}
            components={{ bold: <Text style={{ fontWeight: "700", color: "#F6D38F" }} /> }}
          />
        )
      }

      // If user is looking in the right direction but not far enough, tell them to look further
      if (poseValidation.angleValid && gazeMagnitude < MIN_GAZE_MAGNITUDE_THRESHOLD) {
        return (
          <Trans
            i18nKey={`facematch.look_further_${currentDirection}`}
            components={{ bold: <Text style={{ fontWeight: "700", color: "#F6D38F" }} /> }}
          />
        )
      }
    }

    // Default instruction - always return a directional instruction when target is available
    return (
      <Trans
        i18nKey={`facematch.look_${currentDirection}`}
        components={{ bold: <Text style={{ fontWeight: "700", color: "#F6D38F" }} /> }}
      />
    )
  }, [
    livenessMode,
    currentLivenessTarget,
    liveDetection?.gaze?.magnitude,
    liveDetection?.gaze?.angleDeg,
    cosineScore,
    t,
  ])

  // When in liveness mode and face is detected, show liveness instructions
  // The livenessInstruction memo always returns a value when in liveness mode
  const livenessInstructionText =
    faceDetected && livenessMode
      ? (livenessInstruction ?? t("facematch.instruction_center"))
      : faceDetected
        ? t("facematch.instruction_center")
        : t("facematch.nofaceDetected")

  // title for the facematch screen
  // In liveness mode with face detected, use the liveness instruction text as the title
  const titleText2 =
    isLiveness && faceDetected
      ? livenessInstructionText
      : isLiveness
        ? t("facematch.instruction_center")
        : t("facematch.title")
  const titletext = faceDetected ? titleText2 : t("facematch.titleNoFaceDetected")

  const currentLivenessDirection = useMemo(() => {
    if (!livenessMode || !currentLivenessTarget) return null
    const directions = ["left", "up", "right", "down"] as const
    return directions[currentLivenessTarget.target.order] || null
  }, [livenessMode, currentLivenessTarget])

  const debugInfo = useDebugInfo({
    cosineScore,
    pose: liveDetection?.pose,
    gaze: liveDetection?.gaze,
    livenessMode,
    currentLivenessTarget,
    livenessProgress: livenessProgressRef.current,
    segmentsActive,
    segmentsTotal,
  })

  const debugScoreIsMatch = cosineScore !== null && cosineScore > COSINE_SCORE_THRESHOLD

  // Handle cancel with current metrics
  const handleCancel = useCallback(() => {
    // Calculate metrics from collected data
    const metrics = calculateMetrics(matchHistoryRef.current, poseHistoryRef.current)
    metrics.mode = mode
    metrics.completed = false
    onCancel(metrics)
  }, [mode, onCancel])

  // Handle timeout modal close
  const handleTimeoutClose = useCallback(() => {
    setShowTimeoutModal(false)
    // Calculate metrics from collected data
    const metrics = calculateMetrics(matchHistoryRef.current, poseHistoryRef.current)
    metrics.mode = mode
    metrics.completed = false
    onCancel(metrics)
  }, [mode, onCancel])

  // Add listener to track animated progress value
  useEffect(() => {
    const listener = ringProgressAnim.addListener(({ value }) => {
      // console.log("ringProgressAnim", Math.ceil(value))
      const newSegmentsActive = Math.ceil(value)
      setSegmentsActive(newSegmentsActive)

      // Provide light haptic feedback when ring segments increase
      if (
        newSegmentsActive > previousSegmentsActiveRef.current &&
        newSegmentsActive < segmentsTotal
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      previousSegmentsActiveRef.current = newSegmentsActive
    })
    return () => {
      ringProgressAnim.removeListener(listener)
    }
  }, [ringProgressAnim, segmentsTotal])

  // Handle cosine score updates
  const updateCosineScore = useCallback(
    (newCosineScore: number | null, facePose?: FacePose, gazeDir?: GazeDirection2D) => {
      if (completedRef.current) return
      setCosineScore(newCosineScore)
      // Add new match result to window (false for null scores)
      const isMatch = newCosineScore !== null && newCosineScore > COSINE_SCORE_THRESHOLD
      if (isMatch) {
        // Reset the timeout when a match is detected
        lastMatchTimeRef.current = Date.now()
        // In strict mode, handle center pose checkpoint first
        if (mode === "strict" && !isLivenessRef.current) {
          matchHistoryRef.current.push(newCosineScore)
          matchWindowRef.current.push(isMatch)
          if (facePose) {
            poseHistoryRef.current.push(facePose)
          }
          normalMatchesRef.current += 1

          // Calculate ring progress for center checkpoint (20% = 1/5 of total)
          const centerProgress = Math.min(
            normalMatchesRef.current / STRICT_MODE_CENTER_MATCHES,
            1.0,
          )
          const targetSegments = Math.floor(
            (centerProgress / STRICT_MODE_TOTAL_CHECKPOINTS) * segmentsTotal,
          )

          Animated.timing(ringProgressAnim, {
            toValue: targetSegments,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start()

          // Transition to liveness after completing center checkpoint
          if (normalMatchesRef.current >= STRICT_MODE_CENTER_MATCHES) {
            // Medium haptic feedback for center checkpoint completion
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            isLivenessRef.current = true
            setIsLiveness(true)
            resetLivenessProgress()
            faceMatchTimer?.startSubOperation("liveness_check")
          }
          return
        }

        if (isLivenessRef.current) {
          const targetState = livenessTargetRef.current
          if (!facePose || !targetState) {
            if (debugEnabled) console.log("[Liveness] Missing pose or target; skipping match")
            return
          }

          // Use provided gazeDir (from fresh analysis) to avoid stale state
          if (!gazeDir) {
            return
          }
          const currentGazeDirection = gazeDir
          const { magnitude, angleDeg } = currentGazeDirection
          if (Math.abs(magnitude) < GAZE_VECTOR_EPSILON) {
            if (debugEnabled) console.log("[Liveness] Gaze vector too small; skipping match")
            return
          }

          const targetAngle = targetState.target.angleDeg

          // Validate gaze magnitude and direction for liveness
          const poseValidation = validatePoseForLiveness(magnitude, angleDeg, targetAngle)

          if (!poseValidation.isValid) {
            if (debugEnabled) console.log(`[Liveness] Validation failed: ${poseValidation.reason}`)
            return
          }

          const progress = livenessProgressRef.current
          const segmentIndex = targetState.target.segmentIndex
          const previousCount = progress.matchesPerTarget.get(segmentIndex) ?? 0
          const newCount = previousCount + 1
          progress.matchesPerTarget.set(segmentIndex, newCount)
          progress.poseSamples.push(facePose)
          progress.lastAcceptedAt = Date.now()

          // Check if this target just completed
          if (
            previousCount < LIVENESS_MATCHES_PER_TARGET &&
            newCount >= LIVENESS_MATCHES_PER_TARGET
          ) {
            // Medium haptic feedback for liveness target completion
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          }

          if (
            newCount >= LIVENESS_MATCHES_PER_TARGET &&
            progress.currentIndex < LIVENESS_SCHEDULE.length - 1
          ) {
            progress.currentIndex += 1
          }
          setLivenessProgressVersion((v) => v + 1)

          // In strict mode: 5 checkpoints (1 center + 4 liveness = 20% each)
          const completedCount = Array.from(progress.matchesPerTarget.values()).filter(
            (count) => count >= LIVENESS_MATCHES_PER_TARGET,
          ).length

          // Center checkpoint already filled 20%, each liveness adds another 20%
          const centerCheckpoints = 1 // Already completed
          const totalCheckpoints = centerCheckpoints + completedCount
          const targetSegments = Math.floor(
            (totalCheckpoints / STRICT_MODE_TOTAL_CHECKPOINTS) * segmentsTotal,
          )

          Animated.timing(ringProgressAnim, {
            toValue: targetSegments,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start()

          matchHistoryRef.current.push(newCosineScore)
          matchWindowRef.current.push(isMatch)
        } else {
          matchHistoryRef.current.push(newCosineScore)
          matchWindowRef.current.push(isMatch)
        }
      }
      if (isMatch && facePose) {
        poseHistoryRef.current.push(facePose)
      }
      // Keep window size at most WINDOW_SIZE
      if (matchWindowRef.current.length > WINDOW_SIZE) matchWindowRef.current.shift()
      // Keep history size at most NEEDED_MATCHES
      if (matchHistoryRef.current.length > NEEDED_MATCHES) matchHistoryRef.current.shift()
      // Compute progress: percentage of matches in window
      const matches = matchWindowRef.current.filter(Boolean).length
      // Ring progress: reaches 100% when we have NEEDED_MATCHES out of WINDOW_SIZE matches
      const ringProgress = matches === 0 ? 0 : Math.min(matches / NEEDED_MATCHES, 1.0)

      // Check completion conditions based on mode
      let shouldComplete = false

      if (mode === "strict") {
        // Strict mode: need center checkpoint + all liveness targets
        if (isLivenessRef.current) {
          const progress = livenessProgressRef.current
          const allTargetsSatisfied = LIVENESS_SCHEDULE.every((entry) => {
            const count = progress.matchesPerTarget.get(entry.segmentIndex) ?? 0
            return count >= LIVENESS_MATCHES_PER_TARGET
          })
          shouldComplete =
            allTargetsSatisfied && normalMatchesRef.current >= STRICT_MODE_CENTER_MATCHES
        }
      } else {
        // Regular mode: standard match count
        if (matches + 1 >= NEEDED_MATCHES) {
          shouldComplete = true
        }
      }

      if (shouldComplete) {
        // End liveness sub-timer if it was started
        if (isLivenessRef.current) {
          faceMatchTimer?.endSubOperation("liveness_check")
        }

        // Calculate metrics from collected data
        // Mark as complete and prevent further updates
        completedRef.current = true
        setIsCompleted(true)

        // Success haptic feedback for completion
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

        // Calculate average cosine score
        const cosineAvgSimilarity =
          matchHistoryRef.current.reduce((sum, score) => sum + score, 0) /
          matchHistoryRef.current.length
        if (!referenceEmbedding) throw new Error("Reference embedding not set")

        // Calculate comprehensive metrics
        const metrics = calculateMetrics(matchHistoryRef.current, poseHistoryRef.current)
        metrics.mode = mode
        metrics.completed = true

        cameraReadyRef.current = false
        Animated.timing(ringProgressAnim, {
          toValue: segmentsTotal,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          // Wait a bit to show the animation before calling onComplete
          setTimeout(() => {
            onComplete(referenceEmbedding, cosineAvgSimilarity, COSINE_SCORE_THRESHOLD, metrics)
          }, 1500)
        })

        return
      }

      // Animate the ring progress smoothly (only in non-liveness mode)
      // In liveness mode, ring animation is handled when targets are completed
      if (!isLivenessRef.current) {
        Animated.timing(ringProgressAnim, {
          toValue: Math.min(Math.ceil(ringProgress * segmentsTotal), segmentsTotal),
          duration: 1500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start()
      }
    },
    [
      ringProgressAnim,
      referenceEmbedding,
      completedRef,
      matchWindowRef,
      poseHistoryRef,
      matchHistoryRef,
      livenessTargetRef,
      resetLivenessProgress,
      mode,
      segmentsTotal,
      debugEnabled,
      onComplete,
    ],
  )

  // Initialize model sessions once on mount
  useEffect(() => {
    ;(async () => {
      try {
        console.log("[FaceMatch] Initializing model sessions...")
        const initStart = Date.now()
        const DETECTOR_MODEL = "scrfd_2.5g_bnkps.ort"
        const RECOGNITION_MODEL = "arcface.ort"

        const result = await initSessions(DETECTOR_MODEL, RECOGNITION_MODEL)
        const initTime = Date.now() - initStart

        const parsed = JSON.parse(result || "{}")
        if (parsed.error) {
          console.error("[FaceMatch] Failed to initialize sessions:", parsed.error)
        } else {
          console.log(`[FaceMatch] Sessions initialized successfully in ${initTime}ms`)
        }
      } catch (e: any) {
        console.error("[FaceMatch] Error initializing sessions:", e)
      }
    })()

    return () => {
      // Cleanup sessions on unmount
      console.log("[FaceMatch] Cleaning up model sessions...")
      cleanupSessions()
        .then((result) => {
          const parsed = JSON.parse(result || "{}")
          if (parsed.error) {
            console.error("[FaceMatch] Failed to cleanup sessions:", parsed.error)
          } else {
            console.log("[FaceMatch] Sessions cleaned up successfully")
          }
        })
        .catch((e) => {
          console.error("[FaceMatch] Error cleaning up sessions:", e)
        })
    }
  }, [])

  // Set up timeout check interval
  useEffect(() => {
    // Reset last match time when component mounts
    lastMatchTimeRef.current = Date.now()

    // Set up interval to check for timeout
    timeoutCheckIntervalRef.current = setInterval(() => {
      if (completedRef.current || showTimeoutModal) return

      const timeSinceLastMatch = Date.now() - lastMatchTimeRef.current
      if (timeSinceLastMatch >= FACEMATCH_TIMEOUT_MS) {
        setShowTimeoutModal(true)
        // Clear the interval to stop checking
        if (timeoutCheckIntervalRef.current) {
          clearInterval(timeoutCheckIntervalRef.current)
          timeoutCheckIntervalRef.current = null
        }
      }
    }, 1000) // Check every second

    return () => {
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current)
        timeoutCheckIntervalRef.current = null
      }
    }
  }, [showTimeoutModal])

  // Analyze the selected bundled passport photo and cache its embedding
  useEffect(() => {
    let isMounted = true
    ;(async () => {
      try {
        if (passport && passport.originalPhoto) {
          // Use decoupled approach: detection first, then embedding
          const detectionJson = await analyzeFaceDetectionFromUri(passport.originalPhoto)
          const detection = JSON.parse(detectionJson || "{}") as FaceDetectionResponse

          if (!detection?.landmarks || detection.landmarks.length !== 5) {
            throw new Error("reference_no_face_detected")
          }
          const embeddingJson = await analyzeFaceEmbeddingFromUri(
            passport.originalPhoto,
            detection.landmarks,
          )
          const embeddingResult = JSON.parse(embeddingJson || "{}") as FaceEmbeddingResponse

          if (embeddingResult?.embedding && Array.isArray(embeddingResult.embedding)) {
            if (isMounted) setReferenceEmbedding(embeddingResult.embedding as Faceprint)
          } else if ((embeddingResult as any).error) {
            throw new Error(`reference_analyze_error: ${(embeddingResult as any).error}`)
          } else {
            throw new Error("reference_analyze_missing_embedding")
          }
        }
      } catch (e: any) {
        const message = String(e?.message ?? e)
        console.error("FaceMatch failed to load reference embedding", message)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [passport])

  useEffect(() => {
    if (!permission) return
    if (!permission.granted) return

    let isMounted = true

    const scheduleNext = () => {
      if (!isMounted) return
      // Avoid overlapping runs
      if (nextTimeoutRef.current != null) clearTimeout(nextTimeoutRef.current as any)
      nextTimeoutRef.current = setTimeout(() => {
        void captureAndAnalyze()
      }, 1) as unknown as number
    }

    const captureAndAnalyze = async () => {
      // Should not happen with self-scheduling, but guard anyway
      // const captureStart = Date.now()
      if (runningRef.current) return
      runningRef.current = true
      try {
        const cam = cameraRef.current
        if (!cam) return
        if (!cameraReadyRef.current) {
          console.log(`[FM] Camera not ready yet; skipping this cycle`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return
        }
        console.log("Quality setting to", QUALITY)
        const cameraStart = Date.now()
        const photo = await cam.takeSnapshot({
          quality: QUALITY,
          // skipMetadata: true,
        })
        const cameraTime = Date.now() - cameraStart
        console.log(`[FM] Vision Camera snapshot took ${cameraTime}ms`)
        if (!photo?.path) return

        const sourceUri = `file://${photo.path}`
        const photoWidth = photo.width || 0
        const photoHeight = photo.height || 0

        console.log(`[FM] Snapshot captured: ${photoWidth}x${photoHeight}`)

        // Store dimensions for landmark mapping
        lastPhotoDimensionsRef.current = { width: photoWidth, height: photoHeight }

        if (isMounted)
          if (!referenceEmbedding) {
            // setLastAnalyzedSize({ width: (photo as any).width, height: (photo as any).height })
            // if (isMounted) setLastAnalyzedUri(sourceUri)
            console.warn(`No current reference uri; skipping this cycle`)
            await new Promise((resolve) => setTimeout(resolve, 500))
            return
          }

        // Increment capture count for embedding throttling
        captureCountRef.current++

        // Check if we'll run embedding on this frame
        const willRunEmbedding = captureCountRef.current % EMBEDDING_THROTTLE === 0
        const fullDims = lastPhotoDimensionsRef.current

        // Decoupled detection and embedding calls for better performance
        const detectionStart = Date.now()
        console.log(
          `[FM] Capture #${captureCountRef.current} - Calling analyzeFaceDetectionFromUri (fast path)...`,
        )
        const detectionJson = await analyzeFaceDetectionFromUri(sourceUri)
        const detectionTime = Date.now() - detectionStart
        console.log(`[FM] Detection returned in ${detectionTime}ms: ${detectionJson}`)

        if (isMounted) {
          try {
            const detection = JSON.parse(detectionJson || "{}") as FaceDetectionResponse
            if (!detection?.landmarks || detection.landmarks.length !== 5) {
              console.log("[FM] No face detected")
              updateCosineScore(null)
              setLiveDetection(null)
              setLiveAnalysis(null)
              setFaceDetected(false)
              return
            }

            // Extract pose and gaze from detection
            const pose: FacePose = {
              pitch: detection.pitch,
              yaw: detection.yaw,
              roll: detection.roll,
            }

            // On Android, flip the gaze angle horizontally to match un-mirrored preview
            // The snapshot is in camera-native orientation, but preview is not mirrored on Android
            let gazeAngleDeg = detection.gaze_angle_deg
            gazeAngleDeg = 180 - gazeAngleDeg
            if (gazeAngleDeg < 0) gazeAngleDeg += 360

            const gaze: GazeDirection2D = {
              magnitude: detection.gaze_magnitude,
              angleDeg: gazeAngleDeg,
            }

            // Update nose position immediately for smooth UI (fast path)
            // Use detection dimensions (may be downscaled) not original dimensions
            const noseLandmark = detection.landmarks[2] // nose is index 2
            if (noseLandmark && noseLandmark.length === 2) {
              // Landmarks are in the detection image space (may be downscaled)
              // Normalize by detection dimensions, then scale to frame size
              let noseXNorm = noseLandmark[0] / fullDims.width
              let noseYNorm = noseLandmark[1] / fullDims.height

              // On Android, flip X coordinate horizontally to match un-mirrored preview
              if (Platform.OS === "android") {
                noseXNorm = 1 - noseXNorm
              }

              // Map to frame coordinates
              const noseXPos = noseXNorm * frameSize
              const noseYPos = noseYNorm * frameSize

              Animated.timing(noseX, {
                toValue: noseXPos,
                duration: 100,
                useNativeDriver: false,
              }).start()
              Animated.timing(noseY, {
                toValue: noseYPos,
                duration: 100,
                useNativeDriver: false,
              }).start()
            }

            setFaceDetected(true)

            // Update detection state immediately for smooth UI (pose, gaze, landmarks)
            setLiveDetection({
              pose,
              gaze,
              landmarks: detection.landmarks,
              detectionDims: fullDims, // Store dimensions used for detection
            })

            // NEW: Throttle embedding calls - only every 10th capture
            // This keeps UI smooth while still getting face matching updates
            if (willRunEmbedding) {
              // Update debug photo for visualization
              if (debugEnabled) {
                setDebugPhotoUri(sourceUri)
              }

              console.log(`[FM] Starting analyzeFaceEmbedding in background (slow path)...`)
              const embeddingStart = Date.now()

              // Update embedding timing state
              if (debugEnabled) {
                setEmbeddingTiming({
                  startTime: embeddingStart,
                  duration: null,
                  isRunning: true,
                })
              }
              analyzeFaceEmbeddingFromUri(sourceUri, detection.landmarks)
                .then((embeddingJson) => {
                  const embeddingTime = Date.now() - embeddingStart
                  console.log(`[FM] Embedding completed in ${embeddingTime}ms: ${embeddingJson}`)

                  // Update embedding timing state
                  if (debugEnabled) {
                    setEmbeddingTiming((prev) => ({
                      ...prev,
                      duration: embeddingTime,
                      isRunning: false,
                    }))
                  }

                  if (!isMounted) return

                  const embeddingResult = JSON.parse(embeddingJson || "{}") as FaceEmbeddingResponse
                  if (!embeddingResult?.embedding || !Array.isArray(embeddingResult.embedding)) {
                    console.log("[FM] No embedding generated")
                    return
                  }

                  // Atomic state update with full analysis data
                  setLiveAnalysis({
                    embedding: embeddingResult.embedding as Faceprint,
                    pose,
                    gaze,
                    landmarks: detection.landmarks,
                  })
                })
                .catch((e) => {
                  console.log("[FM] Error generating embedding:", e)
                })
            } else {
              console.log(`[FM] Skipping embedding (throttled - frame ${captureCountRef.current})`)
            }

            // Return immediately - don't wait for embedding to complete

            // Return immediately - don't wait for embedding to complete
          } catch (_e) {
            console.log("[FM] Error parsing detection:", _e)
            updateCosineScore(null)
            setLiveDetection(null)
            setLiveDetection(null)
            setLiveAnalysis(null)
            setFaceDetected(false)
          }
        }
      } catch (err: any) {
        const message = String(err?.message ?? err)
        if (
          message.includes("Camera is not ready yet") ||
          message.includes("Image could not be captured")
        ) {
          // Ignore transient startup capture errors
          console.warn(`Transient capture issue; ignoring: ${message}`)
        } else {
          console.warn(`Error:`, err)
          // if (isMounted) setErrMsg(message)
        }
        updateCosineScore(null)
        setLiveDetection(null)
        setLiveDetection(null)
        setLiveAnalysis(null)
        await new Promise((resolve) => setTimeout(resolve, 500))
      } finally {
        runningRef.current = false
        // const captureTime = Date.now() - captureStart
        // console.log(`[FM] Capture and analyze took ${captureTime}ms`)
        scheduleNext()
      }
    }

    // Kick off first run
    void captureAndAnalyze()

    return () => {
      isMounted = false
      if (nextTimeoutRef.current != null) {
        clearTimeout(nextTimeoutRef.current as any)
        nextTimeoutRef.current = null
      }
      runningRef.current = false
    }
  }, [permission?.granted, referenceEmbedding])

  // Compute cosine similarity when both embeddings are available
  useEffect(() => {
    if (!referenceEmbedding || !liveAnalysis) return updateCosineScore(null)
    const normLive = l2Norm(liveAnalysis.embedding)
    const normRef = l2Norm(referenceEmbedding)
    const score = cosine(normLive, normRef)

    // Pass all data atomically to prevent races
    // Use the most recent detection data (liveDetection) if available, otherwise use liveAnalysis
    const pose = liveDetection?.pose ?? liveAnalysis.pose
    const gaze = liveDetection?.gaze ?? liveAnalysis.gaze
    updateCosineScore(score, pose, gaze)
  }, [referenceEmbedding, liveAnalysis, liveDetection, updateCosineScore])

  // Reset progress when reference target changes
  useEffect(() => {
    matchWindowRef.current = []
    matchHistoryRef.current = []
    poseHistoryRef.current = []
    normalMatchesRef.current = 0
    setIsLiveness(false)
    isLivenessRef.current = false
    setIsCompleted(false)
    completedRef.current = false
    Animated.timing(ringProgressAnim, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    }).start()
  }, [passport])

  // Animate frame shape when face is detected
  useEffect(() => {
    if (faceDetected) {
      // Transition to circle
      Animated.parallel([
        Animated.timing(borderRadiusAnim, {
          toValue: frameSize / 2, // Full circle
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(bracketsOpacityAnim, {
          toValue: 0, // Fade out brackets
          duration: 400,
          useNativeDriver: false,
        }),
        Animated.timing(segmentedRingOpacityAnim, {
          toValue: 1, // Fade in segmented ring
          duration: 400,
          delay: 200, // Start after brackets fade out
          useNativeDriver: false,
        }),
      ]).start()
    } else {
      // Transition back to rounded square
      Animated.parallel([
        Animated.timing(borderRadiusAnim, {
          toValue: 32, // Rounded square
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(bracketsOpacityAnim, {
          toValue: 1, // Fade in brackets
          duration: 400,
          useNativeDriver: false,
        }),
        Animated.timing(segmentedRingOpacityAnim, {
          toValue: 0, // Fade out segmented ring
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start()
    }
  }, [faceDetected, borderRadiusAnim, bracketsOpacityAnim, segmentedRingOpacityAnim, frameSize])

  if (!permission) return <View style={styles.container} />
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>{t("facematch.permissionText")}</Text>
        <Pressable onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>{t("facematch.grantPermission")}</Text>
        </Pressable>
      </View>
    )
  }

  // Render timeout modal description with bold text
  const renderTimeoutDescription = () => (
    <Trans
      i18nKey="facematch.timeout.description"
      components={{
        bold: <Text style={{ fontWeight: "700" }} />,
      }}
    />
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Timeout Modal */}
      <AlertModal
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        visible={showTimeoutModal}
        onClose={handleTimeoutClose}
        onAccept={handleTimeoutClose}
        title={t("facematch.timeout.title")}
        description={renderTimeoutDescription()}
        buttonText2={t("close")}
      />
      <View style={styles.container}>
        <CloseButton onPress={handleCancel} style={styles.closeButton} />
        <View
          style={{
            width: ringSize,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginTop: Platform.OS === "ios" ? 50 : 150,
          }}
        >
          {!isCompleted && (
            <>
              {/* Segmented ring - shows when face detected - positioned outside frame */}
              <SegmentedRing
                size={segSize}
                ringThickness={22}
                segmentsTotal={segmentsTotal}
                segmentsActive={segmentsActive}
                gapDegrees={2}
                startAngle={RING_START_ANGLE}
                inactiveColor="rgba(163, 172, 184, 0.3)"
                activeColor="#F4D8A0"
                completedIndices={livenessRingState?.completedIndices}
                completedColor="#F4D8A0"
                opacity={segmentedRingOpacityAnim}
              >
                {/* Frame with camera inside */}
                <Animated.View
                  style={{
                    width: frameSize,
                    height: frameSize,
                    backgroundColor: "#000000",
                    borderRadius: borderRadiusAnim,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Camera feed */}
                  <FaceMatchCamera
                    cameraRef={cameraRef}
                    onReadyChange={handleReadyChange}
                    width={frameSize}
                    height={frameSize}
                    scale={1.1}
                  />

                  {/* Directional arrow overlay for liveness check */}
                  <DirectionalArrowOverlay direction={currentLivenessDirection} size={ringSize} />

                  {/* Face crosshair - tracks nose position - only in liveness mode */}
                  {/* {faceDetected && livenessMode && (
                      <FaceCrosshair
                        size={frameSize}
                        noseX={noseX}
                        noseY={noseY}
                        gaze={liveDetection?.gaze}
                        color="#F4D8A0"
                        strokeWidth={3}
                      />
                    )} */}

                  {/* Rounded frame with brackets - animated */}
                  <Animated.View
                    style={{
                      opacity: bracketsOpacityAnim,
                    }}
                  >
                    <RoundedFrameWithBrackets
                      size={frameSize}
                      borderRadius={borderRadiusAnim}
                      borderColor="#FFFFFF"
                      borderWidth={3}
                      bracketsOpacity={1}
                    />
                  </Animated.View>

                  {/* Debug gaze indicator - uses fast detection data */}
                  {debugEnabled && (
                    <GazeIndicator gaze={liveDetection?.gaze} frameSize={frameSize} />
                  )}

                  {/* Debug facial landmarks - uses fast detection data */}
                  {debugEnabled && (
                    <FacialLandmarks
                      landmarks={liveDetection?.landmarks}
                      frameSize={frameSize}
                      photoDimensions={liveDetection?.detectionDims ?? null}
                    />
                  )}

                  {/* Debug photo display - shows the photo being sent to models */}
                  {debugEnabled && <DebugPhoto photoUri={debugPhotoUri} />}

                  {/* Embedding timing indicator - shows timing for Rust module calls */}
                  {debugEnabled && (
                    <EmbeddingTimingIndicator
                      startTime={embeddingTiming.startTime}
                      duration={embeddingTiming.duration}
                      isRunning={embeddingTiming.isRunning}
                    />
                  )}
                </Animated.View>
              </SegmentedRing>
            </>
          )}

          {isCompleted && (
            /* Success screen - shown when facematch is complete */
            <FaceMatchSuccess frameSize={frameSize} segSize={segSize} />
          )}

          <View style={styles.belowCamera}>
            <View style={styles.textCentered}>
              {/* Instruction text - shown below camera when not completed */}
              {!isCompleted && (
                <>
                  {/* Debug: Cosine score */}
                  {debugEnabled && debugInfo ? (
                    <View
                      style={[
                        styles.scorePill,
                        debugScoreIsMatch ? styles.scorePillMatch : undefined,
                      ]}
                      pointerEvents="none"
                    >
                      <Text
                        style={[
                          styles.scoreText,
                          debugScoreIsMatch ? styles.scoreTextMatch : undefined,
                        ]}
                      >
                        {debugInfo}
                      </Text>
                    </View>
                  ) : (
                    /* Title and instructions - shown when debug is off */
                    <View style={styles.titleAndInstructionsContainer}>
                      {!faceDetected ? (
                        <View style={styles.titleRow}>
                          <Text style={styles.titleBelow}>
                            <Trans
                              i18nKey="facematch.faceMatchText"
                              components={{
                                bold: <Text style={styles.titleBelowBold} />,
                              }}
                            />
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.titleBelow}>{titletext}</Text>
                      )}
                      {!faceDetected && (
                        <Text style={styles.instructionTextBelow2}>{livenessInstructionText}</Text>
                      )}
                      {!faceDetected && (
                        <>
                          <View style={{ marginTop: 32 }} />
                          <InfoContainer text={t("facematch.facialDataSecure")} />
                        </>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

          <StatusBar style="dark" />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0a2b66",
  },
  container: {
    flex: 1,
    backgroundColor: "#0a2b66",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 20,
  },
  header: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 16,
    zIndex: 10,
    paddingTop: Platform.OS === "ios" ? 30 : 70,
  },
  instructionContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxWidth: 340,
  },
  livenessInstruction: {
    textAlign: "center",
    color: "#FFD700", // Gold color for instructions
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  instructionText: {
    textAlign: "center",
    color: "#E8EFF7",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  instructionContainerBelow: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxWidth: 340,
    marginBottom: 16,
  },
  instructionTextBelow: {
    textAlign: "center",
    color: "#E8EFF7",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  titleAndInstructionsContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  titleRow: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  titleBelow: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    letterSpacing: 0.3,
    maxWidth: 250,
  },
  titleBelowBold: {
    color: "#F6D38F",
    fontWeight: "700",
  },
  titleBelowWhite: {
    color: "#FFFFFF",
  },
  instructionTextBelow2: {
    textAlign: "center",
    color: "#C7D3E3",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: 0.1,
    maxWidth: 340,
  },
  privateFaceMatchContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginTop: 20,
    minWidth: 280,
  },
  privateFaceMatchText: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  privateFaceMatchSubtext: {
    textAlign: "center",
    color: "#FBFBFB",
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 18,
    letterSpacing: 0.1,
    opacity: 0.9,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  textCentered: {
    alignItems: "center",
    justifyContent: "center",
  },
  permissionText: {
    color: "#000",
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1f6feb",
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 44,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 10,
  },
  cameraBox: {
    overflow: "hidden",
    backgroundColor: "#000",
    borderRadius: 12,
  },
  overlayText: {
    color: "#e6edf3",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) as any,
  },
  errorText: {
    color: "#ff6b6b",
    marginTop: 8,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
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
  debugToggle: {
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  debugToggleActive: {
    backgroundColor: "rgba(39, 243, 90, 0.16)",
    borderColor: "rgba(39, 243, 90, 0.6)",
  },
  debugToggleText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#111827",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#374151",
  },
  toggleButtonText: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
  sameSourceButton: {
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#0b1220",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
  },
  sameSourceText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  belowCamera: {
    alignItems: "center",
  },
  facematchLogo: {
    width: 150,
    height: 50,
    marginBottom: 8,
  },
  preview: {
    width: 120,
    height: 90,
    marginBottom: 8,
    marginTop: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#4b5563",
    backgroundColor: "#111827",
  },
  previewMeta: {
    color: "#9ca3af",
    marginBottom: 8,
  },
  cancelButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  cancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  completionContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  completionCircle: {
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: "#1a2e82",
    justifyContent: "center",
    alignItems: "center",
  },
  completionTextContainer: {
    alignItems: "center",
    paddingHorizontal: 30,
    marginTop: 24,
  },
  completionText: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  completionTextGold: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    textAlign: "center",
    letterSpacing: 0.3,
    color: "#F4D8A0",
  },
  completionTextWhite: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  processingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(39, 243, 90, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(39, 243, 90, 0.2)",
    gap: 10,
  },
  processingText: {
    color: "#27F35A",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
})
