import React from "react"
import { View, StyleSheet, Image } from "react-native"
import { LinearGrad } from "../ui/Text/LinearGradient"
import { useTranslation } from "react-i18next"

export const UnableToContinue: React.FC = () => {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/icons/AlertTriangle.png")}
          style={styles.alertTriangleIcon}
          resizeMode="contain"
        />
        <View style={styles.textContainer}>
          <LinearGrad
            text={t("UnableToContinue.title")}
            colors={["#F2DCB0", "#F6D38F"]}
            textStyle={styles.title}
            containerStyle={styles.titleWrapper}
          />

          <LinearGrad
            text={t("UnableToContinue.description")}
            colors={["#F2DCB0", "#F6D38F"]}
            textStyle={styles.message}
            containerStyle={styles.messageWrapper}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1A2655",
    borderWidth: 1,
    borderColor: "#F2DCB0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  alertTriangleIcon: {
    width: 18,
    height: 18,
  },
  textContainer: {
    flex: 1,
    gap: 8,
  },
  titleWrapper: {
    width: "100%",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
    color: "#FFFFFF",
  },
  messageWrapper: {
    width: "100%",
  },
  message: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    color: "#FFFFFF",
  },
})
