import React, { useMemo } from "react"
import { router } from "expo-router"
import EventPage, { EventPageType } from "@/components/Info/EventPage"
import { useSettings } from "@/context/SettingsContext"
import { isIDSupported } from "@zkpassport/utils"

// This is needed for the case where a user has a supported passport selected,
//  but then tries to scan a QR code with an unsupported passport
// handled by the tab bar scan.
const UnsupportedIntentScreen = () => {
  const { settings, passports, updateSettings, checkUnsupportedId } = useSettings()

  /**
   * Calculate if there are any eligible alternate passports that could be used instead.
   * This is needed to see what screen to navigate to them when they continue
   */
  const { alternatePassportId, hasEligibleAlternate } = useMemo(() => {
    // Get all stored passport IDs, excluding the currently active one
    const storedPassports = settings.passports ?? []
    const activePassportId = settings.activePassport
    const otherPassportIds = storedPassports
      .map((p) => p.id)
      .filter((id): id is string => !!id && id !== activePassportId)

    // Filter to only passports that are eligible (not unsupported and valid)
    const eligiblePassportIds = otherPassportIds.filter((id) => {
      // Skip if this passport is marked as unsupported
      if (checkUnsupportedId(id)) {
        return false
      }

      // Skip if passport data doesn't exist
      const passport = passports[id]
      if (!passport) {
        return false
      }

      // Only include if the passport type is supported by the system
      return isIDSupported(passport)
    })

    // Return the first eligible alternate passport ID (if any), and whether any exist
    return {
      alternatePassportId: eligiblePassportIds[0] ?? null,
      hasEligibleAlternate: eligiblePassportIds.length > 0,
    }
  }, [settings.passports, settings.activePassport, passports, checkUnsupportedId])

  /**
   * Handler for when user chooses to use another passport.
   * If an eligible alternate exists, switch to it.
   * Otherwise, navigate to the main screen with a flag to prompt passport scanning.
   */
  const handleChooseAnother = async () => {
    if (hasEligibleAlternate && alternatePassportId) {
      // Switch to the alternate passport and go to main screen
      await updateSettings({ activePassport: alternatePassportId })
      router.replace("/")
      return
    }

    // No eligible alternate exists, navigate to main screen with scan prompt
    router.replace({
      pathname: "/",
      params: { scanPassport: "true" },
    })
  }

  /**
   * Handler for when user closes/dismisses the unsupported intent screen.
   * Simply navigates back to the main tabs screen.
   */
  const handleClose = () => {
    router.replace("/")
  }

  // Render the event page with unsupported intent messaging and action handlers
  return (
    <EventPage
      stepType={EventPageType.NOT_SUPPORTED_INTENT}
      onContinue={handleChooseAnother}
      onSecondary={handleClose}
    />
  )
}

export default UnsupportedIntentScreen
