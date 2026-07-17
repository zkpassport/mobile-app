import { useEffect, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import OptionsPage from "@/components/settings/options"
import { useSettings } from "@/context/SettingsContext"
import type { PassportViewModel } from "@zkpassport/utils"

export default function OptionsRoute() {
  const router = useRouter()
  const { passportId } = useLocalSearchParams<{ passportId: string }>()
  const { passports } = useSettings()

  const passport = passportId ? passports[passportId] : null
  const [cachedPassport, setCachedPassport] = useState<PassportViewModel | null>(passport ?? null)
  const [shouldExit, setShouldExit] = useState(false)

  useEffect(() => {
    if (passport) {
      setCachedPassport(passport)
      return
    }

    if (!cachedPassport) {
      setShouldExit(true)
    }
  }, [passport, cachedPassport])

  useEffect(() => {
    if (!shouldExit) return
    // Small delay to ensure state has propagated from SettingsContext
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace("/")
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [shouldExit, router])

  if (!cachedPassport) {
    // Trigger exit if somehow still on this screen without data
    if (!shouldExit) setShouldExit(true)
    return <></>
  }

  const handleDeleteComplete = () => {
    setCachedPassport(null)
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace("/")
    }
  }

  return (
    <OptionsPage
      passport={cachedPassport}
      onBack={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace("/")
        }
      }}
      onDeleteComplete={handleDeleteComplete}
    />
  )
}
