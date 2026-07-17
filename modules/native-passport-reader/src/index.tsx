import { NativeModules, Platform } from "react-native"

const LINKING_ERROR =
  `The package 'react-native-passport-reader' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: "" }) +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n"

const PassportReader = NativeModules.PassportReader
  ? NativeModules.PassportReader
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR)
        },
      },
    )

export function isSupported(): Promise<boolean> {
  return PassportReader.isSupported()
}

export function scan(opts: {
  documentNumber: string
  dateOfBirth: string
  dateOfExpiry: string
}): Promise<string> {
  return PassportReader.scan(opts)
}

export function isNFCEnabled(): Promise<boolean> {
  return PassportReader.isNFCEnabled()
}

export function goToNfcSetting(): Promise<boolean> {
  return PassportReader.goToNfcSetting()
}

export function cancel(): Promise<void> {
  return PassportReader.cancel()
}

export function getNfcStatus(): Promise<{
  isSupported: boolean
  isEnabled: boolean
  isReading: boolean
  hasActivePromise: boolean
  isCircuitBreakerOpen: boolean
  hapticFeedbackEnabled: boolean
}> {
  return PassportReader.getNfcStatus()
}
