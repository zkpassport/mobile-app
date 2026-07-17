import { useLocalSearchParams, useRouter } from "expo-router"
import ScanPassportView from "@/components/ScanPassportView"

export default function ScanPassportRoute() {
  const router = useRouter()
  const { initialStep } = useLocalSearchParams<{ initialStep?: string }>()

  const handleFinish = () => {
    router.replace("/")
  }

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace("/")
    }
  }

  return (
    <ScanPassportView
      initialStep={(initialStep as any) || "CHOOSE_ID_TYPE"}
      onFinish={handleFinish}
      onCancel={handleCancel}
    />
  )
}
