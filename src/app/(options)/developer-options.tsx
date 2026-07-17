import { useRouter } from "expo-router"
import DeveloperOptionsPage from "@/components/settings/DeveloperOptionsPage"
import { BackHandler } from "react-native"
import { useSettings } from "@/context/SettingsContext"
import { useEffect } from "react"
import { getPassportUniqueId } from "@/lib"

export default function DeveloperOptionsRoute() {
  const router = useRouter()
  const { currentPassport } = useSettings()

  useEffect(() => {
    const onBackPress = () => {
      handleBack()
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [currentPassport])

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else if (currentPassport) {
      router.replace({
        pathname: "/(options)/options",
        params: { passportId: getPassportUniqueId(currentPassport) },
      })
    } else {
      router.replace("/")
    }
  }

  return <DeveloperOptionsPage onBack={handleBack} />
}
