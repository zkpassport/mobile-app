import * as Flags from "react-native-svg-circle-country-flags"

// This Library exports the flag names as Pascal Case, our country codes are in upper case
// So this is needed to convert
const getFlagComponentName = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return ""
  const upper = countryCode.toUpperCase()
  return upper[0] + upper[1].toLowerCase()
}

// Helper component to render the circular flag
export const CircularFlag = ({
  countryCode,
  size = 40,
}: {
  countryCode: string
  size?: number
}) => {
  const componentName = getFlagComponentName(countryCode)
  if (!componentName) return null

  // @ts-ignore - Dynamic component access
  const FlagComponent = Flags[componentName]
  if (!FlagComponent) return null

  return <FlagComponent width={size} height={size} />
}
