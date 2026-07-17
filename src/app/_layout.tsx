import { Stack, useRouter } from "expo-router"
import { useEffect } from "react"
import { BackHandler, View } from "react-native"

import { SettingsProvider } from "@/context/SettingsContext"
import { WebSocketProvider } from "@/context/WebSocketContext"
import { ErrorProvider } from "@/context/ErrorContext"
import { StorageProvider } from "@/context/StorageContext"
import { TabBarVisibilityProvider } from "@/context/TabBarVisibilityContext"
import { QRScannerProvider } from "@/context/QRScannerContext"
import { TabBarProvider } from "@/context/TabBarContext"
import ErrorBoundary from "@/components/ErrorBoundary"
import { ModalPortalProvider } from "@/components/Modals/ModalPortalProvider"
import "react-native-get-random-values"
import "../i18n/i18n"

// Buffer polyfill
import { Buffer } from "buffer/"
import { TextEncoderPolyfill } from "@/lib"
import { TextDecoderPolyfill } from "@/lib"

globalThis.Buffer = Buffer as any

// TextDecoder and TextEncoder polyfills
if (typeof global.TextDecoder === "undefined") {
  ;(global as any).TextDecoder = TextDecoderPolyfill
}

if (typeof global.TextEncoder === "undefined") {
  ;(global as any).TextEncoder = TextEncoderPolyfill
}

export default function RootLayout() {
  const router = useRouter()

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back()
        return true
      }
      return false
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [router])

  return (
    <View style={{ flex: 1, backgroundColor: "#07245C" }}>
      <ModalPortalProvider>
        <StorageProvider>
          <ErrorProvider>
            <SettingsProvider>
              <ErrorBoundary>
                <TabBarVisibilityProvider>
                  <WebSocketProvider>
                    <QRScannerProvider>
                      <TabBarProvider>
                        <Stack
                          screenOptions={{
                            headerShown: false,
                          }}
                        >
                          <Stack.Screen
                            name="index"
                            options={{
                              animation: "none",
                            }}
                          />
                          <Stack.Screen
                            name="history"
                            options={{
                              animation: "none",
                            }}
                          />
                          <Stack.Screen name="scan-passport" />
                          <Stack.Screen
                            name="options"
                            options={{
                              animation: "none",
                            }}
                          />
                          <Stack.Screen name="unsupported-intent" />
                          <Stack.Screen
                            name="access-request"
                            options={{
                              animation: "slide_from_bottom",
                            }}
                          />
                          <Stack.Screen
                            name="history-item"
                            options={{
                              presentation: "modal",
                            }}
                          />
                        </Stack>
                      </TabBarProvider>
                    </QRScannerProvider>
                  </WebSocketProvider>
                </TabBarVisibilityProvider>
              </ErrorBoundary>
            </SettingsProvider>
          </ErrorProvider>
        </StorageProvider>
      </ModalPortalProvider>
    </View>
  )
}
