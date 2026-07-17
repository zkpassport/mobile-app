import React from "react"
import { View, Text, StyleSheet, SafeAreaView } from "react-native"
import StepList from "../ui/StepList"
import InfoFrame from "../ui/InfoFrame"
import { BackButton } from "@/components/ui/Buttons"
import { useTranslation } from "react-i18next"

interface WhyScanViewProps {
  onBack: () => void
  onScan: () => void
}

const WhyScanView: React.FC<WhyScanViewProps> = ({ onBack }) => {
  const { t } = useTranslation()

  const steps = [
    {
      number: "1",
      text: t("WhyScanId.steps.1.text"),
      gap: 16,
    },
    {
      number: "2",
      text: t("WhyScanId.steps.2.text"),
      gap: 16,
    },
    {
      number: "3",
      text: t("WhyScanId.steps.3.text"),
      gap: 0,
    },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.wrapper} />
      <View style={styles.header}>
        <BackButton onPress={onBack} />
      </View>

      <View style={styles.content}>
        <View style={styles.content2}>
          <Text style={styles.title}>{t("WhyScanId.title")}</Text>

          <Text style={styles.description}>{t("WhyScanId.description")}</Text>

          <Text style={styles.subtitle}>{t("WhyScanId.subtitle")}</Text>

          <StepList steps={steps} variant="compact" />

          <InfoFrame textKey="WhyScanId.infoFrame.text" />
        </View>
      </View>

      {/* <View style={styles.bottomSection}>
        <PrimaryButton
          text={t("scanYourID")}
          onPress={onScan}
          icon={<PassportIcon width={24} height={24} />}
          primary
        />
      </View>*/}
      <View style={styles.wrapper} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#142262",
  },
  wrapper: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  content2: {
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
    marginBottom: 12,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    color: "white",
    marginBottom: 16,
    // fontFamily: "Inter",
  },
  footer: {
    fontSize: 16,
    lineHeight: 22,
    color: "#E7E7E7",
    textAlign: "center",
    // fontFamily: "Inter",
    marginTop: 20,
  },
  footerBold: {
    fontWeight: "700",
  },
  footerNormal: {
    fontWeight: "400",
    opacity: 0.9,
  },
  bottomSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
})

export default WhyScanView
