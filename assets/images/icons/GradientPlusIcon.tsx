import { Svg, Path, LinearGradient, Defs, Stop } from "react-native-svg"

export const GradientPlusIcon = ({ width = 24, height = 24 }) => (
  <Svg width={width} height={height} viewBox="0 0 15 15" fill="none">
    <Path
      d="M7.5 0C8.12132 0 8.625 0.50368 8.625 1.125V6.375H13.875C14.4963 6.375 15 6.87868 15 7.5C15 8.12132 14.4963 8.625 13.875 8.625H8.625V13.875C8.625 14.4963 8.12132 15 7.5 15C6.87868 15 6.375 14.4963 6.375 13.875V8.625H1.125C0.50368 8.625 0 8.12132 0 7.5C0 6.87868 0.50368 6.375 1.125 6.375H6.375V1.125C6.375 0.50368 6.87868 0 7.5 0Z"
      fill="url(#paint0_linear_1216_862)"
    />
    <Defs>
      <LinearGradient
        id="paint0_linear_1216_862"
        x1="7.5"
        y1="0"
        x2="7.5"
        y2="15"
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#F2DCB0" />
        <Stop offset="1" stopColor="#F6D38F" />
      </LinearGradient>
    </Defs>
  </Svg>
)
