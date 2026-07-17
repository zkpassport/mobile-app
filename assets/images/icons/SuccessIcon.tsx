import Svg, { Defs, Stop, LinearGradient, Path } from "react-native-svg"

export const SuccessIcon = ({ width = 19, height = 18 }) => (
  <Svg width={width} height={height} viewBox="0 0 19 18" fill="none">
    <Path
      d="M16.252 0.667969C16.7115 -0.0211935 17.6428 -0.20754 18.332 0.251953C19.0212 0.711464 19.2074 1.64278 18.748 2.33203L8.74805 17.332C8.49877 17.7059 8.09466 17.9489 7.64746 17.9932C7.20034 18.0374 6.75717 17.8782 6.43945 17.5605L0.439453 11.5605C-0.146333 10.9748 -0.146333 10.0252 0.439453 9.43945C1.02525 8.85381 1.97481 8.85371 2.56055 9.43945L7.2666 14.1455L16.252 0.667969Z"
      fill="url(#paint0_linear_1980_1593)"
    />
    <Defs>
      <LinearGradient
        id="paint0_linear_1980_1593"
        x1="9.5"
        y1="0"
        x2="9.5"
        y2="18.0005"
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#F2DCB0" />
        <Stop offset="1" stopColor="#F6D38F" />
      </LinearGradient>
    </Defs>
  </Svg>
)
