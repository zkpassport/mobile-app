import React from "react"
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native"
import { countryCodeAlpha3ToAlpha2 } from "@zkpassport/utils"
import { getDisplayDocumentType, getIssuingCountryCode } from "@/lib/credentials"
import type { PassportViewModel } from "@zkpassport/utils"
import { capitalizeEveryWord } from "@/lib"
import { Check } from "lucide-react-native"
import { useTranslation } from "react-i18next"
import CountryFlag from "react-native-country-flag"

interface PassportFilterItemProps {
  passport?: PassportViewModel
  isSelected: boolean
  onToggle: () => void
  // Props for displaying from history metadata (when passport is deleted)
  nameH?: string
  countryCodeH?: string
  idTypeH?: string
}

export const PassportFilterItem: React.FC<PassportFilterItemProps> = ({
  passport,
  isSelected,
  onToggle,
  nameH,
  countryCodeH,
  idTypeH,
}) => {
  const { t } = useTranslation()
  let countryCode: string | undefined
  let docType: string
  let displayName: string

  if (passport) {
    countryCode = countryCodeAlpha3ToAlpha2(getIssuingCountryCode(passport))
    docType = getDisplayDocumentType(
      passport.mrz,
      getIssuingCountryCode(passport),
      passport.nationality,
      t,
    )
    const firstName = capitalizeEveryWord(passport.firstName)
    const lastName = capitalizeEveryWord(passport.lastName)
    displayName = `${firstName} ${lastName}`
  } else if (nameH && countryCodeH && idTypeH) {
    countryCode = countryCodeAlpha3ToAlpha2(countryCodeH)
    docType = getDisplayDocumentType(idTypeH, undefined, undefined, t)
    displayName = capitalizeEveryWord(nameH)
  } else {
    // Fallback if neither passport nor metadata is provided
    countryCode = undefined
    docType = t("history.unknown")
    displayName = t("history.unknown")
  }

  return (
    <TouchableOpacity style={styles.passportItem} onPress={onToggle}>
      <View style={styles.flagContainer}>
        {countryCode && countryCode !== "ZK" && (
          <CountryFlag style={styles.flag} isoCode={countryCode} size={18} />
        )}
        {countryCode && countryCode === "ZK" && (
          <View style={styles.flagZKR}>
            <Image
              source={require("@/assets/images/zkpassport-logo.png")}
              style={styles.flagZKRLogo}
              resizeMode="contain"
            />
          </View>
        )}
      </View>
      <View style={styles.passportInfo}>
        <View style={styles.passportInfoRow}>
          <Text style={styles.passportType}>{docType}</Text>
          <Text style={styles.passportName}>{displayName}</Text>
        </View>
      </View>
      <View style={styles.checkboxContainer}>
        {isSelected ? (
          <Check size={20} color="#F6D38F" strokeWidth={3} />
        ) : (
          <View style={styles.checkbox} />
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  passportItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#2A3771",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  flagZKR: {
    width: 15,
    height: 15,
  },
  flagZKRLogo: {
    width: 15,
    height: 15,
  },
  passportInfo: {
    flex: 1,
  },
  passportInfoRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  passportType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  passportName: {
    fontSize: 12,
    fontWeight: "400",
    color: "#E7E7E7",
    // fontFamily: "Inter",
  },
  checkboxContainer: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#7483C7",
  },
})
