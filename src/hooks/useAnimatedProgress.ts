import { useCallback, useRef } from "react"

interface UseAnimatedProgressOptions {
  onProgressChange: (progress: number) => void
}

export const useAnimatedProgress = ({ onProgressChange }: UseAnimatedProgressOptions) => {
  const progressIntervalRef = useRef<number | null>(null)

  // Function to animate progress with exponential decay - optimized for heavy computation
  const animateProgress = useCallback(
    (startProgress: number, targetProgress: number, estimatedTimeMs: number) => {
      // Clear any existing animation
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current as number)
      }
      console.log(
        "Animating progress from",
        startProgress,
        "to",
        targetProgress,
        "in",
        estimatedTimeMs,
        "ms",
      )

      const startTime = Date.now()
      const progressRange = targetProgress - startProgress
      // Time constant controls how quickly we approach the target (smaller = faster initial progress)
      const timeConstant = estimatedTimeMs * 0.5 // Adjust this factor to control the curve shape
      // Use longer interval during heavy computation to avoid blocking
      const updateInterval = 100 // Update every 100ms (reduced frequency for better performance)

      // Use requestAnimationFrame for smoother animations that work better during heavy computation
      const animate = () => {
        const elapsed = Date.now() - startTime
        const normalizedTime = elapsed / estimatedTimeMs

        if (elapsed >= estimatedTimeMs || normalizedTime >= 1) {
          // Time's up, set to target and stop
          onProgressChange(targetProgress)
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
          }
          return
        }

        // Exponential approach: progress slows down as we get closer to target
        // Using 1 - e^(-t/τ) formula for exponential approach
        const progressFactor = 1 - Math.exp(-elapsed / timeConstant)
        const currentProgress = startProgress + progressRange * progressFactor

        // Don't exceed the target
        const clampedProgress = Math.min(currentProgress, targetProgress)
        onProgressChange(clampedProgress)
      }

      progressIntervalRef.current = setInterval(animate, updateInterval)
    },
    [onProgressChange],
  )

  // Cleanup function
  const clearProgressAnimation = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  return {
    animateProgress,
    clearProgressAnimation,
    progressIntervalRef,
  }
}
