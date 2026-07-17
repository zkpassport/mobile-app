import Svg, {
  G,
  Path,
  Defs,
  Filter,
  FeFlood,
  FeColorMatrix,
  FeOffset,
  FeGaussianBlur,
  FeComposite,
  FeBlend,
} from "react-native-svg"

export const TabBG = ({ width = 393, height = 167, color = "#FBFBFB" }) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 393 167"
    fill={color}
    preserveAspectRatio="xMidYMid slice"
  >
    <Defs>
      <Filter
        id="filter0_d_55_6265"
        x="-80"
        y="0"
        width="553"
        height="243"
        filterUnits="userSpaceOnUse"
      >
        <FeFlood floodOpacity="0" result="BackgroundImageFix" />
        <FeColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <FeOffset dy="-4" />
        <FeGaussianBlur stdDeviation="40" />
        <FeComposite in2="hardAlpha" operator="out" />
        <FeColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0" />
        <FeBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_55_6265" />
        <FeBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_55_6265" result="shape" />
      </Filter>
    </Defs>
    <G filter="url(#filter0_d_55_6265)">
      <Path
        d="M0 84H102.75H155.205C157.332 84 159.112 85.6546 159.459 87.7536C161.045 97.3446 167.905 122 196.5 122C225.902 122 232.917 97.343 234.534 87.7526C234.888 85.6548 236.668 84 238.795 84H288H393V167H0V84Z"
        fill={color}
      />
    </G>
  </Svg>
)
