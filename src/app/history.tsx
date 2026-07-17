import React, { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native"
import { Colors } from "@/constants/Colors"
import HistoryItemCard from "@/components/History/HistoryItemCard"
import { HistoryItem } from "@/types"
import { useSettings } from "@/context/SettingsContext"
import { SlidersHorizontal } from "lucide-react-native"
import { HistoryFilterModal, FilterOptions } from "@/components/Modals/HistoryFilterModal"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { HistoryService } from "@/services"
import { useRouter } from "expo-router"
import { useTranslation } from "react-i18next"
import { FileIcon } from "@/assets/images/icons/FileIcon"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { formatLongDate } from "@/lib"

export default function HistoryPage() {
  const { settings } = useSettings()
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [filters, setFilters] = useState<FilterOptions>({
    selectedPassportIds: [],
    verificationStatuses: [],
  })
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  // Apply filters to history
  const currentHistory = HistoryService.getByPassportIds(settings, filters.selectedPassportIds)
  const unfilteredHistory = HistoryService.getAll(settings)

  const handleViewDetails = (id: string) => {
    router.push({
      pathname: "/history-item",
      params: { itemId: id },
    })
  }

  const differentIdsUsed = unfilteredHistory.reduce((acc, item) => {
    if (!acc.includes(item.passportId)) {
      acc.push(item.passportId)
    }
    return acc
  }, [] as string[]).length

  // Group items by date
  const groupedHistory = currentHistory.reduce(
    (acc, item) => {
      const itemDate = new Date(item.metadata.timestamp)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      let dateKey: string

      // Check if it's today
      if (itemDate.toDateString() === today.toDateString()) {
        dateKey = t("history.today")
      }
      // Check if it's yesterday
      else if (itemDate.toDateString() === yesterday.toDateString()) {
        dateKey = t("history.yesterday")
      }
      // Otherwise show the date with month name
      else {
        dateKey = formatLongDate(itemDate)
      }

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(item)
      return acc
    },
    {} as Record<string, HistoryItem[]>,
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.wrapper}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("history.title")}</Text>
          {unfilteredHistory.length > 0 && (
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilterModal(true)}
              disabled={differentIdsUsed <= 1}
            >
              <SlidersHorizontal size={24} color={differentIdsUsed <= 1 ? "#7483C7" : "#FBFBFB"} />
            </TouchableOpacity>
          )}
        </View>

        <HistoryFilterModal
          visible={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          onApply={(newFilters) => setFilters(newFilters)}
          currentFilters={filters}
        />

        {Object.keys(groupedHistory).length === 0 ? (
          <View style={styles.emptyState}>
            <FileIcon width={27} height={35} color="#C7CDEA" />
            <Text style={styles.emptyStateTitle}>{t("history.noVerificationTitle")}</Text>
            <Text style={styles.emptyStateDescription}>
              {t("history.noVerificationDescription")}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 50 }]}
            showsVerticalScrollIndicator={false}
          >
            {Object.entries(groupedHistory)
              .reverse()
              .map(([date, items]) => (
                <View key={date} style={styles.dateSection}>
                  <Text style={styles.dateHeader}>{date}</Text>
                  <View style={styles.divider} />
                  <View style={styles.itemsList}>
                    {items.reverse().map((item: HistoryItem) => (
                      <HistoryItemCard
                        key={item.id}
                        item={item}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </View>
                </View>
              ))}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingBottom: 20, // If there are many history items, cannot see them under the tab bar.
  },
  wrapper: {
    flex: 1,
    paddingTop: OUTER_CONTAINER_TOP_PADDING,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 46,
    paddingBottom: 32,
  },
  filterButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 16,
    marginTop: 24,
    maxWidth: 300,
    marginHorizontal: "auto",
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    textAlign: "center",
  },
  emptyStateDescription: {
    fontSize: 14,
    fontWeight: "400",
    color: "#E7E7E7",
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FBFBFB",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  dateSection: {
    marginBottom: 32,
    paddingBottom: 8,
  },
  dateHeader: {
    fontSize: 12,
    fontWeight: "400",
    color: "#E7E7E7",
    marginBottom: 8,
  },
  itemsList: {
    gap: 32,
    paddingTop: 32,
  },
})
