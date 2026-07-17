import { LinearGradient } from "expo-linear-gradient"
import { TouchableOpacity, View, StyleSheet, Text, Platform } from "react-native"
import { TabConfig } from "@/context/TabBarContext"
import { useTranslation } from "react-i18next"

interface ScanButtonProps {
  tab: TabConfig
  onPress: () => void
}

export function ScanButton({ tab, onPress }: ScanButtonProps) {
  const { t } = useTranslation()
  const Icon = tab.icon

  return (
    <View style={styles.middleTabContainer}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t(tab.label)}
        onPress={onPress}
        style={styles.middleTabButton}
        activeOpacity={0.8}
      >
        <LinearGradient colors={["#F5D9A0", "#E8C888"]} style={styles.middleTabGradient}>
          <Icon width={32} height={32} color={"#F5D9A0"} />
        </LinearGradient>
      </TouchableOpacity>
      <Text style={styles.middleTabLabel}>{t(tab.label)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  middleTabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 16,
    transform: Platform.OS === "ios" ? [{ translateY: 30 }] : [], // TODO: I dont like this, but it works.
  },
  middleTabButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    paddingLeft: 3,
    borderColor: "#1B2967",
    marginBottom: 8,
  },
  middleTabGradient: {
    width: 64,
    height: 64,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#1B2967",
  },
  middleTabLabel: {
    color: "#8B9BB8",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
})
