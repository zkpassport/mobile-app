import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { GetReadyToScan } from "@/components/ScanPassport/GetReadyToScan"
import { DocumentType } from "@/types/DocumentInfo"
import { t } from "i18next"

jest.mock("@/assets/images/Passport/PassportSkeleton.png", () => ({
  PassportSkeleton: () => "PassportSkeleton",
}))

jest.mock("@/assets/images/IDCard/IDCardSkeleton.png", () => ({
  IDCardSkeleton: () => "IDCardSkeleton",
}))

jest.mock("@/assets/images/icons/FlipIcon", () => ({
  FlipIcon: () => "FlipIcon",
}))

describe("GetReadyToScan", () => {
  const mockOnBack = jest.fn()
  const mockOnStartScan = jest.fn()
  const mockOnManualEntry = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Rendering", () => {
    it("renders the title", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.title"))).toBeTruthy()
    })

    it("renders passport-specific content", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.passport.description"))).toBeTruthy()
    })

    it("renders ID card-specific content", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.ID_CARD}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.idCard.description"))).toBeTruthy()
    })

    it("renders residence permit-specific content", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.RESIDENCE_PERMIT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.residencePermit.description"))).toBeTruthy()
    })

    it("renders back button", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.back"))).toBeTruthy()
    })

    it("renders start scan button", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.startScan"))).toBeTruthy()
    })

    it("renders step list with correct steps", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(
        getByText(
          t("scanning.getReadyToScan.passport.name") + t("scanning.getReadyToScan.steps.nfc"),
        ),
      ).toBeTruthy()
      expect(getByText(t("scanning.getReadyToScan.steps.scan"))).toBeTruthy()
    })

    it("shows flip indicator for ID card", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.ID_CARD}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.flipID"))).toBeTruthy()
    })

    it("shows flip indicator for residence permit", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.RESIDENCE_PERMIT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.flipID"))).toBeTruthy()
    })

    it("does not show flip indicator for passport", () => {
      const { queryByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(queryByText(t("scanning.getReadyToScan.flipID"))).toBeNull()
    })

    it("does not show manual entry button by default", () => {
      const { queryByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(queryByText(t("scanning.getReadyToScan.enterManually"))).toBeNull()
    })

    it("shows manual entry button when showManualEntry is true", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          onManualEntry={mockOnManualEntry}
          showManualEntry={true}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.getReadyToScan.enterManually"))).toBeTruthy()
    })
  })

  describe("Interactions", () => {
    it("calls onBack when back button is pressed", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      const backButton = getByText(t("scanning.back"))
      fireEvent.press(backButton)

      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })

    it("calls onStartScan when start scan button is pressed", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      const startButton = getByText(t("scanning.getReadyToScan.startScan"))
      fireEvent.press(startButton)

      expect(mockOnStartScan).toHaveBeenCalledTimes(1)
    })

    it("calls onManualEntry when manual entry button is pressed", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          onManualEntry={mockOnManualEntry}
          showManualEntry={true}
          idType={DocumentType.PASSPORT}
        />,
      )

      const manualButton = getByText(t("scanning.getReadyToScan.enterManually"))
      fireEvent.press(manualButton)

      expect(mockOnManualEntry).toHaveBeenCalledTimes(1)
    })
  })

  describe("Document Type Variations", () => {
    it("shows correct step text for passport", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.PASSPORT}
        />,
      )

      expect(
        getByText(
          t("scanning.getReadyToScan.passport.name") + t("scanning.getReadyToScan.steps.nfc"),
        ),
      ).toBeTruthy()
    })

    it("shows correct step text for ID card", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.ID_CARD}
        />,
      )

      expect(
        getByText(
          t("scanning.getReadyToScan.idCard.name") + t("scanning.getReadyToScan.steps.nfc"),
        ),
      ).toBeTruthy()
    })

    it("shows correct step text for residence permit", () => {
      const { getByText } = render(
        <GetReadyToScan
          onBack={mockOnBack}
          onStartScan={mockOnStartScan}
          idType={DocumentType.RESIDENCE_PERMIT}
        />,
      )

      expect(
        getByText(
          t("scanning.getReadyToScan.residencePermit.name") +
            t("scanning.getReadyToScan.steps.nfc"),
        ),
      ).toBeTruthy()
    })
  })
})
