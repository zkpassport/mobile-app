import { useRouter } from "expo-router"
import SettingsPage from "@/components/settings/settings"

export default function SettingsRoute() {
  const router = useRouter()

  return (
    <SettingsPage
      onBack={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace("/")
        }
      }}
    />
  )
}
