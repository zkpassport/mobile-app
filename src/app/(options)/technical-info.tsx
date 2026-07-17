import { useLocalSearchParams, useRouter } from "expo-router"
import TechnicalInfoPage from "@/components/settings/TechnicalInfoPage"
import { useSettings } from "@/context/SettingsContext"
import { Alert } from "react-native"
import { t } from "i18next"
import { useHideTabBar } from "@/context/TabBarVisibilityContext"
import { getPassportUniqueId } from "@/lib"

export default function TechnicalInfoRoute() {
  const router = useRouter()
  const { passportId } = useLocalSearchParams<{ passportId: string }>()
  const { passports } = useSettings()

  useHideTabBar(false)

  const passport = passportId ? passports[passportId] : null

  if (!passport) {
    Alert.alert(t("home.noID"), t("home.scanIDFirst"))
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace("/")
    }
    return <></>
  }

  return (
    <TechnicalInfoPage
      onBack={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace({
            pathname: "/(options)/options",
            params: { passportId: getPassportUniqueId(passport) },
          })
        }
      }}
      passport={passport}
    />
  )
}
