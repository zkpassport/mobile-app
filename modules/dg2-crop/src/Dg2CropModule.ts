import { NativeModule, requireNativeModule } from "expo"

declare class Dg2CropModule extends NativeModule {
  trimWhiteBorderBase64(base64Input: string, tolerance: number): Promise<string>
  removeBackgroundBase64(base64Input: string): Promise<string>
}

// This call loads the native module object from the JSI
export default requireNativeModule<Dg2CropModule>("Dg2Crop")
