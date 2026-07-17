import { Svg, Path } from "react-native-svg"

export const CopyIcon = ({ width = 18, height = 18, color = "#030303" }) => (
  <Svg width={width} height={height} viewBox="0 0 18 18" fill="none">
    <Path
      d="M15 4.5C16.6569 4.5 18 5.84315 18 7.5V15C18 16.6569 16.6569 18 15 18H7.5C5.84315 18 4.5 16.6569 4.5 15V7.5C4.5 5.84315 5.84315 4.5 7.5 4.5H15ZM10.5 0C12.1569 0 13.5 1.34315 13.5 3H7.5C5.01472 3 3 5.01472 3 7.5V13.5C1.34315 13.5 0 12.1569 0 10.5V3C0 1.34315 1.34315 0 3 0H10.5Z"
      fill={color}
    />
  </Svg>
)
