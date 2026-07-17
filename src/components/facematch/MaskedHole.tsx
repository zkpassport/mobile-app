import Svg from "react-native-svg"
import { StyleSheet } from "react-native"
import { Mask as SvgMask, Rect as SvgRect, Circle as SvgCircle } from "react-native-svg"

export const MaskedHole: React.FC<{
  size: number
  holeRadius: number
  backgroundColor: string
}> = ({ size, holeRadius, backgroundColor }) => {
  const cx = size / 2
  const cy = size / 2
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <SvgMask id="hole">
        <SvgRect width={size} height={size} fill="white" />
        <SvgCircle cx={cx} cy={cy} r={holeRadius} fill="black" />
      </SvgMask>
      <SvgRect width={size} height={size} fill={backgroundColor} mask="url(#hole)" />
    </Svg>
  )
}
