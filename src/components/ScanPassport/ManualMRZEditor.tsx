import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Text,
  Keyboard,
  StyleSheet,
} from "react-native"
import { ModalWrapper } from "../Modals/ModalWrapper"
import { DocumentType } from "@/types/DocumentInfo"
import { PrimaryButton } from "@/components/ui/Buttons"
import { FormTextInput } from "@/components/ui/Inputs/FormTextInput"
import { Close } from "@/assets/images/icons/Close"
import * as z from "zod"

type InitialMrzData = {
  documentNumber: string | null
  dateOfBirth: string | null
  dateOfExpiry: string | null
}

interface ManualMRZEditorProps {
  visible: boolean
  onClose: () => void
  onConfirm: (
    documentNumber: string,
    dateOfBirth: string,
    dateOfExpiry: string,
    documentType: DocumentType,
  ) => Promise<void>
  documentType: DocumentType
  initialMrz?: InitialMrzData
  confirmationMode?: boolean // If true, shows "Are your details correct?" instead of "Manual MRZ Entry"
}

// Validation schema
const createValidationSchema = (t: any) =>
  z.object({
    documentNumber: z
      .string()
      .min(1, t("scanning.errors.fieldRequired"))
      .min(2, t("scanning.errors.documentNumberLength"))
      .max(24, t("scanning.errors.documentNumberLength"))
      .regex(/^[A-Za-z0-9]+$/, t("scanning.errors.alphanumericOnly")),
    dateOfBirth: z
      .string()
      .length(8, t("scanning.errors.fieldRequired"))
      .regex(/^\d+$/, t("scanning.errors.numbersOnly"))
      .refine(
        (val) => {
          // Parse DDMMYYYY format
          const day = parseInt(val.substring(0, 2))
          const month = parseInt(val.substring(2, 4))
          const year = parseInt(val.substring(4, 8))
          const date = new Date(year, month - 1, day)
          return date <= new Date()
        },
        { message: t("scanning.errors.dobFuture") },
      ),
    dateOfExpiry: z
      .string()
      .length(8, t("scanning.errors.fieldRequired"))
      .regex(/^\d+$/, t("scanning.errors.numbersOnly")),
    /* .refine(
        (val) => {
          // Parse DDMMYYYY format
          const day = parseInt(val.substring(0, 2))
          const month = parseInt(val.substring(2, 4))
          const year = parseInt(val.substring(4, 8))
          const date = new Date(year, month - 1, day)
          return date >= new Date()
        },
        { message: t("scanning.errors.expiryPast") },
      ),*/
  })

export const ManualMRZEditor = ({
  visible,
  onClose,
  onConfirm,
  documentType,
  initialMrz,
  confirmationMode = false,
}: ManualMRZEditorProps) => {
  const { t } = useTranslation()
  const [documentNumber, setDocumentNumber] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [dateOfExpiry, setDateOfExpiry] = useState("")
  const [errors, setErrors] = useState({
    documentNumber: "",
    dateOfBirth: "",
    dateOfExpiry: "",
  })

  // Update state when initial values change (e.g., when modal opens with new data)
  useEffect(() => {
    if (visible && initialMrz) {
      setDocumentNumber(initialMrz.documentNumber || "")
      setDateOfBirth(initialMrz.dateOfBirth || "")
      setDateOfExpiry(initialMrz.dateOfExpiry || "")
    } else if (!visible) {
      // Clear fields when modal closes
      setDocumentNumber("")
      setDateOfBirth("")
      setDateOfExpiry("")
      setErrors({ documentNumber: "", dateOfBirth: "", dateOfExpiry: "" })
    }
  }, [visible, initialMrz])

  const handleConfirm = async () => {
    try {
      const schema = createValidationSchema(t)
      const result = schema.safeParse({
        documentNumber,
        dateOfBirth,
        dateOfExpiry,
      })

      if (!result.success) {
        const fieldErrors = {
          documentNumber: "",
          dateOfBirth: "",
          dateOfExpiry: "",
        }
        console.log("result.error", result.error)

        result.error.issues.forEach((error) => {
          const field = error.path[0] as keyof typeof fieldErrors
          if (!fieldErrors[field]) {
            fieldErrors[field] = error.message
          }
        })

        setErrors(fieldErrors)
        return
      }

      // Convert DDMMYYYY to YYMMDD for MRZ format
      const convertToMRZDate = (fullDate: string) => {
        const day = fullDate.substring(0, 2)
        const month = fullDate.substring(2, 4)
        const year = fullDate.substring(6, 8) // Last 2 digits of year
        return `${year}${month}${day}`
      }

      // Clear errors and proceed
      setErrors({ documentNumber: "", dateOfBirth: "", dateOfExpiry: "" })
      await onConfirm(
        documentNumber.toUpperCase(),
        convertToMRZDate(dateOfBirth),
        convertToMRZDate(dateOfExpiry),
        documentType,
      )
    } catch (error) {
      console.error("Validation error:", error)
    }
  }

  const handleClose = () => {
    Keyboard.dismiss()
    setDocumentNumber("")
    setDateOfBirth("")
    setDateOfExpiry("")
    setErrors({ documentNumber: "", dateOfBirth: "", dateOfExpiry: "" })
    onClose()
  }

  return (
    <ModalWrapper
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.manualEditorContainer}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Close />
            </TouchableOpacity>
            <View style={styles.manualEditorHeader}>
              <Text style={styles.manualEditorTitle}>
                {confirmationMode
                  ? t("scanning.areYourDetailsCorrect")
                  : t("scanning.manualMRZEntry")}
              </Text>
              {confirmationMode && (
                <Text style={styles.manualEditorSubtitle}>{t("scanning.editMRZSubtitle")}</Text>
              )}
            </View>

            <View style={styles.formContainer}>
              <FormTextInput
                label={t("scanning.documentNumber")}
                value={documentNumber}
                onChangeText={setDocumentNumber}
                placeholder={documentType === "passport" ? "AB1234567" : "123456789"}
                // The maximum length of an extended document number on an ID card is 24 characters
                maxLength={24}
                autoCapitalize="characters"
                error={errors.documentNumber}
              />

              <FormTextInput
                label={t("scanning.dateOfBirth")}
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                keyboardType="numeric"
                rightBadge="DD/MM/YYYY"
                error={errors.dateOfBirth}
                dateFormat={true}
              />

              <FormTextInput
                label={t("scanning.dateOfExpiry")}
                value={dateOfExpiry}
                onChangeText={setDateOfExpiry}
                keyboardType="numeric"
                rightBadge="DD/MM/YYYY"
                error={errors.dateOfExpiry}
                dateFormat={true}
              />
            </View>

            <View style={styles.manualEditorButtons}>
              <PrimaryButton
                text={confirmationMode ? t("confirmDetails") : t("confirm")}
                onPress={handleConfirm}
                primary
              />
              {!confirmationMode && (
                <PrimaryButton text={t("cancel")} onPress={handleClose} borderless />
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  manualEditorSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: "#E7E7E7",
    textAlign: "center",
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  manualEditorContainer: {
    backgroundColor: "#1F2B65",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
    width: "95%",
    maxWidth: 500,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 8.5,
    right: 8,
    padding: 8,
    zIndex: 10,
  },
  manualEditorHeader: {
    alignItems: "center",
    gap: 16,
    marginBottom: 32,
  },
  manualEditorTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    textAlign: "center",
    lineHeight: 32,
  },
  formContainer: {
    marginBottom: 32,
    gap: 12,
  },
  manualEditorButtons: {
    flexDirection: "column",
    gap: 10,
    alignItems: "stretch",
  },
})
