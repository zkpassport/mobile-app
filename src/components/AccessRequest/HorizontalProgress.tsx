import { useEffect, useRef } from "react"
import { Animated, Easing, View, StyleSheet } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

const BASE_WIDTH = 180

interface HorizontalProgressProps {
  progress: number
  width?: number
}

export const HorizontalProgress = ({ progress, width = BASE_WIDTH }: HorizontalProgressProps) => {
  const animatedValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [progress, animatedValue])

  const progressWidth = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [0, width],
    extrapolate: "clamp",
  })

  return (
    <View style={styles.horizontalProgressContainer}>
      {/* Progress bar container */}
      <View style={[styles.progressBarContainer, { width }]}>
        {/* Background bar */}
        <View style={styles.progressBarBackground} />

        {/* Progress bar fill - gold gradient */}
        <Animated.View style={[styles.progressBarFill, { width: progressWidth }]}>
          <LinearGradient
            colors={["#F2DCB0", "#F6D38F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.progressGradient}
          />
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  horizontalProgressContainer: {
    alignItems: "center",
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: "#0d1741",
    borderRadius: 9999,
    overflow: "hidden",
    position: "relative",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 9999,
    overflow: "hidden",
  },
  progressGradient: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  progressBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(111, 102, 255, 0.2)",
    borderRadius: 6,
  },
})
