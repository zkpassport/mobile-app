import { useRouter } from "expo-router"
import SecurityPage from "@/components/settings/SecurityPage"
import { BackHandler } from "react-native"
import { useEffect } from "react"

export default function SecurityRoute() {
  const router = useRouter()

  useEffect(() => {
    const onBackPress = () => {
      handleBack()
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [])

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace("/")
    }
  }

  return <SecurityPage onBack={handleBack} />
}
