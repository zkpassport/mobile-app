import React, { useState } from "react"
import { View, Text, StyleSheet, ActivityIndicator } from "react-native"
import { BackButton } from "@/components/ui/Buttons"
import { Colors } from "@/constants/Colors"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { Trans, useTranslation } from "react-i18next"
import { ToggleCard } from "../ui/Cards/ToggleCard"
import { useSettings } from "@/context/SettingsContext"
import { GradientSecurityIcon } from "@/assets/images/icons/GradientSecurityIcon"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface SecurityPageProps {
  onBack: () => void
}

const SecurityPage: React.FC<SecurityPageProps> = ({ onBack }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const { settings, updateSettings } = useSettings()
  const insets = useSafeAreaInsets()

  const onToggleRequireAuth = async () => {
    setLoading(true)
    await updateSettings({ requireAuthForVerification: !settings.requireAuthForVerification })
    setLoading(false)
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("settings.security.back")} />
        </View>

        <View style={styles.header}>
          <GradientSecurityIcon width={32} height={32} />
          <Text style={styles.pageTitle}>{t("settings.security.title")}</Text>
        </View>

        {/* Try Demo Button */}
        <ToggleCard
          title={t("settings.security.requireAuth")}
          description={
            <Trans
              i18nKey="settings.security.requireAuthDescription"
              components={{ bold: <Text style={{ fontWeight: "700" }} /> }}
            />
          }
          value={settings.requireAuthForVerification}
          onChange={onToggleRequireAuth}
          disabled={loading}
        />

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#F6D38F" />
            <Text style={styles.loadingText}>{t("settings.security.loading")}</Text>
          </View>
        )}
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
    marginTop: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#B8C5E0",
  },
  header: {
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
  },
})

export default SecurityPage
