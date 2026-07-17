import React, { createContext, useContext, type ReactNode } from "react"
import { View, StyleSheet, Dimensions, Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { router, usePathname, useLocalSearchParams } from "expo-router"

import { TabBG } from "@/assets/images/TabBG"
import { QRCode } from "@/assets/images/icons/QRCode"
import { PassportIcon } from "@/assets/images/icons/PassportIcon"
import { HistoryIcon } from "@/assets/images/icons/HistoryIcon"
import { useSettings } from "@/context/SettingsContext"
import { useQRScanner } from "@/context/QRScannerContext"
import { useTabBarVisibility } from "@/context/TabBarVisibilityContext"
import { ScanButton } from "@/components/ui/Buttons/ScanButton"
import { RegularTab } from "@/components/ui/Buttons/RegularTab"
import { getPassportUniqueId } from "@/lib"

const SCREEN_WIDTH = Dimensions.get("window").width
const TAB_BAR_HEIGHT = 167

type TabRoute = "index" | "history"

export interface TabConfig {
  key: TabRoute | "scan"
  label: string
  icon: React.ComponentType<{ width: number; height: number; color: string }>
  isMiddle?: boolean
}

const TABS: TabConfig[] = [
  { key: "index", label: "tabs.ids", icon: PassportIcon },
  { key: "scan", label: "tabs.verify", icon: QRCode, isMiddle: true },
  { key: "history", label: "tabs.history", icon: HistoryIcon },
]

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TabBarContextValue {
  // Empty for now, but can be extended
}

const TabBarContext = createContext<TabBarContextValue | undefined>(undefined)

export const useTabBar = () => {
  const context = useContext(TabBarContext)
  if (!context) {
    throw new Error("useTabBar must be used within a TabBarProvider")
  }
  return context
}

function getActiveTab(
  pathname: string,
  params: ReturnType<typeof useLocalSearchParams>,
): TabRoute | null {
  if (pathname === "/history") return "history"
  if (pathname === "/" && !params.passportId) return "index"
  return null
}

function TabBarComponent() {
  const pathname = usePathname()
  const params = useLocalSearchParams()
  const { currentPassport, checkUnsupportedId } = useSettings()
  const { openScanner } = useQRScanner()
  const { isHidden } = useTabBarVisibility()
  const insets = useSafeAreaInsets()

  const activeTab = getActiveTab(pathname, params)

  // Don't render if hidden or not on a tab screen
  if (isHidden || activeTab === null) {
    return null
  }

  const handleTabPress = (route: TabRoute) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    // Check if we're actually on the target route (not just showing it as active)
    const isOnIndex = pathname === "/" && !params.passportId
    const isOnHistory = pathname === "/history"

    // Don't navigate if already on the actual route
    if (route === "index" && isOnIndex) return
    if (route === "history" && isOnHistory) return

    if (route === "index") {
      router.replace("/")
    } else {
      router.push(`/${route}`)
    }
  }

  const handleScanPress = async () => {
    if (currentPassport) {
      const id = getPassportUniqueId(currentPassport)
      if (id && checkUnsupportedId(id)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        router.push("/unsupported-intent")
        return
      }
    }
    await openScanner()
  }

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
      <View style={styles.svgBackground}>
        <TabBG width={SCREEN_WIDTH} height={TAB_BAR_HEIGHT} color="#1B2967" />
      </View>

      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Platform.OS === "ios" ? -80 : 0,
          },
        ]}
      >
        {TABS.map((tab) =>
          tab.isMiddle ? (
            <ScanButton key={tab.key} tab={tab} onPress={handleScanPress} />
          ) : (
            <RegularTab
              key={tab.key}
              tab={tab}
              isActive={activeTab === tab.key}
              onPress={() => handleTabPress(tab.key as TabRoute)}
            />
          ),
        )}
      </View>
    </View>
  )
}

interface TabBarProviderProps {
  children: ReactNode
}

export function TabBarProvider({ children }: TabBarProviderProps) {
  const value: TabBarContextValue = {}

  return (
    <TabBarContext.Provider value={value}>
      <View style={styles.container}>
        <View style={styles.content}>{children}</View>
        <TabBarComponent />
      </View>
    </TabBarContext.Provider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  svgBackground: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: TAB_BAR_HEIGHT,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "transparent",
  },
})
