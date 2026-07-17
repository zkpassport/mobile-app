import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"

interface ActionButtonProps {
  icon: React.ReactNode
  text: string
  onPress: () => void
  backgroundColor?: string
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  text,
  onPress,
  backgroundColor = "#2B3871",
}) => {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconContainer, { backgroundColor }]}>{icon}</View>
      <Text style={styles.actionButtonText}>{text}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  actionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 28,
  },
})
