import React, { useState, useRef, useEffect } from "react"
import { View, Text, TextInput, TextInputProps, StyleSheet } from "react-native"
import { MaskedTextInput } from "react-native-mask-text"

import { RedAlert } from "@/assets/images/icons/RedAlert"

interface FormTextInputProps {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  placeholderTextColor?: string
  maxLength?: number
  keyboardType?: TextInputProps["keyboardType"]
  autoCapitalize?: TextInputProps["autoCapitalize"]
  error?: string
  rightBadge?: string
  dateFormat?: boolean
}

export const FormTextInput: React.FC<FormTextInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor = "rgba(251, 251, 251, 0.35)",
  maxLength,
  keyboardType = "default",
  autoCapitalize = "none",
  error,
  rightBadge,
  dateFormat = false,
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // Local state for the input value to prevent parent re-renders from causing flicker
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Handler for MaskedTextInput (date format) - receives both masked and unmasked text
  const handleMaskedChangeText = (_text: string, rawText: string) => {
    // Use rawText (unmasked value) and limit to 8 digits (DDMMYYYY)
    const limited = rawText.substring(0, 8)
    setLocalValue(limited)
    onChangeText(limited)
  }

  // Handler for regular TextInput - update local state immediately, parent state after transform
  const handleRegularChangeText = (text: string) => {
    let transformedText = text
    if (autoCapitalize === "characters") {
      // For document numbers, only allow alphanumeric
      transformedText = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }

    // Update local state immediately for smooth typing
    setLocalValue(transformedText)
    // Update parent state
    onChangeText(transformedText)
  }

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    // Ensure parent value is synced on blur
    if (localValue !== value) {
      onChangeText(localValue)
    }
  }

  const commonInputProps = {
    ref: inputRef,
    style: [styles.textInput, error ? styles.textInputError : null],
    value: localValue,
    onFocus: handleFocus,
    onBlur: handleBlur,
    placeholder: placeholder,
    placeholderTextColor: placeholderTextColor,
    maxLength: dateFormat ? undefined : maxLength,
    keyboardType: keyboardType,
    autoCapitalize: autoCapitalize,
  }

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          error ? styles.inputWrapperError : isFocused && styles.inputWrapperFocused,
        ]}
      >
        {dateFormat ? (
          <MaskedTextInput
            {...commonInputProps}
            mask="99/99/9999"
            keyboardType="numeric"
            onChangeText={handleMaskedChangeText}
            placeholder=" - -  /  - -  /  - - - -"
          />
        ) : (
          <TextInput {...commonInputProps} onChangeText={handleRegularChangeText} />
        )}
        {rightBadge && <Text style={styles.dateHelper}>{rightBadge}</Text>}
      </View>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <RedAlert />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  inputGroup: {
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 4,
    paddingVertical: 4,
    lineHeight: 20,
  },
  inputWrapper: {
    alignSelf: "stretch",
    backgroundColor: "rgba(251, 251, 251, 0.05)",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(251, 251, 251, 0.2)",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputWrapperFocused: {
    borderColor: "#F6D38F",
    borderWidth: 2,
  },
  inputWrapperError: {
    borderColor: "#E6657E",
    borderWidth: 2,
  },
  textInput: {
    color: "#FBFBFB",
    fontSize: 14,
    // fontFamily: "Inter",
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontWeight: "400",
    flex: 1,
  },
  textInputError: {
    borderColor: "#FF3B3B",
    backgroundColor: "rgba(255, 59, 59, 0.1)",
  },
  errorText: {
    color: "#E6657E",
    fontSize: 13,
    // fontFamily: "Metropolis",
    fontWeight: "500",
  },
  dateHelper: {
    backgroundColor: "rgba(251, 251, 251, 0.1)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    marginRight: 16,
    color: "#E7E7E7",
    fontSize: 12,
    fontWeight: "400",
    // fontFamily: "Inter",
    lineHeight: 16,
  },
})
