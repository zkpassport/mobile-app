import { InformationCircleIcon } from "@/assets/images/icons/InformationCircleIcon"
import { View, StyleSheet } from "react-native"
import { LinearGrad } from "../Text/LinearGradient"

export const InfoContainer = ({ text }: { text: string }) => {
  return (
    <View style={styles.infoBox}>
      <View style={styles.infoIconContainer}>
        <InformationCircleIcon width={18} height={18} color="#F6D38F" />
      </View>
      <LinearGrad
        text={text}
        colors={["#F2DCB0", "#F6D38F"]}
        textStyle={styles.infoTextMask}
        containerStyle={{ flex: 1 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  infoBox: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(242, 220, 176, 0.05)",
    borderWidth: 1,
    borderColor: "#58576F",
    borderRadius: 8,
  },
  infoIconContainer: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  infoTextMask: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    color: "#F2DCB0",
  },
})
