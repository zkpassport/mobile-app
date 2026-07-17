import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { PrepareIDView } from "@/components/ScanPassport/PrepareID"
import { DocumentType } from "@/types/DocumentInfo"
import { t } from "i18next"

// Mock lottie-react-native
jest.mock("lottie-react-native", () => {
  const React = require("react")
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", props),
  }
})

// Mock lucide-react-native
jest.mock("lucide-react-native", () => ({
  ChevronRightIcon: "ChevronRightIcon",
  ChevronRight: "ChevronRight",
  ChevronLeft: "ChevronLeft",
}))

// Mock images
jest.mock("@/assets/images/Passport/JohnDoe.png", () => "passport-image")
jest.mock("@/assets/images/IDCard/JohnDoe.png", () => "idcard-image")
jest.mock("@/assets/images/PartialHand.png", () => "partial-hand-image")
jest.mock("@/assets/images/FullHand.png", () => "full-hand-image")

describe("PrepareIDView", () => {
  const mockOnBack = jest.fn()
  const mockOnScan = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Rendering", () => {
    it("renders the back button", () => {
      const { getByText } = render(
        <PrepareIDView
          onBack={mockOnBack}
          onScan={mockOnScan}
          documentType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.back"))).toBeTruthy()
    })

    it("renders the title", () => {
      const { getByText } = render(
        <PrepareIDView
          onBack={mockOnBack}
          onScan={mockOnScan}
          documentType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.prepareID.title"))).toBeTruthy()
    })

    it("renders the start scan button", () => {
      const { getByText } = render(
        <PrepareIDView
          onBack={mockOnBack}
          onScan={mockOnScan}
          documentType={DocumentType.PASSPORT}
        />,
      )

      expect(getByText(t("scanning.prepareID.startScan"))).toBeTruthy()
    })
  })

  describe("Interactions", () => {
    it("calls onBack when back button is pressed", () => {
      const { getByText } = render(
        <PrepareIDView
          onBack={mockOnBack}
          onScan={mockOnScan}
          documentType={DocumentType.PASSPORT}
        />,
      )

      const backButton = getByText(t("scanning.back"))
      fireEvent.press(backButton)

      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })

    it("calls onScan when start scan button is pressed", () => {
      const { getByText } = render(
        <PrepareIDView
          onBack={mockOnBack}
          onScan={mockOnScan}
          documentType={DocumentType.PASSPORT}
        />,
      )

      const scanButton = getByText(t("scanning.prepareID.startScan"))
      fireEvent.press(scanButton)

      expect(mockOnScan).toHaveBeenCalledTimes(1)
    })
  })
})
