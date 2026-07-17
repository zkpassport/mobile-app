import React from "react"
import { useTranslation } from "react-i18next"
import { View, Text, StyleSheet } from "react-native"

interface VerificationRequestInfoProps {
  date: string
  time?: string
  idType: string
  country: string
  purpose?: string
}

export const VerificationRequestInfo: React.FC<VerificationRequestInfoProps> = ({
  date,
  time,
  idType,
  country,
  purpose,
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("date")}</Text>
          <Text style={styles.infoValue}>{date}</Text>
        </View>

        {time && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("time")}</Text>
            <Text style={styles.infoValue}>{time}</Text>
          </View>
        )}

        {purpose && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("purpose")}</Text>
            <Text style={[styles.infoValue, styles.purposeValue]}>{purpose}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("id")}</Text>
          <Text style={styles.infoValue}>{idType}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("country")}</Text>
          <Text style={styles.infoValue}>{country}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    marginBottom: 32,
  },
  card: {
    backgroundColor: "#222E62",
    borderRadius: 8,
    gap: 16,
    padding: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 24,
    // fontFamily: "Inter",
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "400",
    color: "#E7E7E7",
    // fontFamily: "Inter",
    flex: 2,
    textAlign: "right",
  },
  purposeValue: {
    textAlign: "right",
  },
})
