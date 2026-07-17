import React from "react"
import Svg, { G, Rect, Circle } from "react-native-svg"
import { LIVENESS_SEGMENT_INDICES } from "@/services/facematch/utils"
import { View, Animated } from "react-native"

type SegmentedRingProps = {
  size: number
  ringThickness?: number
  segmentsTotal?: number
  segmentsActive?: number // how many ticks are currently green
  gapDegrees?: number
  startAngle?: number
  inactiveColor?: string
  activeColor?: string
  highlightedIndices?: number[]
  highlightedColor?: string
  completedIndices?: number[]
  completedColor?: string
  opacity?: Animated.Value
  children?: React.ReactNode
}

function getCorrectedCompletedIndices(completedIndices: number[]): number[] {
  if (completedIndices.length === 0) return []
  if (completedIndices.length === 1) return [LIVENESS_SEGMENT_INDICES[1]]
  if (completedIndices.length === 2) return LIVENESS_SEGMENT_INDICES.slice(1, 3)
  if (completedIndices.length === 3) return LIVENESS_SEGMENT_INDICES.slice(1, 4)
  return completedIndices
}

export const SegmentedRing: React.FC<SegmentedRingProps> = ({
  size,
  ringThickness = 28,
  segmentsTotal = 50,
  gapDegrees = 1.6,
  startAngle = 180,
  segmentsActive = 0,
  inactiveColor = "#9AA6B2",
  activeColor = "#F4D8A0",
  highlightedIndices,
  highlightedColor = "#F4D8A0",
  completedIndices,
  completedColor = "#F4D8A0",
  opacity = 1,
  children,
}) => {
  const cx = size / 2
  const cy = size / 2
  const outerR = (size / 2) * 0.86
  const innerR = outerR - ringThickness
  const step = 360 / segmentsTotal
  const tickArc = Math.max(step - gapDegrees, 0)
  const tickW = (Math.PI * outerR * tickArc) / 180
  const tickH = ringThickness
  const rectX = -tickW / 2
  const rectY = -outerR + (outerR - innerR - tickH) / 2

  return (
    <View style={{ width: size, height: size, position: "relative" }} pointerEvents="none">
      <Animated.View style={{ width: size, height: size, opacity: opacity }} pointerEvents="none">
        <Svg width={size} height={size}>
          <G originX={cx} originY={cy} x={cx} y={cy}>
            {Array.from({ length: segmentsTotal }).map((_, i) => {
              const angle = startAngle + i * step
              const isActive = i < segmentsActive
              const isHighlighted = highlightedIndices?.includes(i)
              // TODO: find a way to actually fix this cause the completed indices are out of sync
              // with the actual angle (3 should stand for left, not 40)
              // Angle 0 is at the top, so 3 is around 90 degrees
              const isCompleted = getCorrectedCompletedIndices(completedIndices ?? []).includes(i)
              const fillColor = isHighlighted
                ? highlightedColor
                : isCompleted
                  ? completedColor
                  : isActive
                    ? activeColor
                    : inactiveColor
              const opacity = isHighlighted || isCompleted || isActive ? 1 : 0.6
              return (
                <G key={i} rotation={angle}>
                  <Rect
                    x={rectX}
                    y={rectY}
                    width={tickW}
                    height={tickH}
                    rx={tickH * 0.25}
                    fill={fillColor}
                    opacity={opacity}
                  />
                </G>
              )
            })}
          </G>
          <Circle cx={cx} cy={cy} r={innerR} stroke="#0f2f66" strokeWidth={6} fill="none" />
        </Svg>
      </Animated.View>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {children}
      </View>
    </View>
  )
}
