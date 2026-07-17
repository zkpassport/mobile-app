import React, { useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Platform,
  BackHandler,
  ViewToken,
} from "react-native"
import { PassportView } from "@/components/PassportView/PassportView"
import { AnimatedAddIdCard } from "@/components/PassportView/AnimatedAddIdCard"
import { Colors } from "@/constants/Colors"
import { HideDetails } from "@/assets/images/icons/HideDetails"
import { Eye } from "@/assets/images/icons/Eye"
import { PassportViewModel } from "@zkpassport/utils"
import { useSettings } from "@/context/SettingsContext"
import { AlertModal } from "../Modals/AlertModal"
import * as ScreenCapture from "expo-screen-capture"
import { useFocusEffect } from "@react-navigation/native"
import { useRouter } from "expo-router"
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated"
import { ActionButton } from "../ui/Buttons/ActionButton"
import { SettingsIcon } from "@/assets/images/icons/SettingsIcon"
import { OptionsIcon } from "@/assets/images/icons/OptionsIcon"
import { useTranslation } from "react-i18next"
import { MrzScanService } from "@/services/MrzScanService"
import { Plus } from "@/assets/images/icons/Plus"
import { getPassportUniqueId } from "@/lib"

interface HomeProps {
  ids?: PassportViewModel[]
  passportIds?: string[]
  onAddID?: () => void
  onShowDetails?: (id: string) => void
  onOptions?: (id: string) => void
}

