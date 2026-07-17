import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { ManualMRZEditor } from "@/components/ScanPassport/ManualMRZEditor"
import { PASSPORTS, ID_CARDS } from "../../fixtures/passports"
import { DocumentType } from "@/types/DocumentInfo"

describe("ManualMRZEditor", () => {
  const john = PASSPORTS.john
  const janeDoe = ID_CARDS.janeDoe
  const mockOnClose = jest.fn()
  const mockOnConfirm = jest.fn().mockResolvedValue(undefined)

  const datePlaceholder = " - -  /  - -  /  - - - -"

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("successful MRZ entry", () => {
    it("should handle valid passport manual entry", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in the form with DDMMYYYY format
      fireEvent.changeText(getByPlaceholderText("AB1234567"), john.passportNumber)
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "12111995") // 12/11/1995
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012035") // 01/01/2035

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(
          john.passportNumber.toUpperCase(),
          "951112", // YYMMDD format
          "350101", // YYMMDD format
          "passport",
        )
      })
    })

    it("should handle valid ID card manual entry", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.ID_CARD}
        />,
      )

      // Fill in the form with DDMMYYYY format
      fireEvent.changeText(getByPlaceholderText("123456789"), janeDoe.documentNumber)
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "01011990") // 01/01/1990
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012030") // 01/01/2030

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(
          janeDoe.documentNumber,
          "900101", // YYMMDD format
          "300101", // YYMMDD format
          "id_card",
        )
      })
    })
  })

  describe("failed MRZ entry", () => {
    it("should handle invalid MRZ data with insufficient length", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in invalid data that won't pass validation
      // Document number is too short (only 1 char)
      fireEvent.changeText(getByPlaceholderText("AB1234567"), "A")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "12111999")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012035")

      // Submit
      fireEvent.press(getByText("confirm"))

      // With real validation, short document numbers should not call onConfirm
      await waitFor(() => {
        expect(mockOnConfirm).not.toHaveBeenCalled()
      })
    })

    it("should handle empty document number", async () => {
      const { getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Leave document number empty, fill in dates
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "12111995")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012035")

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        // With real validation, empty document number should not call onConfirm
        expect(mockOnConfirm).not.toHaveBeenCalled()
      })
    })

    it("should handle invalid date formats", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in form with invalid date (missing digit)
      fireEvent.changeText(getByPlaceholderText("AB1234567"), john.passportNumber)
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "1211995") // Missing one digit
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012035")

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        // With real validation, invalid date format should not call onConfirm
        expect(mockOnConfirm).not.toHaveBeenCalled()
      })
    })

    it("should handle date of birth in the future", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in form with future date of birth
      fireEvent.changeText(getByPlaceholderText("AB1234567"), john.passportNumber)
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "01012099") // Future date
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012035")

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        expect(mockOnConfirm).not.toHaveBeenCalled()
      })
    })

    it("should accept expiry date in the past", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in form with past expiry date
      fireEvent.changeText(getByPlaceholderText("AB1234567"), john.passportNumber)
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "12111995")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012020") // Past date

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalled()
      })
    })
  })

  describe("component integration", () => {
    it("should populate fields from initial MRZ", async () => {
      const initialMrz = {
        documentNumber: "ZP1111111",
        dateOfBirth: "12111995", // DDMMYYYY
        dateOfExpiry: "01012035", // DDMMYYYY
      }

      const { getByPlaceholderText, getAllByPlaceholderText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
          initialMrz={initialMrz}
        />,
      )

      await waitFor(() => {
        expect(getByPlaceholderText("AB1234567").props.value).toBe("ZP1111111")
        expect(getAllByPlaceholderText(datePlaceholder)[0].props.value).toBe("12/11/1995")
        expect(getAllByPlaceholderText(datePlaceholder)[1].props.value).toBe("01/01/2035")
      })
    })

    it("should uppercase document numbers on confirm", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, getByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Enter lowercase document number
      fireEvent.changeText(getByPlaceholderText("AB1234567"), "ab1234567")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "01011990")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012030")

      // Submit
      fireEvent.press(getByText("confirm"))

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(
          "AB1234567", // Should be uppercase
          "900101", // YYMMDD
          "300101", // YYMMDD
          "passport",
        )
      })
    })

    it("should clear fields when modal closes", async () => {
      const { getByPlaceholderText, getAllByPlaceholderText, rerender } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fill in the form
      fireEvent.changeText(getByPlaceholderText("AB1234567"), "AB1234567")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[0], "01011990")
      fireEvent.changeText(getAllByPlaceholderText(datePlaceholder)[1], "01012030")

      // Close the modal
      rerender(
        <ManualMRZEditor
          visible={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Reopen the modal
      rerender(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
        />,
      )

      // Fields should be cleared
      await waitFor(() => {
        expect(getByPlaceholderText("AB1234567").props.value).toBe("")
        expect(getAllByPlaceholderText(datePlaceholder)[0].props.value).toBe("")
        expect(getAllByPlaceholderText(datePlaceholder)[1].props.value).toBe("")
      })
    })

    it("should show confirmation mode UI when confirmationMode is true", () => {
      const { getByText, queryByText } = render(
        <ManualMRZEditor
          visible={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          documentType={DocumentType.PASSPORT}
          confirmationMode={true}
        />,
      )

      expect(getByText("scanning.areYourDetailsCorrect")).toBeDefined()
      expect(getByText("scanning.editMRZSubtitle")).toBeDefined()
      expect(getByText("confirmDetails")).toBeDefined()
      expect(queryByText("cancel")).toBeNull() // Cancel button should not be shown in confirmation mode
    })
  })
})
