import { NativeModule, requireNativeModule } from "expo"

declare class FaceMatchModule extends NativeModule {
  initSessions(detectorPath: string, recognitionPath: string): Promise<string>

  cleanupSessions(): Promise<string>

  analyzeFaceDetection(bytes: Uint8Array | number[], scrfdModelPath: string): Promise<string>

  analyzeFaceEmbedding(
    bytes: Uint8Array | number[],
    arcfaceModelPath: string,
    landmarksJson: string,
  ): Promise<string>
}

// This call loads the native module object from the JSI
export default requireNativeModule<FaceMatchModule>("FaceMatch")
