export const COSINE_SCORE_THRESHOLD = 0.5
export const NEEDED_MATCHES = 10
export const WINDOW_SIZE = 20
export const TOTAL_SEGMENTS = 70
export const RING_START_ANGLE = -110
export const SEGMENT_STEP_DEGREES = 360 / TOTAL_SEGMENTS

// Define liveness targets by their gaze angles in degrees
// Before these were hardcoded for the 50 segments, now they are dynamic.
// These represent the actual directions the user should look: left, up, right, down
// Segment indices are computed dynamically from these angles in utils.ts
export const LIVENESS_TARGET_ANGLES = [180, 270, 0, 90] as const

export const LIVENESS_GAZE_TOLERANCE_DEG = 35 // TESTING Values for good UX - increased for debugging
export const GAZE_VECTOR_EPSILON = 1e-3
export const LIVENESS_MATCHES_PER_TARGET = 2 // TESTING Values for good UX

// Strict mode: 5 checkpoints (normal + 4 liveness directions)
export const STRICT_MODE_CENTER_MATCHES = 2 // Number of center pose matches needed before liveness
export const STRICT_MODE_TOTAL_CHECKPOINTS = 5 // 1 center + 4 liveness directions

// While testing, for good UX, we want a larger tolerance, maybe can trade off with more matches per target

// Minimum gaze magnitude threshold for liveness detection (0-1 range)
export const MIN_GAZE_MAGNITUDE_THRESHOLD = 0.23 // Minimum gaze strength to consider valid
export const MAX_GAZE_MAGNITUDE_THRESHOLD = 0.35 // Maximum gaze strength to consider valid
// 0.3 is probs to strict

// This is the ratio of SCRFD model calls to ArcFace model calls
// Set this to '1' to make it even faster, brrrrr
export const EMBEDDING_THROTTLE = 2

export const QUALITY = 40
// This quality, to get the most out of it we are going to have to scale this depending on the device that is connected.
// Anything below 0.5 is not the best for the liveness detection on my irish passport.

// Quality can be dynamic depending if we are running a embedding or a face detection.
