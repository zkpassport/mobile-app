import React, { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native"
import { PassportViewModel } from "@zkpassport/utils"
import { IDCardPreview } from "../ui/Cards"
import { useTranslation } from "react-i18next"
import { getPassportUniqueId } from "@/lib"
import { MrzScanService } from "@/services/MrzScanService"

interface IDSelectedCardProps {
  passport: PassportViewModel
  passports?: { [key: string]: PassportViewModel }
  activePassportId?: string | null
  onSelect?: (id: string) => void
  privacyMode?: "standard" | "maximum"
}

export const IDSelectedCard: React.FC<IDSelectedCardProps> = ({
  passport,
  passports,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation()

  const hasMultiplePassports = passports && Object.keys(passports).length > 1

  const renderPassportItem = (p: PassportViewModel, id: string) => {
    const mrzService = MrzScanService.getInstance()
    const isExpired = mrzService.isExpired(p.mrz)

    return (
      <TouchableOpacity
        key={id}
        style={styles.dropdownItem}
        onPress={() => {
          if (isExpired) {
            return
          }
          if (onSelect) {
            onSelect(id)
          }
          setIsOpen(false)
        }}
        activeOpacity={isExpired ? 1 : 0.7}
      >
        <IDCardPreview
          passport={p}
          showChevron={false}
          backgroundColor="#222E62"
          rounded={false}
          isExpired={isExpired}
        />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Section Title */}
      <Text style={styles.title}>{t("IDSelectedCard.title")}</Text>

      {/* ID Card */}
      <View style={styles.cardWrapper}>
        <View style={styles.cardBackground} />
        <TouchableOpacity
          style={[styles.card, isOpen && styles.cardWithDropdown]}
          onPress={() => hasMultiplePassports && setIsOpen(!isOpen)}
          activeOpacity={hasMultiplePassports ? 0.7 : 1}
          disabled={!hasMultiplePassports}
        >
          <IDCardPreview passport={passport} showChevron={hasMultiplePassports} isOpen={isOpen} />
        </TouchableOpacity>

        {/* Dropdown */}
        {isOpen && hasMultiplePassports && passports && (
          <ScrollView
            style={styles.dropdown}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.dropdownContent}>
              {Object.entries(passports)
                .filter(([id]) => id !== getPassportUniqueId(passport))
                .map(([id, p]) => renderPassportItem(p, id))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#F0F2FC",
    textAlign: "center",
    // fontFamily: "Inter",
    marginBottom: 24,
  },
  cardWrapper: {
    position: "relative",
    zIndex: 1,
  },
  cardBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#142262",
    borderRadius: 18,
    zIndex: 1,
  },
  card: {
    backgroundColor: "#222E62",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A3771",
    zIndex: 2,
  },
  cardWithDropdown: {
    shadowColor: "#2A3771",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 7,
  },
  dropdown: {
    backgroundColor: "#222E62",
    marginTop: -15,
    paddingTop: 10,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderColor: "#2A3771",
    maxHeight: 300,
    zIndex: 1,
  },
  dropdownContent: {
    paddingBottom: 10,
  },
  dropdownItem: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(76, 81, 118, 0.3)",
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: -10,
    paddingTop: 22,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#343F6B",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    gap: 8,
    zIndex: -20,
  },
  infoIcon: {
    fontSize: 16,
    color: "#FBFBFB",
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    lineHeight: 20,
  },
})
