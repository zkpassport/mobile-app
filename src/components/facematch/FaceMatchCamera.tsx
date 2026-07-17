import React, { useCallback } from "react"
import { Platform } from "react-native"
import { Camera, useCameraDevice, useCameraFormat } from "react-native-vision-camera"

type FaceMatchCameraProps = {
  cameraRef: React.RefObject<Camera | null>
  onReadyChange?: (ready: boolean) => void
  width: any
  height: any
  scale?: number
}

export default function FaceMatchCamera(props: FaceMatchCameraProps) {
  const { cameraRef, onReadyChange, width, height, scale = 1.1 } = props

  const device = useCameraDevice("front")

  const handleCameraReady = useCallback(() => {
    console.log("[FM] Vision Camera ready")
    onReadyChange?.(true)
  }, [onReadyChange])

  const format = useCameraFormat(device, [
    { fps: 30 },
    { videoResolution: { width: 640, height: 480 } },
  ])

  const video = Platform.OS === "ios"
  const mirror = false

  if (!device) {
    return null
  }

  return (
    <Camera
      ref={cameraRef}
      device={device}
      isActive={true}
      format={format}
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        left: -2,
        top: -2,
        transform: [{ scale }, { scaleX: mirror ? -1 : 1 }],
      }}
      photo={true}
      onInitialized={handleCameraReady}
      video={video}
    />
  )
}
