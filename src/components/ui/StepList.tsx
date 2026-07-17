import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"

export interface Step {
  number: string
  title?: string
  description?: string
  text?: string
  completed?: boolean
}

interface StepListProps {
  steps: Step[]
  variant?: "default" | "compact"
  showCheckmarks?: boolean
  connectorHeight?: number
  showLastConnector?: boolean
  textStyle?: {
    fontSize?: number
    fontWeight?: "400" | "500" | "600" | "700"
    lineHeight?: number
  }
}

interface StepItemProps {
  step: Step
  isLast: boolean
  variant: "default" | "compact"
  showCheckmarks?: boolean
  connectorHeight?: number
  showLastConnector?: boolean
  textStyle?: {
    fontSize?: number
    fontWeight?: "400" | "500" | "600" | "700"
    lineHeight?: number
  }
}

const StepItem: React.FC<StepItemProps> = ({
  step,
  isLast,
  variant,
  showCheckmarks,
  connectorHeight,
  showLastConnector,
  textStyle,
}) => {
  const customTextStyle = textStyle
    ? {
        fontSize: textStyle.fontSize,
        fontWeight: textStyle.fontWeight,
        lineHeight: textStyle.lineHeight,
      }
    : {}

  return (
    <View style={styles.stepItem}>
      <View style={styles.stepLeftContainer}>
        {showCheckmarks && step.completed ? (
          <LinearGradient
            colors={["#F2DCB0", "#F6D38F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={variant === "compact" ? styles.stepNumberCompact : styles.stepNumberDefault}
          >
            <Ionicons name="checkmark" size={variant === "compact" ? 14 : 16} color="#142262" />
          </LinearGradient>
        ) : showCheckmarks && !step.completed ? (
          <View
            style={[
              variant === "compact" ? styles.stepNumberCompact : styles.stepNumberDefault,
              styles.checkCircleOutlined,
            ]}
          >
            <Ionicons name="checkmark" size={variant === "compact" ? 14 : 16} color="#F2DCB0" />
          </View>
        ) : (
          <View style={variant === "compact" ? styles.stepNumberCompact : styles.stepNumberDefault}>
            <Text
              style={
                variant === "compact" ? styles.stepNumberTextCompact : styles.stepNumberTextDefault
              }
            >
              {step.number}
            </Text>
          </View>
        )}
        {(!isLast || showLastConnector) && (
          <View
            style={[
              styles.stepConnector,
              connectorHeight ? { height: connectorHeight, flex: 0 } : {},
            ]}
          />
        )}
      </View>
      <View style={styles.stepContent}>
        {variant === "default" && step.title && <Text style={styles.stepTitle}>{step.title}</Text>}
        {step.description && (
          <Text
            style={[
              variant === "compact" ? styles.stepTextCompact : styles.stepDescription,
              customTextStyle,
            ]}
          >
            {step.description}
          </Text>
        )}
        {step.text && <Text style={[styles.stepTextCompact, customTextStyle]}>{step.text}</Text>}
      </View>
    </View>
  )
}

const StepList: React.FC<StepListProps> = ({
  steps,
  variant = "default",
  showCheckmarks,
  connectorHeight,
  showLastConnector,
  textStyle,
}) => {
  return (
    <View style={styles.stepsContainer}>
      {steps.map((step, index) => (
        <StepItem
          key={step.number}
          step={step}
          isLast={index === steps.length - 1}
          variant={variant}
          showCheckmarks={showCheckmarks}
          connectorHeight={connectorHeight}
          showLastConnector={showLastConnector}
          textStyle={textStyle}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  stepsContainer: {
    marginBottom: 32,
  },
  stepItem: {
    flexDirection: "row",
    gap: 16,
  },
  stepLeftContainer: {
    alignItems: "center",
  },
  stepNumberDefault: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F6D38F",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepNumberCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F6D38F",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepConnector: {
    width: 1,
    flex: 1,
    backgroundColor: "#F6D38F",
  },
  stepNumberTextDefault: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    // fontFamily: "Inter",
  },
  stepNumberTextCompact: {
    fontSize: 16,
    fontWeight: "400",
    color: "#142262",
    // fontFamily: "Inter",
    lineHeight: 22,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 16,
  },
  stepDescription: {
    fontSize: 16,
    fontWeight: "400",
    color: "#B8C5E0",
    // fontFamily: "Inter",
    lineHeight: 24,
    marginBottom: 16,
  },
  stepTextCompact: {
    fontSize: 16,
    color: "#E7E7E7",
    lineHeight: 22,
    marginBottom: 16,
    // fontFamily: "Inter",
    fontWeight: "400",
    opacity: 0.9,
  },
  checkCircleOutlined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#F2DCB0",
  },
})

export default StepList
