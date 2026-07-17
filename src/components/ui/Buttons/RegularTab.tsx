import { TouchableOpacity, View, StyleSheet, Text, Platform } from "react-native"
import { TabConfig } from "@/context/TabBarContext"
import { useTranslation } from "react-i18next"

interface RegularTabProps {
  tab: TabConfig
  isActive: boolean
  onPress: () => void
}

export function RegularTab({ tab, isActive, onPress }: RegularTabProps) {
  const { t } = useTranslation()
  const Icon = tab.icon
  const iconColor = isActive ? "#F5D9A0" : "#8B9BB8"

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={t(tab.label)}
      onPress={onPress}
      style={styles.tabButton}
      activeOpacity={0.7}
    >
      <View style={styles.tabContent}>
        <Icon width={24} height={24} color={iconColor} />
        <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : styles.tabLabelInactive]}>
          {t(tab.label)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 16,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    transform: Platform.OS === "ios" ? [{ translateY: 30 }] : [], // TODO: I dont like this, but it works.
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "400",
  },
  tabLabelActive: {
    color: "#F5D9A0",
  },
  tabLabelInactive: {
    color: "#8B9BB8",
  },
})
