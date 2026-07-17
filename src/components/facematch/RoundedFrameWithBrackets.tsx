import React from "react"
import { StyleSheet, Animated } from "react-native"
import Svg, { Rect as SvgRect, Line as SvgLine } from "react-native-svg"

const AnimatedSvgRect = Animated.createAnimatedComponent(SvgRect)

type RoundedFrameWithBracketsProps = {
  size: number
  borderRadius: Animated.Value | number
  borderColor: string
  borderWidth: number
  bracketsOpacity?: number
}

export const RoundedFrameWithBrackets: React.FC<RoundedFrameWithBracketsProps> = ({
  size,
  borderRadius,
  borderColor,
  borderWidth,
  bracketsOpacity = 1,
}) => {
  const bracketLength = size * 0.15
  const bracketThickness = borderWidth

  const cornerRadius = typeof borderRadius === "number" ? borderRadius : 32

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top-left bracket */}
      <SvgLine
        x1={0}
        y1={cornerRadius}
        x2={0}
        y2={0}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />
      <SvgLine
        x1={0}
        y1={0}
        x2={bracketLength}
        y2={0}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />

      {/* Top-right bracket */}
      <SvgLine
        x1={size - bracketLength}
        y1={0}
        x2={size}
        y2={0}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />
      <SvgLine
        x1={size}
        y1={0}
        x2={size}
        y2={cornerRadius}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />

      {/* Bottom-left bracket */}
      <SvgLine
        x1={0}
        y1={size - cornerRadius}
        x2={0}
        y2={size}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />
      <SvgLine
        x1={0}
        y1={size}
        x2={bracketLength}
        y2={size}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />

      {/* Bottom-right bracket */}
      <SvgLine
        x1={size - bracketLength}
        y1={size}
        x2={size}
        y2={size}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />
      <SvgLine
        x1={size}
        y1={size - cornerRadius}
        x2={size}
        y2={size}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        strokeLinecap="round"
        opacity={bracketsOpacity}
      />

      {/* Rounded square border */}
      <AnimatedSvgRect
        x={bracketThickness / 2}
        y={bracketThickness / 2}
        width={size - bracketThickness}
        height={size - bracketThickness}
        rx={borderRadius}
        ry={borderRadius}
        stroke={borderColor}
        strokeWidth={bracketThickness}
        fill="none"
      />
    </Svg>
  )
}
