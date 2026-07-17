import { NativeModule, requireNativeModule } from "expo"

declare class AppAttestModule extends NativeModule {
  isSupported(): Promise<boolean>
  generateKey(): Promise<string>
  attestKey(keyId: string, clientDataHashB64: string): Promise<string>
  generateAssertion(keyId: string, clientDataHashB64: string): Promise<string>
}

// This call loads the native module object from the JSI
export default requireNativeModule<AppAttestModule>("AppAttestModule")
