// import React, { useMemo, useEffect, useState } from "react"
// import Svg, { Path } from "react-native-svg"
// import { Animated } from "react-native"
// import { GazeDirection2D } from "@/services/facematch"

// type FaceCrosshairProps = {
//   size: number
//   noseX: Animated.Value
//   noseY: Animated.Value
//   gaze: GazeDirection2D | null | undefined
//   color?: string
//   strokeWidth?: number
// }

// const GAZE_VECTOR_EPSILON = 0.01

// export const FaceCrosshair: React.FC<FaceCrosshairProps> = ({
//   size,
//   noseX,
//   noseY,
//   gaze,
//   color = "#F4D8A0",
//   strokeWidth = 3,
// }) => {
//   const [noseXValue, setNoseXValue] = useState(size / 2)
//   const [noseYValue, setNoseYValue] = useState(size / 2)

//   useEffect(() => {
//     const listenerX = noseX.addListener(({ value }) => setNoseXValue(value))
//     const listenerY = noseY.addListener(({ value }) => setNoseYValue(value))
//     return () => {
//       noseX.removeListener(listenerX)
//       noseY.removeListener(listenerY)
//     }
//   }, [noseX, noseY])

//   // Calculate crosshair intersection point from gaze (same logic as GazeIndicator)
//   const { crosshairX, crosshairY } = useMemo(() => {
//     let targetX = noseXValue
//     let targetY = noseYValue

//     if (gaze && Math.abs(gaze.magnitude) >= GAZE_VECTOR_EPSILON) {
//       const angleRad = (gaze.angleDeg * Math.PI) / 180
//       const dx = Math.cos(angleRad)
//       const dy = Math.sin(angleRad)
//       const baseLength = size * 0.32
//       // Scale length based on direction: longer for horizontal (left/right), shorter for vertical (up/down)
//       // abs(dx) is high for horizontal, abs(dy) is high for vertical
//       const directionScale = 0.7 + 0.8 * Math.abs(dx) // 0.7x for pure vertical, 1.3x for pure horizontal
//       const lineLength = baseLength * gaze.magnitude * 3 * directionScale

//       targetX = noseXValue + dx * lineLength
//       targetY = noseYValue + dy * lineLength
//     }

//     return { crosshairX: targetX, crosshairY: targetY }
//   }, [noseXValue, noseYValue, gaze, size])

//   // Calculate Bézier control points directly (same as before, but no interpolation)
//   const { horizontalPath, verticalPath } = useMemo(() => {
//     const centerY = size / 2
//     const centerX = size / 2

//     // Helper function to calculate control point for quadratic Bézier
//     // that passes through (crosshairX, crosshairY) at t=0.5
//     const calculateControlPoint = (
//       startX: number,
//       startY: number,
//       endX: number,
//       endY: number,
//       throughX: number,
//       throughY: number,
//     ) => {
//       // Control point = 2 * (point to pass through) - 0.5 * (start + end)
//       const controlX = 2 * throughX - 0.5 * (startX + endX)
//       const controlY = 2 * throughY - 0.5 * (startY + endY)
//       return { controlX, controlY }
//     }

//     // Horizontal path through crosshair point
//     const hControl = calculateControlPoint(0, centerY, size, centerY, crosshairX, crosshairY)
//     const horizontalPath = `M 0,${centerY} Q ${hControl.controlX},${hControl.controlY} ${size},${centerY}`

//     // Vertical path through crosshair point
//     const vControl = calculateControlPoint(centerX, 0, centerX, size, crosshairX, crosshairY)
//     const verticalPath = `M ${centerX},0 Q ${vControl.controlX},${vControl.controlY} ${centerX},${size}`

//     return { horizontalPath, verticalPath }
//   }, [size, crosshairX, crosshairY])

//   return (
//     <Svg
//       width={size}
//       height={size}
//       style={{ position: "absolute", top: 0, left: 0 }}
//       pointerEvents="none"
//     >
//       {/* Horizontal line - smooth curve through gaze endpoint */}
//       <Path
//         d={horizontalPath}
//         stroke={color}
//         strokeWidth={strokeWidth}
//         fill="none"
//         strokeLinecap="round"
//       />

//       {/* Vertical line - smooth curve through gaze endpoint */}
//       <Path
//         d={verticalPath}
//         stroke={color}
//         strokeWidth={strokeWidth}
//         fill="none"
//         strokeLinecap="round"
//       />

//       {/* Debug: Show the actual crosshair point */}
//       {/* <circle cx={crosshairX} cy={crosshairY} r={8} fill="red" opacity={0.7} /> */}
//     </Svg>
//   )
// }
