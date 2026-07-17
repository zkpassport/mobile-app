import React from "react"
import { View, Text, StyleSheet, Platform, Linking, Image } from "react-native"
import { useTranslation } from "react-i18next"
import { PrimaryButton } from "./ui/Buttons/PrimaryButton"
import { useHideTabBar } from "@/context/TabBarVisibilityContext"
import { InfoContainer } from "./ui/Cards/InfoContainer"

export type UpdateModalViewProps = {
  requiredVersion: string
}

const UpdateModalView: React.FC<UpdateModalViewProps> = ({ requiredVersion }) => {
  const { t } = useTranslation()
  useHideTabBar(true)

  const openStore = () => {
    const appStoreUrl =
      Platform.OS === "ios"
        ? "https://apps.apple.com/app/zkpassport/id6477371975"
        : "https://play.google.com/store/apps/details?id=app.zkpassport.zkpassport"

    Linking.openURL(appStoreUrl)
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon and Text Section */}
        <View style={styles.stateWrapper}>
          <View style={styles.textWrapper}>
            {/* Warning Icon */}
            <Image
              source={require("@/assets/images/icons/AlertTriangle.png")}
              style={styles.icon}
              resizeMode="contain"
            />

            {/* Title */}
            <Text style={styles.title}>{t("updates.updateRequired")}</Text>

            {/* Description */}
            <Text style={styles.description}>
              {t("updates.newVersion", { version: requiredVersion })}
            </Text>

            {/* Info Card */}
            <InfoContainer text={t("updates.mandatory")} />
          </View>
        </View>

        {/* Button Section */}
        <View style={styles.buttonWrapper}>
          <PrimaryButton text={t("updates.update")} onPress={openStore} primary />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#142262",
    paddingVertical: 24,
    paddingHorizontal: 16,
    paddingTop: 100, // This is strange, cus the padding is has some top content wrapper that isnt on every device
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
  },
  stateWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  textWrapper: {
    width: "100%",
    maxWidth: 359,
    gap: 24,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  icon: {
    width: 40,
    height: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "center",
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: "#E7E7E7",
    textAlign: "center",
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  infoCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F2DCB0",
    backgroundColor: "rgba(242, 220, 176, 0.05)",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#F2DCB0",
    // fontFamily: "Inter",
    fontWeight: "500",
  },
  buttonWrapper: {
    gap: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
})

export default UpdateModalView
