import { View, StyleSheet, Text } from "react-native"

interface PrivacyFeatureProps {
  icon: React.ReactNode
  title: string
  description: string
}

export const PrivacyFeature: React.FC<PrivacyFeatureProps> = ({ icon, title, description }) => {
  return (
    <View style={styles.featureItem}>
      <View style={styles.iconContainer}>{icon}</View>
      <View style={styles.featureTextContainer}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  featureItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(251, 251, 251, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextContainer: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FBFBFB",
  },
  featureDescription: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    color: "#E7E7E7",
  },
})