export default function Home({
  ids = [],
  passportIds = [],
  onAddID = () => {},
  onOptions = () => {},
}: HomeProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { settings, updateSettings, checkUnsupportedId, getPassportIdFromNumber } = useSettings()

  // Initialize currentCardIndex to the active passport's index
  const initialIndex = settings.activePassport ? passportIds.indexOf(settings.activePassport) : 0
  const [currentCardIndex, setCurrentCardIndex] = useState(initialIndex >= 0 ? initialIndex : 0)
  const [showScreenshotWarning, setShowScreenshotWarning] = useState(false)
  const screenshotTimeoutRef = useRef<number | null>(null)

  // Handle Android hardware back only while this screen is focused
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        router.replace("/")
        return true
      }
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
      return () => subscription.remove()
    }, [router]),
  )

  const handleScreenshotDetected = async () => {
    if (settings.hideIDDetails) {
      return
    }

    // On iOS, immediately hide details when screenshot is detected
    if (Platform.OS === "ios" && !settings.hideIDDetails) {
      settings.hideIDDetails = true
      await updateSettings({ hideIDDetails: true })
    }

    // Clear any existing timeout
    if (screenshotTimeoutRef.current) {
      clearTimeout(screenshotTimeoutRef.current)
    }

    // Show warning modal after a brief delay
    screenshotTimeoutRef.current = setTimeout(() => {
      setShowScreenshotWarning(true)
    }, 1000)
  }

  useFocusEffect(
    React.useCallback(() => {
      let subscription: { remove: () => void } | null = null
      let isSetupComplete = false

      const setupScreenshotProtection = async () => {
        try {
          const isAvailable = await ScreenCapture.isAvailableAsync()
          if (!isAvailable) {
            console.log("Screenshot capture API not available on this device")
            return
          }

          const { status } = await ScreenCapture.getPermissionsAsync()
          // Set up screenshot detection for both platforms
          // Will be skipped on Android but it's fine as the screenshots are blocked on Android
          if (status === "granted") {
            subscription = ScreenCapture.addScreenshotListener(handleScreenshotDetected)
            console.log("Screenshot detection enabled for PassportView")
          } else {
            console.log("Screenshot detection permissions not granted")
          }

          if (Platform.OS === "android") {
            // On Android: Use actual screenshot prevention
            if (!settings.hideIDDetails) {
              await ScreenCapture.preventScreenCaptureAsync("passport-view")
              console.log("Screenshot prevention enabled (Android)")
            }
          }

          isSetupComplete = true
        } catch (error) {
          console.warn("Failed to set up screenshot protection:", error)
        }
      }

      setupScreenshotProtection()

      // Cleanup function - runs when screen loses focus or component unmounts
      return () => {
        if (subscription) {
          subscription.remove()
          console.log("Screenshot detection disabled for PassportView")
        }
        if (screenshotTimeoutRef.current) {
          clearTimeout(screenshotTimeoutRef.current)
        }
        // Always allow screenshots when screen loses focus (Android only)
        if (Platform.OS === "android" && isSetupComplete) {
          ScreenCapture.allowScreenCaptureAsync("passport-view").catch(() => {})
          console.log("Screenshot prevention disabled (Android)")
        }
        // Hide any active warning modal when leaving the screen
        setShowScreenshotWarning(false)
      }
    }, [settings.hideIDDetails]),
  )

  // Separate effect to manage screenshot prevention when hideIDDetails changes
  // This only runs when the component is mounted (i.e., screen is focused)
  useEffect(() => {
    if (Platform.OS !== "android") return

    const manageScreenshotPrevention = async () => {
      try {
        if (!settings.hideIDDetails) {
          // Prevent screenshots when details are visible
          await ScreenCapture.preventScreenCaptureAsync("passport-view")
        } else {
          // Allow screenshots when details are hidden
          await ScreenCapture.allowScreenCaptureAsync("passport-view")
        }
      } catch (error) {
        console.warn("Failed to manage screenshot prevention:", error)
      }
    }

    manageScreenshotPrevention()
  }, [settings.hideIDDetails])

  const closeScreenshotWarning = () => {
    setShowScreenshotWarning(false)
  }

  const flatListRef = useRef<FlatList>(null)
  // TODO: Figure out if this is a feature we should keep or remove
  const previousPassportIdsLength = useRef(passportIds.length)
  const hasInitializedScroll = useRef(false)
  // Flag to prevent onViewableItemsChanged from updating activePassport until initial scroll is done
  const allowViewableItemsUpdate = useRef(false)

  // Scroll to active passport on mount or when a new passport is added
  useEffect(() => {
    const isNewPassportAdded = passportIds.length > previousPassportIdsLength.current

    if (settings.activePassport && passportIds.length > 0) {
      const activeIndex = passportIds.indexOf(settings.activePassport)

      // Scroll on initial mount or when new passport is added
      if (activeIndex !== -1 && (!hasInitializedScroll.current || isNewPassportAdded)) {
        // Disable viewable items update until scroll is complete
        allowViewableItemsUpdate.current = false
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: activeIndex,
            animated: isNewPassportAdded, // Only animate when adding new passport
          })
          hasInitializedScroll.current = true
          // Re-enable viewable items update after scroll completes
          // Use a longer timeout to ensure scroll animation completes
          setTimeout(() => {
            allowViewableItemsUpdate.current = true
          }, 150)
        }, 100)
      } else {
        // If we don't need to scroll, allow updates immediately
        allowViewableItemsUpdate.current = true
      }
    } else {
      allowViewableItemsUpdate.current = true
    }

    previousPassportIdsLength.current = passportIds.length
  }, [passportIds.length, settings.activePassport])

  // Store the latest settings, updateSettings, and passportIds in refs to avoid stale closures
  const settingsRef = useRef(settings)
  const updateSettingsRef = useRef(updateSettings)
  const passportIdsRef = useRef(passportIds)

  useEffect(() => {
    settingsRef.current = settings
    updateSettingsRef.current = updateSettings
    passportIdsRef.current = passportIds
  }, [settings, updateSettings, passportIds])

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      const index = viewableItems[0].index
      setCurrentCardIndex(index)

      // Only update active passport if the initial scroll has completed
      // This prevents the race condition where FlatList fires onViewableItemsChanged
      // with index 0 before the scroll to the active passport completes
      if (!allowViewableItemsUpdate.current) {
        return
      }

      // Update active passport - use refs to avoid stale closure
      const currentPassportIds = passportIdsRef.current
      if (index < currentPassportIds.length && currentPassportIds[index]) {
        const passportId = currentPassportIds[index]
        if (settingsRef.current.activePassport !== passportId) {
          console.log("IDPage: Updating activePassport to", passportId)
          updateSettingsRef.current({ activePassport: passportId })
        }
      }
    }
  }).current

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current

  const currentIdData = ids[currentCardIndex]
  const isAddIdCardVisible = currentCardIndex === ids.length

  const handleOptionsPress = () => {
    if (!currentIdData) {
      return
    }
    onOptions(currentIdData.passportNumber)
    router.push({
      pathname: "/(options)/options",
      params: { passportId: getPassportUniqueId(currentIdData) },
    })
  }

  const scrollX = useSharedValue(0)
  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
  })

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("passportView.yourIDs")}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.addButton} onPress={onAddID}>
            {/* If the title is too long, remove the text and only show the plus icon*/}
            {t("passportView.yourIDs") && t("passportView.yourIDs").length < 10 && (
              <Text style={styles.addButtonText}>{t("passportView.addID")}</Text>
            )}
            <Plus width={12} height={12} color="#DBDFF3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push("/(options)/settings")}
          >
            <SettingsIcon width={17} height={17} color="#FBFBFB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ID Cards List */}
      {/* NOTE THERE IS A BUG IN REACT NATIVE REANIMATED
      https://github.com/software-mansion/react-native-reanimated/issues/8422
       */}
      <View style={styles.flatListContainer}>
        <Animated.FlatList
          ref={flatListRef}
          data={[...ids, null]} // null for add ID card
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled={true}
          onScroll={onScrollHandler}
          decelerationRate="fast"
          snapToAlignment="center"
          removeClippedSubviews={false} // Avoid Android crashes when recycling views during fast scrolls
          initialNumToRender={ids.length + 1} // Render everything up front to reduce recycling churn
          windowSize={ids.length + 2}
          maxToRenderPerBatch={ids.length + 1}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          keyExtractor={(item, index) =>
            item ? `${item.passportNumber}-${item.passportExpiry}` : `add-${index}`
          }
          renderItem={({ item, index }) => {
            if (!item) {
              // Add ID Card - use same animation as PassportView
              return <AnimatedAddIdCard scrollX={scrollX} index={index} onPress={onAddID} />
            }

            const passportId = getPassportIdFromNumber(item.passportNumber)
            const isUnsupported = passportId ? checkUnsupportedId(passportId) : false
            const mrzService = MrzScanService.getInstance()
            const isExpired = mrzService.isExpired(item.mrz)
            return (
              <PassportView
                passport={item}
                showDetails={!settings.hideIDDetails}
                isUnsupported={isUnsupported}
                isExpired={isExpired}
                scrollX={scrollX}
                index={index}
              />
            )
          }}
        />
      </View>

      {/* Fixed Action Buttons */}
      {!isAddIdCardVisible && (
        <View style={styles.actionButtons}>
          <ActionButton
            icon={
              !settings.hideIDDetails ? (
                <HideDetails width={24} height={24} color="#FBFBFB" />
              ) : (
                <Eye width={24} height={24} color="#FBFBFB" />
              )
            }
            text={
              !settings.hideIDDetails
                ? t("passportView.hideDetails")
                : t("passportView.showDetails")
            }
            onPress={() => updateSettings({ hideIDDetails: !settings.hideIDDetails })}
            backgroundColor="#2139A3"
          />
          <ActionButton
            icon={<OptionsIcon width={30} height={30} color="#FBFBFB" />}
            text={t("passportView.options")}
            onPress={handleOptionsPress}
          />
        </View>
      )}
      <AlertModal
        visible={showScreenshotWarning}
        onAccept={closeScreenshotWarning}
        onClose={closeScreenshotWarning}
        icon={require("@/assets/images/icons/RedCross.png")}
        iconSize={64}
        title={t("passportView.privacyWarning.title")}
        description={t("passportView.privacyWarning.description")}
        buttonText={t("passportView.privacyWarning.understood")}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  addButton: {
    flexDirection: "row",
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2B3871",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DBDFF3",
  },
  settingsButton: {
    backgroundColor: "#2B3871",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9999,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  flatListContainer: {
    height: 378,
  },
  actionButtons: {
    paddingHorizontal: 60,
    flexDirection: "row",
    gap: 16,
  },
})
