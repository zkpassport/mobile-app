import React from "react"
import { View, Text, StyleSheet, Image } from "react-native"
import { countryCodeAlpha3ToAlpha2, PassportViewModel } from "@zkpassport/utils"
import { getDisplayDocumentType, getIssuingCountryCode } from "@/lib/credentials"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { capitalizeEveryWord } from "@/lib"
import CountryFlag from "react-native-country-flag"
import { useTranslation } from "react-i18next"

interface IDCardPreviewProps {
  passport?: PassportViewModel
  showChevron?: boolean
  isOpen?: boolean
  nameH?: string // H means from history
  countryCodeH?: string
  IDTypeH?: string
  rounded?: boolean
  backgroundColor?: string
  isExpired?: boolean
}

export const IDCardPreview = ({
  passport,
  showChevron = false,
  isOpen = false,
  nameH,
  countryCodeH,
  IDTypeH,
  rounded = true,
  backgroundColor = "#2A3771",
  isExpired = false,
}: IDCardPreviewProps) => {
  const { t } = useTranslation()
  let countryCode: string | undefined
  let type: string | undefined
  let name: string | undefined
  if (passport) {
    countryCode = countryCodeAlpha3ToAlpha2(getIssuingCountryCode(passport))
    if (!countryCode || countryCode.length !== 2) {
      return null
    }
    type = getDisplayDocumentType(
      passport.mrz,
      getIssuingCountryCode(passport),
      passport.nationality,
      t,
    )
    name = capitalizeEveryWord(passport.name)
  } else {
    if (countryCodeH && nameH && IDTypeH) {
      countryCode = countryCodeAlpha3ToAlpha2(countryCodeH)
      type = getDisplayDocumentType(IDTypeH, undefined, undefined, t)
      name = capitalizeEveryWord(nameH)
    }
  }

  return (
    <View>
      <View style={[styles.container, { backgroundColor, borderRadius: rounded ? 18 : 0 }]}>
        <View style={[styles.flagContainer, { opacity: isExpired ? 0.5 : 1 }]}>
          {countryCode && countryCode.length === 2 && countryCode !== "ZK" ? (
            <CountryFlag style={styles.flag} isoCode={countryCode} size={40} />
          ) : (
            <Image
              source={require("@/assets/images/zkpassport-logo.png")}
              style={styles.zkLogo}
              resizeMode="contain"
            />
          )}
        </View>
        <View style={styles.idCardContent}>
          <Text style={[styles.idCardType, { opacity: isExpired ? 0.5 : 1 }]}>{type}</Text>
          <Text style={[styles.idCardName, { opacity: isExpired ? 0.5 : 1 }]}>{name}</Text>
        </View>
        {isExpired && (
          <View style={styles.expiredContainer}>
            <Text style={styles.expiredText}>{t("expired")}</Text>
          </View>
        )}
        {showChevron &&
          (isOpen ? (
            <ChevronUp width={20} height={20} color="#F3D9A6" />
          ) : (
            <ChevronDown width={20} height={20} color="#F3D9A6" />
          ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  idCardDropdown: {
    backgroundColor: "transparent",
  },
  flagContainer: {
    width: 50,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#FFFFFF0F",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  flagContainerDropdown: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2A3771",
  },
  flag: {
    width: 40,
    height: 30,
    objectFit: "cover",
    borderRadius: 5,
    overflow: "hidden",
  },
  zkLogo: {
    width: 30,
    height: 30,
  },
  flagEmoji: {
    fontSize: 32,
  },
  idCardContent: {
    flex: 1,
  },
  idCardType: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 4,
  },
  idCardName: {
    fontSize: 12,
    fontWeight: "400",
    color: "#E7E7E7",
    // fontFamily: "Inter",
  },
  idCardNameDropdown: {
    fontSize: 12,
    fontWeight: "400",
    color: "#8B9FD9",
  },
  expiredContainer: {
    backgroundColor: "#E6657E30",
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  expiredText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#E7E7E7",
  },
})
