import React, { useEffect, useRef } from "react"
import { View, StyleSheet, Animated, Easing } from "react-native"

type Direction = "left" | "right" | "up" | "down"

interface DirectionalArrowOverlayProps {
  direction: Direction | null
  size: number
}

export function DirectionalArrowOverlay({ direction, size }: DirectionalArrowOverlayProps) {
  const arrow1Anim = useRef(new Animated.Value(0.3)).current
  const arrow2Anim = useRef(new Animated.Value(0.3)).current
  const arrow3Anim = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    if (!direction) return

    // Stagger delays based on direction to create movement effect
    const delays =
      direction === "left"
        ? [400, 200, 0] // Right to left: stagger from arrow3 -> arrow2 -> arrow1
        : direction === "right"
          ? [0, 200, 400] // Left to right: stagger from arrow1 -> arrow2 -> arrow3
          : direction === "up"
            ? [400, 200, 0] // Bottom to top: stagger from arrow3 -> arrow2 -> arrow1
            : [0, 200, 400] // Top to bottom: stagger from arrow1 -> arrow2 -> arrow3

    const createPulseAnimation = (animValue: Animated.Value, delay: number) => {
      // Delay only at the start, then loop without delay to prevent drift
      return Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(animValue, {
              toValue: 0.7,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0.2,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ),
      ])
    }

    // Start all three animations with their respective delays
    const anim1 = createPulseAnimation(arrow1Anim, delays[0])
    const anim2 = createPulseAnimation(arrow2Anim, delays[1])
    const anim3 = createPulseAnimation(arrow3Anim, delays[2])

    anim1.start()
    anim2.start()
    anim3.start()

    // Cleanup
    return () => {
      anim1.stop()
      anim2.stop()
      anim3.stop()
    }
  }, [direction, arrow1Anim, arrow2Anim, arrow3Anim])

  if (!direction) return null

  const renderArrows = () => {
    switch (direction) {
      case "left":
        return (
          <View style={styles.arrowsLeft}>
            <Animated.Text style={[styles.arrowText, { opacity: arrow1Anim }]}>{"←"}</Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginLeft: -10, opacity: arrow2Anim }]}>
              {"←"}
            </Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginLeft: -10, opacity: arrow3Anim }]}>
              {"←"}
            </Animated.Text>
          </View>
        )
      case "right":
        return (
          <View style={styles.arrowsRight}>
            <Animated.Text style={[styles.arrowText, { opacity: arrow1Anim }]}>{"→"}</Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginLeft: -10, opacity: arrow2Anim }]}>
              {"→"}
            </Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginLeft: -10, opacity: arrow3Anim }]}>
              {"→"}
            </Animated.Text>
          </View>
        )
      case "up":
        return (
          <View style={styles.arrowsUp}>
            <Animated.Text style={[styles.arrowText, { opacity: arrow1Anim }]}>{"↑"}</Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginTop: -10, opacity: arrow2Anim }]}>
              {"↑"}
            </Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginTop: -10, opacity: arrow3Anim }]}>
              {"↑"}
            </Animated.Text>
          </View>
        )
      case "down":
        return (
          <View style={styles.arrowsDown}>
            <Animated.Text style={[styles.arrowText, { opacity: arrow1Anim }]}>{"↓"}</Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginTop: -10, opacity: arrow2Anim }]}>
              {"↓"}
            </Animated.Text>
            <Animated.Text style={[styles.arrowText, { marginTop: -10, opacity: arrow3Anim }]}>
              {"↓"}
            </Animated.Text>
          </View>
        )
    }
  }

  return (
    <View
      style={[
        styles.overlay,
        {
          width: size,
          height: size,
        },
      ]}
      pointerEvents="none"
    >
      {renderArrows()}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
  },
  arrowsLeft: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 80, // Position arrows to the left side
    marginBottom: 80,
    gap: 5,
  },
  arrowsRight: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 80, // Position arrows to the right side
    marginBottom: 80,
    gap: 5,
  },
  arrowsUp: {
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 80, // Position arrows at the top
    marginRight: 80,
  },
  arrowsDown: {
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 80, // Position arrows at the bottom
    marginRight: 80,
  },
  arrowText: {
    fontSize: 60,
    color: "#FFFFFF",
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
})
