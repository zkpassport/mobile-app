import Svg, { Path } from "react-native-svg"

export const OptionsIcon = ({ width = 24, height = 24, color = "#ffffff" }) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none">
    <Path
      d="M7 13C8.65685 13 10 14.3431 10 16C10 17.6569 8.65685 19 7 19C5.34315 19 4 17.6569 4 16C4 14.3431 5.34315 13 7 13ZM16 13C17.6569 13 19 14.3431 19 16C19 17.6569 17.6569 19 16 19C14.3431 19 13 17.6569 13 16C13 14.3431 14.3431 13 16 13ZM25 13C26.6569 13 28 14.3431 28 16C28 17.6569 26.6569 19 25 19C23.3431 19 22 17.6569 22 16C22 14.3431 23.3431 13 25 13Z"
      fill={color}
    />
  </Svg>
)
