import React, { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { MinusIcon } from "lucide-react-native"
import { LinearGrad } from "../ui/Text/LinearGradient"
import { Trans, useTranslation } from "react-i18next"
import { GradientPlusIcon } from "@/assets/images/icons/GradientPlusIcon"
import { Plus } from "@/assets/images/icons/Plus"

export interface LocalizedString {
  i18nKey: string
  values?: Record<string, any>
}

export interface CriteriaItem {
  id: string
  question: string
  info?: string
  moreInfo?: string
  result?: string | LocalizedString
  criteria: string | LocalizedString
  isCollapsed?: boolean
  passed: boolean
}

interface VerificationCriteriaListProps {
  items: CriteriaItem[]
  title?: string
  history?: boolean
}

const CriteriaItemComponent: React.FC<{ item: CriteriaItem; history?: boolean }> = ({
  item,
  history = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(!item.isCollapsed)

  const processResultOrCriteria = (result: string | LocalizedString, pastTense?: boolean) => {
    if (typeof result === "object" && "i18nKey" in result) {
      return (
        <Trans
          i18nKey={pastTense ? `${result.i18nKey}_past` : result.i18nKey}
          // The components are not part of the values stored, it's assumed to be consistent
          // across all the criteria items and result strings
          components={{ bold: <Text style={{ fontWeight: "700" }} /> }}
          values={result.values}
        />
      )
    }
    return result as string
  }

  return (
    <View style={styles.criteriaItemWrapper}>
      <TouchableOpacity
        style={[styles.criteriaItem, !item.passed && styles.criteriaItemFailed]}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={1}
      >
        {/* Header */}
        <View style={styles.criteriaHeader}>
          <LinearGrad
            text={item.question}
            colors={item.passed ? ["#F2DCB0", "#F6D38F"] : ["#E6657E", "#E6657E"]}
            textStyle={styles.criteriaQuestion}
            containerStyle={{ flex: 1, marginRight: 12 }}
          />

          {isExpanded ? (
            <MinusIcon width={20} height={20} color={item.passed ? "#F5D598" : "#E6657E"} />
          ) : item.passed ? (
            <GradientPlusIcon width={19} height={14} />
          ) : (
            <Plus width={19} height={16} color="#E6657E" />
          )}
        </View>

        {/* Expanded Content */}

        {isExpanded && item.result && (
          <View style={styles.criteriaContent}>
            {/* Shared Information */}
            <View style={styles.criteriaRow}>
              <Text style={[styles.criteriaValue]}>
                {/* The criteria title can be in the present */}
                {processResultOrCriteria(item.result, false)}
              </Text>
            </View>
          </View>
        )}

        {/* Criteria */}
        {isExpanded && (
          <View style={[styles.criteriaRow, { paddingTop: 16 }]}>
            <Text style={styles.criteriaCriteria}>
              {/* The criteria should be in the past tense if it's a history item */}
              {processResultOrCriteria(item.criteria, history)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

export const VerificationCriteriaList: React.FC<VerificationCriteriaListProps> = ({
  title,
  items,
  history = false,
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      {/* Section Title */}
      <Text style={styles.title}>{title || t("VerificationCriteriaList.title")}</Text>

      {/* Criteria Items */}
      <View style={styles.list}>
        {items.map((item) => (
          <CriteriaItemComponent key={item.id} item={item} history={history} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#F0F2FC",
    textAlign: "center",
    // fontFamily: "Inter",
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#E7E7E7",
    marginBottom: 32,
    lineHeight: 22,
  },
  list: {
    gap: 32,
    marginBottom: 12,
  },
  criteriaItemWrapper: {
    position: "relative",
  },
  criteriaItem: {
    backgroundColor: "#212E6B",
    borderRadius: 12,
    padding: 16,
  },
  criteriaItemFailed: {
    backgroundColor: "rgba(230, 101, 126, 0.10)",
  },
  criteriaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  criteriaQuestion: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    color: "#FFFFFF",
    // fontFamily: "Inter",
  },
  criteriaContent: {
    marginTop: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(251, 251, 251, 0.10)",
    paddingBottom: 16,
  },
  criteriaCriteria: {
    fontSize: 12,
    fontWeight: "400",
    color: "#C7CDEA",
    // fontFamily: "Inter",
    flex: 1,
  },
  criteriaRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  criteriaLabel: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: "#E7E7E7",
    // fontFamily: "Inter",
    flex: 1,
  },
  criteriaValue: {
    fontSize: 14,
    color: "#FBFBFB",
    fontWeight: "700",
    // fontFamily: "Inter",
    flex: 1,
    textAlign: "left",
  },
  failedMessageContainer: {
    backgroundColor: "#E6657E",
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: "#E6657E",
    marginTop: -12,
    zIndex: 1,
    elevation: 1,
  },
  failedMessageText: {
    color: "#F8F8F8",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    lineHeight: 18,
  },
})
