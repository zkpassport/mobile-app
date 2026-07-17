import React from "react"
import { View, Text, StyleSheet, Linking } from "react-native"
import StepList from "../ui/StepList"
import { BackButton, PrimaryButton } from "@/components/ui/Buttons"
import { Colors } from "@/constants/Colors"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface WhatsNextPageProps {
  onBack: () => void
  onTryDemo?: () => void
}

const WhatsNextPage: React.FC<WhatsNextPageProps> = ({
  onBack,
  onTryDemo = () => Linking.openURL("https://demo.zkpassport.id"),
}) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const steps = [
    {
      number: "1",
      title: t("settings.whatsNext.steps.1.title"),
      description: t("settings.whatsNext.steps.1.description"),
    },
    {
      number: "2",
      title: t("settings.whatsNext.steps.2.title"),
      description: t("settings.whatsNext.steps.2.description"),
    },
    {
      number: "3",
      title: t("settings.whatsNext.steps.3.title"),
      description: t("settings.whatsNext.steps.3.description"),
    },
  ]

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("settings.whatsNext.back")} />
        </View>

        {/* Title */}
        <Text style={styles.pageTitle}>{t("settings.whatsNext.title")}</Text>

        {/* Steps */}
        <StepList steps={steps} variant="default" />

        {/* Try Demo Button */}
        <PrimaryButton text={t("settings.whatsNext.tryDemo")} onPress={onTryDemo} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: OUTER_CONTAINER_TOP_PADDING,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  scrollView: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 32,
    marginTop: 20,
  },
})

export default WhatsNextPage
