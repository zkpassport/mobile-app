import { getIssuingCountryCode } from "@/lib/credentials"
import { countryCodeAlpha3ToAlpha2, PassportViewModel } from "@zkpassport/utils"
import { Image, Text, View, StyleSheet } from "react-native"
import CountryFlag from "react-native-country-flag"

const ZK_COUNTRY_CODE = "ZK"

export const CountryOfIssuance: React.FC<{
  passport: PassportViewModel
}> = ({ passport }) => {
  const countryCode = countryCodeAlpha3ToAlpha2(getIssuingCountryCode(passport))

  if (!countryCode || countryCode.length !== 2) {
    return null
  }

  return (
    <View style={styles.countryContainer}>
      <Text style={styles.countryCode}>{countryCode.toUpperCase()}</Text>
      {countryCode !== ZK_COUNTRY_CODE && <CountryFlag isoCode={countryCode} size={16} />}
      {countryCode === ZK_COUNTRY_CODE && (
        <Image
          source={require("@/assets/images/zkpassport-logo.png")}
          style={styles.zkpassportLogo}
          resizeMode="contain"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  countryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9EED7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  countryCode: {
    fontSize: 14,
    // fontFamily: "Inter",
    color: "black",
    textAlign: "center",
    fontWeight: "700",
  },
  zkpassportLogo: {
    width: 16,
    height: 16,
  },
})
