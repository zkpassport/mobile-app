import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg"

export const FlipIcon = ({ width = 24, height = 24, color = "#F4D69B" }) => (
  <Svg width={width} height={height} viewBox="0 0 41 22" fill="none">
    <Defs>
      <LinearGradient
        id="paint0_linear_29_24129"
        x1="20.8542"
        y1="19.1875"
        x2="20.8542"
        y2="3.8125"
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#F2DCB0" />
        <Stop offset="1" stopColor="#F6D38F" />
      </LinearGradient>
    </Defs>
    <Path
      d="M20.8542 7.22917C11.4191 7.22917 3.77087 11.0533 3.77087 15.7708C3.77087 16.9855 4.27825 18.1411 5.19221 19.1875M20.8542 7.22917L17.4375 10.6458M20.8542 7.22917L17.4375 3.8125M27.6875 7.93983C33.7214 9.25781 37.9375 12.2687 37.9375 15.7708C37.9375 16.9855 37.4302 18.1411 36.5162 19.1875"
      stroke="url(#paint0_linear_29_24129)"
      strokeWidth="1.70833"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)
