import React from "react"
import HistoryItemPage from "@/components/History/HistoryItemPage"
import { useSettings } from "@/context/SettingsContext"
import { HistoryService } from "@/services"
import { router, useLocalSearchParams } from "expo-router"

export default function HistoryPage() {
  const { settings } = useSettings()
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const selectedItem = HistoryService.getById(settings, itemId)

  if (!selectedItem) {
    return <></>
  }

  return (
    <HistoryItemPage
      item={selectedItem}
      onBack={() => router.back()}
      onDeleted={() => {
        router.back()
      }}
    />
  )
}
