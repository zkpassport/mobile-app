import Svg, { Rect } from "react-native-svg"

export const NewId = ({ width = 335, height = 206, color = "black" }) => (
  <Svg width={width} height={height} viewBox="0 0 335 206" fill="none">
    <Rect x="0.5" y="0.5" width="334" height="205" rx="7.5" stroke="#2139A3" strokeDasharray="30" />
  </Svg>
)
