import {
  TouchableOpacity,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"

interface PrimaryButtonProps {
  text: string
  onPress?: () => void
  icon?: React.ReactNode
  primary?: boolean
  borderless?: boolean
  bold?: boolean
  halfWidth?: boolean
  disabled?: boolean
  loading?: boolean
  iconPosition?: "left" | "right"
  style?: StyleProp<ViewStyle>
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  style,
  text,
  onPress,
  icon,
  primary,
  borderless,
  bold,
  halfWidth,
  disabled = false,
  loading = false,
  iconPosition = "left",
}: PrimaryButtonProps) => {
  const colors = primary ? ["#F2DCB0", "#F6D38F"] : ["#F2DCB00A", "#F6D38F0A"]
  const buttonStyle = [
    styles.button,
    !primary && !borderless && styles.nonPrimaryButton,
    halfWidth && styles.halfWidthButton,
    disabled && styles.disabledButton,
  ].filter(Boolean)
  const buttonTextStyle = primary
    ? [styles.buttonText, bold && styles.boldText, halfWidth && styles.smallerText]
    : [
        styles.buttonText,
        styles.nonPrimaryButtonText,
        bold && styles.boldText,
        halfWidth && styles.smallerText,
      ]

  return (
    <TouchableOpacity
      style={[
        styles.buttonWrapper,
        borderless && styles.borderlessButtonWrapper,
        halfWidth && styles.halfWidthWrapper,
        disabled && styles.disabledWrapper,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {borderless ? (
        <View style={buttonStyle}>
          <View style={styles.buttonContent}>
            {loading && (
              <ActivityIndicator
                size="small"
                color={primary ? "#000000" : "#F3D7A1"}
                style={styles.spinner}
              />
            )}
            {!loading && icon}
            <Text style={buttonTextStyle}>{text}</Text>
          </View>
        </View>
      ) : (
        <LinearGradient
          colors={colors as [string, string]}
          start={[0.5, 0]}
          end={[0.5, 1]}
          style={buttonStyle}
        >
          <View
            style={[
              styles.buttonContent,
              iconPosition === "right" && styles.buttonContentIconRight,
            ]}
          >
            {loading && (
              <ActivityIndicator
                size="small"
                color={primary ? "#000000" : "#F3D7A1"}
                style={styles.spinner}
              />
            )}
            {!loading && icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text style={buttonTextStyle}>{text}</Text>
          </View>
        </LinearGradient>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  buttonWrapper: {
    elevation: 5,
    alignSelf: "stretch",
  },
  borderlessButtonWrapper: {
    marginRight: 0,
    marginLeft: 0,
    elevation: 0,
  },
  halfWidthWrapper: {
    flex: 1,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 9999,
    alignItems: "center",
  },
  halfWidthButton: {
    paddingHorizontal: 12,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 18,
    color: "#000000",
    // fontFamily: "Inter",
    fontWeight: "600",
  },
  smallerText: {
    fontSize: 14,
  },
  boldText: {
    fontWeight: "600",
  },
  nonPrimaryButton: {
    borderWidth: 1,
    borderColor: "#88838B",
  },
  nonPrimaryButtonText: {
    color: "#F3D7A1",
    // fontFamily: "Inter",
    fontWeight: "600",
    paddingLeft: 10,
    fontSize: 18,
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledWrapper: {
    opacity: 0.6,
  },
  iconContainer: {
    marginRight: 10,
  },
  buttonContentIconRight: {
    flexDirection: "row-reverse",
  },
  spinner: {
    marginRight: 8,
  },
})
