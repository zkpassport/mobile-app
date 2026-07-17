import React from "react"
import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native"
import { X } from "lucide-react-native"
import { LinearGradient } from "expo-linear-gradient"
import MaskedView from "@react-native-masked-view/masked-view"

interface CloseButtonProps {
  onPress: () => void
  style?: ViewStyle
}

export const CloseButton: React.FC<CloseButtonProps> = ({ onPress, style }) => {
  return (
    <TouchableOpacity style={style} onPress={onPress}>
      <MaskedView
        style={styles.iconWrapper}
        maskElement={<X width={24} height={24} color="#FFFFFF" />}
      >
        <LinearGradient
          colors={["#F2DCB0", "#F6D38F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
        />
      </MaskedView>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 24,
    height: 24,
  },
  gradient: {
    width: 24,
    height: 24,
  },
})
