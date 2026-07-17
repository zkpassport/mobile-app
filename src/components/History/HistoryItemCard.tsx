import React from "react"
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native"
import { HistoryItem } from "@/types"
import { countryCodeAlpha3ToAlpha2 } from "@zkpassport/utils"
import { getDisplayDocumentType } from "@/lib/credentials"
import CountryFlag from "react-native-country-flag"
import { ChevronRight } from "lucide-react-native"
import { formatTime } from "@/lib"
import { useSettings } from "@/context/SettingsContext"
import { useTranslation } from "react-i18next"

interface HistoryItemCardProps {
  item: HistoryItem
  onViewDetails: (id: string) => void
}

const HistoryItemCard: React.FC<HistoryItemCardProps> = ({ item, onViewDetails }) => {
  const { passports } = useSettings()
  const { t } = useTranslation()

  const alpha2CountryCode = item.metadata.countryCode
    ? countryCodeAlpha3ToAlpha2(item.metadata.countryCode)
    : undefined
  const flagIsoCode =
    alpha2CountryCode && alpha2CountryCode.length === 2
      ? alpha2CountryCode.toUpperCase()
      : undefined
  const passport = item && item.passportId ? passports[item.passportId] : undefined
  const idType = getDisplayDocumentType(
    item.metadata.idType,
    item.metadata.countryCode,
    passport?.nationality,
    t,
  )
  const websiteName = item.request.service?.name ?? ""
  const time = formatTime(new Date(item.metadata.timestamp))
  const websiteLogo = item.request.service?.logo ?? ""
  const websiteInitials =
    websiteName && websiteName.trim().length > 0 ? websiteName.trim().charAt(0).toUpperCase() : "?"

  // console.log("item", item)

  return (
    <TouchableOpacity style={styles.historyItem} onPress={() => onViewDetails(item.id)}>
      <View style={styles.historyItemLeft}>
        <View style={styles.iconContainer}>
          {websiteLogo ? (
            <Image source={{ uri: websiteLogo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoFallbackText}>{websiteInitials}</Text>
            </View>
          )}
        </View>
        <View style={styles.historyItemInfo}>
          <View style={styles.historyItemHeader}>
            <Text style={styles.websiteName}>{websiteName}</Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          <View style={styles.verificationRow}>
            <View style={styles.flagContainer}>
              {flagIsoCode && flagIsoCode !== "ZK" ? (
                <CountryFlag style={styles.flag} isoCode={flagIsoCode} size={20} />
              ) : flagIsoCode && flagIsoCode === "ZK" ? (
                <View style={styles.flagZKR}>
                  <Image
                    source={require("@/assets/images/zkpassport-logo.png")}
                    style={styles.flagZKRLogo}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={styles.flagFallback}>
                  <Text style={styles.flagFallbackText}>?</Text>
                </View>
              )}
            </View>
            <Text style={styles.verificationLabel}>{idType}</Text>
          </View>
        </View>
      </View>
      <ChevronRight size={20} color="#C7CDEA" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    width: 40,
    height: 40,
  },
  logoFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  logoFallbackText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  historyItemLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(251, 251, 251, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  historyItemInfo: {
    flex: 1,
    gap: 8,
  },
  historyItemHeader: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  websiteName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  time: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 4,
    color: "#C8C8C8",
    // fontFamily: "Inter",
  },
  verificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flagContainer: {
    width: 23,
    height: 18,
    borderRadius: 5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 251, 251, 0.1)",
  },
  flag: {
    width: 20,
    height: 15,
    objectFit: "cover",
    borderRadius: 4,
    overflow: "hidden",
  },
  flagFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: "rgba(251, 251, 251, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  flagZKR: {
    width: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  flagZKRLogo: {
    width: 15,
    height: 15,
  },
  flagFallbackText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  verificationLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: "#E7E7E7",
    // fontFamily: "Inter",
  },
  statusPill: {
    paddingHorizontal: 4,
    paddingVertical: 0,
    borderRadius: 2,
    height: 18,
    justifyContent: "center",
  },
  viewDetailsButton: {
    fontSize: 12,
    fontWeight: "500",
    color: "#F6D38F",
    // fontFamily: "Inter",
  },
})

export default HistoryItemCard
