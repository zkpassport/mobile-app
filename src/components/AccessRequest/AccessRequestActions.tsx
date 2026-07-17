import React, { useRef, useState, forwardRef, useImperativeHandle } from "react"
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Animated,
  PanResponder,
  LayoutChangeEvent,
} from "react-native"
import { PrimaryButton } from "@/components/ui/Buttons"
import { useTranslation } from "react-i18next"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowRight } from "lucide-react-native"
import * as Haptics from "expo-haptics"

interface AccessRequestActionsProps {
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  isDomainVerified?: boolean
  domainVerifying?: boolean
  isLoading?: boolean
  canContinue?: boolean
  onSlideStart?: () => void
  onSlideEnd?: () => void
}

interface SlideToConfirmProps {
  onEndReached: () => void
  onSlideStart?: () => void
  onSlideEnd?: () => void
  disabled?: boolean
  loading?: boolean
  label: string
}

export interface SlideToConfirmHandle {
  reset: () => void
}

const SlideToConfirm = forwardRef<SlideToConfirmHandle, SlideToConfirmProps>(
  ({ onEndReached, onSlideStart, onSlideEnd, disabled = false, loading = false, label }, ref) => {
    const offsetX = useRef(new Animated.Value(0)).current
    const [containerWidth, setContainerWidth] = useState(0)
    const [thumbWidth, setThumbWidth] = useState(0)
    const canReachEnd = useRef(true)

    // Store current values in refs so PanResponder always has latest values
    const containerWidthRef = useRef(containerWidth)
    const thumbWidthRef = useRef(thumbWidth)
    const disabledRef = useRef(disabled)
    const onSlideStartRef = useRef(onSlideStart)
    const onSlideEndRef = useRef(onSlideEnd)
    const onEndReachedRef = useRef(onEndReached)

    // Keep refs in sync with props
    containerWidthRef.current = containerWidth
    thumbWidthRef.current = thumbWidth
    disabledRef.current = disabled
    onSlideStartRef.current = onSlideStart
    onSlideEndRef.current = onSlideEnd
    onEndReachedRef.current = onEndReached

    const maxSlide = Math.max(0, containerWidth - thumbWidth - 8) // 8 for margin

    // Expose reset function via ref
    useImperativeHandle(ref, () => ({
      reset: () => {
        canReachEnd.current = true
        Animated.timing(offsetX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start()
      },
    }))

    // Interpolate opacity: 1 at start, 0 when fully slid
    const textOpacity = offsetX.interpolate({
      inputRange: [0, maxSlide || 1],
      outputRange: [1, 0],
      extrapolate: "clamp",
    })

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onStartShouldSetPanResponderCapture: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
        onPanResponderGrant: () => {
          canReachEnd.current = true
          onSlideStartRef.current?.()
        },
        onPanResponderMove: (_, gestureState) => {
          if (disabledRef.current || !canReachEnd.current) return
          const currentMaxSlide = containerWidthRef.current - thumbWidthRef.current - 8
          if (gestureState.dx > 0 && gestureState.dx <= currentMaxSlide) {
            offsetX.setValue(gestureState.dx)
          } else if (gestureState.dx > currentMaxSlide && currentMaxSlide > 0) {
            offsetX.setValue(currentMaxSlide)
            if (canReachEnd.current) {
              canReachEnd.current = false
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              onEndReachedRef.current()
              // Keep slider fixed at end position - no animation back
            }
          }
        },
        onPanResponderTerminate: () => {
          onSlideEndRef.current?.()
          // Only reset if end wasn't reached
          if (canReachEnd.current) {
            Animated.timing(offsetX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start()
          }
        },
        onPanResponderRelease: () => {
          onSlideEndRef.current?.()
          // Only reset if end wasn't reached
          if (canReachEnd.current) {
            Animated.timing(offsetX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start()
          }
        },
      }),
    ).current

    const onContainerLayout = (event: LayoutChangeEvent) => {
      setContainerWidth(event.nativeEvent.layout.width)
    }

    const onThumbLayout = (event: LayoutChangeEvent) => {
      setThumbWidth(event.nativeEvent.layout.width)
    }

    return (
      <View style={styles.sliderWrapper}>
        <LinearGradient
          colors={["#F2DCB0", "#F6D38F"]}
          start={[0.5, 0]}
          end={[0.5, 1]}
          style={styles.sliderGradient}
        >
          <View style={styles.sliderContainer} onLayout={onContainerLayout}>
            <Animated.View
              style={[styles.sliderThumb, { transform: [{ translateX: offsetX }] }]}
              onLayout={onThumbLayout}
              {...panResponder.panHandlers}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#F6D38F" />
              ) : (
                <ArrowRight size={24} color="#F6D38F" strokeWidth={2.5} />
              )}
            </Animated.View>
            <Animated.Text style={[styles.sliderText, { opacity: textOpacity }]}>
              {label}
            </Animated.Text>
          </View>
        </LinearGradient>
      </View>
    )
  },
)

SlideToConfirm.displayName = "SlideToConfirm"

export interface AccessRequestActionsHandle {
  resetSlider: () => void
}

export const AccessRequestActions = forwardRef<
  AccessRequestActionsHandle,
  AccessRequestActionsProps
>(
  (
    {
      onConfirm,
      onCancel,
      isDomainVerified = false,
      domainVerifying = false,
      isLoading = false,
      canContinue = false,
      onSlideStart,
      onSlideEnd,
    },
    ref,
  ) => {
    const { t } = useTranslation()
    const sliderRef = useRef<SlideToConfirmHandle>(null)

    // Expose resetSlider function via ref
    useImperativeHandle(ref, () => ({
      resetSlider: () => {
        sliderRef.current?.reset()
      },
    }))

    const isSliderDisabled = !isDomainVerified || isLoading
    const showLoading = domainVerifying || isLoading

    if (!canContinue) {
      return (
        <View style={styles.container}>
          <PrimaryButton text={t("close")} onPress={onCancel} primary bold />
        </View>
      )
    }

    return (
      <View style={styles.container}>
        <View style={[isSliderDisabled && styles.sliderDisabled]}>
          <SlideToConfirm
            ref={sliderRef}
            onEndReached={onConfirm}
            onSlideStart={onSlideStart}
            onSlideEnd={onSlideEnd}
            disabled={isSliderDisabled}
            loading={showLoading}
            label={t("slideToVerify")}
          />
        </View>
      </View>
    )
  },
)

AccessRequestActions.displayName = "AccessRequestActions"

const styles = StyleSheet.create({
  container: {
    gap: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sliderWrapper: {
    borderRadius: 9999,
    overflow: "hidden",
    elevation: 5,
  },
  sliderDisabled: {
    opacity: 0.6,
  },
  sliderGradient: {
    borderRadius: 9999,
  },
  sliderContainer: {
    backgroundColor: "transparent",
    borderRadius: 9999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-start",
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sliderThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D1741",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  sliderText: {
    position: "absolute",
    textAlign: "center",
    width: "100%",
    fontSize: 18,
    color: "#0D1741",
    fontWeight: "600",
  },
})
