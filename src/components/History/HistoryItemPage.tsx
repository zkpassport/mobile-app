import React, { useEffect } from "react"
import {
  View,
  StyleSheet,
  ScrollView,
  BackHandler,
  Text,
  TouchableOpacity,
  Platform,
} from "react-native"
import { HistoryItem } from "@/types"
import {
  AccessRequestHeader,
  VerificationCriteriaList,
  VerificationRequestInfo,
} from "@/components/AccessRequest"
import { useTranslation } from "react-i18next"
import { getDisplayDocumentType } from "@/lib/credentials"
import { formatLongDate, formatTime, getCountryName } from "@/lib"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Trash } from "@/assets/images/icons/Trash"
import { HistoryService } from "@/services"
import { useSettings } from "@/context/SettingsContext"

interface HistoryItemPageProps {
  item: HistoryItem
  onBack: () => void
  onDeleted: (newHistory: HistoryItem[]) => void
}

const HistoryItemPage: React.FC<HistoryItemPageProps> = ({ item, onBack, onDeleted }) => {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const { settings, updateSettings, passports } = useSettings()
  const passport = item && item.passportId ? passports[item.passportId] : undefined

  useEffect(() => {
    const onBackPress = () => {
      onBack()
      return true
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
    return () => subscription.remove()
  }, [onBack])

  const onDelete = async () => {
    try {
      const newHistory = await HistoryService.deleteItem({ settings, updateSettings }, item.id)
      onDeleted(newHistory)
    } catch (error) {
      console.error("Error deleting history item: " + error)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "ios" ? 0 : insets.top }]}>
      {Platform.OS === "ios" && (
        <View style={styles.swipeHandleArea}>
          <View style={styles.swipeIndicator} />
        </View>
      )}
      {/* Header Section */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <AccessRequestHeader
          websiteName={item.request.service?.name || ""}
          websiteDomain={item.request.domain || ""}
          websiteLogo={item.request.service?.logo}
          isTrustedDomain={true}
          onBack={onBack}
          backButton={false}
        />

        <View style={{ height: 16 }} />

        <VerificationRequestInfo
          time={formatTime(new Date(item.metadata.timestamp))}
          date={formatLongDate(new Date(item.metadata.timestamp))}
          idType={getDisplayDocumentType(
            item.metadata.idType,
            item.metadata.countryCode,
            passport?.nationality,
            t,
          )}
          country={getCountryName(item.metadata.countryCode)}
          purpose={item.request.service?.purpose}
        />

        <View style={styles.divider} />

        {/* Verification Criteria Section */}
        <VerificationCriteriaList
          title={t("history.informationShared")}
          items={item.metadata.accessItems}
          history={true}
        />

        <View style={styles.divider} />

        <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>{t("history.delete")}</Text>
          <Trash width={16} height={16} color="#E6657E" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E1945",
  },
  swipeHandleArea: {
    paddingVertical: 12,
    alignItems: "center",
  },
  swipeIndicator: {
    width: 80,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  IDTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FFFFFF",
    // fontFamily: "Inter",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 8,
    backgroundColor: "rgba(230, 101, 126, 0.10)",
    borderRadius: 8,
    marginTop: 32,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E6657E",
  },
})

export default HistoryItemPage
