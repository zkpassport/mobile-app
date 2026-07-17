import React from "react"
import { View, StyleSheet, Dimensions } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated"
import { ActionButton } from "../ui/Buttons/ActionButton"
import { Plus } from "@/assets/images/icons/Plus"
import { Colors } from "@/constants/Colors"
import { useTranslation } from "react-i18next"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const CARD_WIDTH = SCREEN_WIDTH - 40
// Keep the ratio of the card background image by using the width as reference
const CARD_HEIGHT = CARD_WIDTH * 0.6

interface AnimatedAddIdCardProps {
  scrollX: SharedValue<number>
  index: number
  onPress: () => void
}

export const AnimatedAddIdCard: React.FC<AnimatedAddIdCardProps> = ({
  scrollX,
  index,
  onPress,
}) => {
  const { t } = useTranslation()
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
            [-CARD_WIDTH * 0.12, 0, CARD_WIDTH * 0.12],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            scrollX.value,
            [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
            [0.9, 1, 0.9],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }
  })

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.card}>
        <View style={styles.buttonContainer}>
          <ActionButton
            icon={<Plus width={24} height={24} color="#FBFBFB" />}
            text={t("passportView.addID")}
            onPress={onPress}
            backgroundColor={Colors.common.primary}
          />
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    width: SCREEN_WIDTH,
    gap: 20,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 8,
    borderColor: Colors.common.primary,
  },
  buttonContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
})
