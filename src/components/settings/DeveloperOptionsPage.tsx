import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, ActivityIndicator } from "react-native"
import { BackButton } from "@/components/ui/Buttons"
import { Colors } from "@/constants/Colors"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { ToggleCard } from "../ui/Cards/ToggleCard"
import { useSettings } from "@/context/SettingsContext"
import { GradientDeveloperOptions } from "@/assets/images/icons/GradientDeveloperOptions"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface DeveloperOptionsPageProps {
  onBack: () => void
}

const DeveloperOptionsPage: React.FC<DeveloperOptionsPageProps> = ({ onBack }) => {
  const { t } = useTranslation()
  const [enableDevMode, setEnableDevMode] = useState(false)
  const { toggleDevMode, isDevModeEnabled } = useSettings()
  const [isLoading, setIsLoading] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    setEnableDevMode(isDevModeEnabled)
  }, [isDevModeEnabled])

  const onToggleDevMode = async () => {
    setIsLoading(true)
    setTimeout(async () => {
      await toggleDevMode()
      setEnableDevMode((prev) => !prev)
      setIsLoading(false)
    }, 1000)
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("settings.developerOptions.back")} />
        </View>

        <View style={styles.header}>
          <GradientDeveloperOptions width={32} height={32} />
          <Text style={styles.pageTitle}>{t("settings.developerOptions.title")}</Text>
        </View>

        {/* Try Demo Button */}
        <ToggleCard
          title={t("settings.developerOptions.enableDevMode")}
          description={t("settings.developerOptions.enableDevModeDescription")}
          value={enableDevMode}
          onChange={onToggleDevMode}
          disabled={isLoading}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#F6D38F" />
            <Text style={styles.loadingText}>
              {isDevModeEnabled
                ? t("settings.developerOptions.deleting")
                : t("settings.developerOptions.loading")}
            </Text>
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

export default DeveloperOptionsPage
