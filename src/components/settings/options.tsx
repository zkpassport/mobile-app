import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, ScrollView } from "react-native"
import { Trash } from "@/assets/images/icons/Trash"
import { Wrench } from "@/assets/images/icons/Wrench"
import { Question } from "@/assets/images/icons/Question"
import { DeleteIDModal } from "@/components/Modals"
import { BackButton } from "@/components/ui/Buttons"
import { Colors } from "@/constants/Colors"
import { useSettings } from "@/context/SettingsContext"
import { useRouter } from "expo-router"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { StatusModal } from "../Modals/StatusModal"
import { getPassportUniqueId } from "@/lib"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface OptionsPageProps {
  passport: any // PassportViewModel,
  onBack: () => void
  onDeleteComplete?: () => void
  onDeleteID?: () => void
  onDeleteCache?: () => void
  onTechnicalInfo?: () => void
  onHelp?: () => void
  eventReportingEnabled?: boolean
  onEventReportingToggle?: (enabled: boolean) => void
}

const OptionsPage: React.FC<OptionsPageProps> = ({ passport, onBack, onDeleteComplete }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  const { getPassportIdFromNumber } = useSettings()
  const insets = useSafeAreaInsets()

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace("/")
      }
      return true
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
    return () => subscription.remove()
  }, [passport])

  const handleDeletePress = () => {
    setShowDeleteModal(true)
  }

  const handleTechnicalInfoPress = () => {
    router.push({
      pathname: "/(options)/technical-info",
      params: { passportId: getPassportUniqueId(passport) },
    })
  }

  const handleWhatsNextPress = () => {
    router.push("/(options)/whats-next")
  }

  const options = [
    {
      id: "help",
      icon: <Question width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.help"),
      onPress: handleWhatsNextPress,
    },
    {
      id: "technical-info",
      icon: <Wrench width={22} height={22} color="#DBDFF3" />,
      label: t("settings.options.technicalInfo"),
      onPress: handleTechnicalInfoPress,
    },
    {
      id: "delete-id",
      icon: <Trash width={24} height={24} color="#DBDFF3" />,
      label: t("settings.options.deleteID"),
      onPress: handleDeletePress,
    },
  ]

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("settings.options.back")} />
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{t("settings.options.title")}</Text>
        </View>

        {/* Options List */}
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.optionItem}
            onPress={option.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.optionLeft}>
              <View style={styles.iconContainer}>{option.icon}</View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Delete ID Modal */}
        <DeleteIDModal
          visible={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => {
            setShowDeleteSuccess(true)
          }}
          onError={() => {
            setShowDeleteError(true)
          }}
          passport={passport}
          passportId={getPassportIdFromNumber(passport.passportNumber) || ""} // TODO: temp fix
        />

        <StatusModal
          visible={showDeleteSuccess}
          type="success"
          description={t("modals.deleteID.successDescription")}
          onClose={() => {
            setShowDeleteSuccess(false)
            onDeleteComplete?.()
          }}
          initialCountdown={3}
        />

        <StatusModal
          visible={showDeleteError}
          type="error"
          description={t("modals.deleteID.errorDescription")}
          onClose={() => {
            setShowDeleteError(false)
          }}
          initialCountdown={3}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    paddingVertical: OUTER_CONTAINER_TOP_PADDING,
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  titleContainer: {
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 36,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 24,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(59, 91, 152, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 32,
  },
  eventReportingCard: {
    marginBottom: 100,
  },
})

export default OptionsPage
