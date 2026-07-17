import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"

interface IDTypeCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onPress: () => void
}

export const IDTypeCard: React.FC<IDTypeCardProps> = ({ title, description, icon, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.iconCircle}>{icon}</View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.chevronContainer}>
        <Ionicons name="chevron-forward" size={24} color="#F2DBAE" />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#2A3771",
    borderRadius: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 24,
    paddingTop: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 28,
    backgroundColor: "#F5D493",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
    marginBottom: 4,
    // fontFamily: "Inter",
    lineHeight: 28,
    paddingTop: 8,
    paddingLeft: 2,
  },
  description: {
    fontSize: 12,
    color: "#E7E7E7",
    // fontFamily: "Inter",
    fontWeight: "400",
    lineHeight: 18,
    paddingLeft: 2,
  },
  chevronContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 8,
    paddingTop: 32,
  },
})
