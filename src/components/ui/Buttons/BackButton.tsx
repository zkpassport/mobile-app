import React from "react"
import { TouchableOpacity, StyleSheet } from "react-native"
import { LinearGrad } from "../Text/LinearGradient"
import { ChevronLeft } from "lucide-react-native"

interface BackButtonProps {
  onPress: () => void
  text?: string
  iconSize?: number
}

export const BackButton: React.FC<BackButtonProps> = ({
  onPress,
  text = "Back",
  iconSize = 24,
}) => {
  return (
    <TouchableOpacity style={styles.backButton} onPress={onPress}>
      <ChevronLeft size={iconSize} color="#F6D38F" />
      <LinearGrad text={text} colors={["#F2DCB0", "#F6D38F"]} textStyle={styles.backText} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 18,
    // fontFamily: "Inter",
    fontWeight: "600",
    lineHeight: 22,
    marginLeft: 4,
    color: "#F6D38F",
  },
})
