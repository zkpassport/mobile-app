import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { AlertModal } from "@/components/Modals/AlertModal"

// Mock the images
jest.mock("@/assets/images/zkpassport-logo.png", () => "zkpassport-logo")

// Mock BlurView
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => children,
}))

describe("AlertModal", () => {
  const mockOnClose = jest.fn()
  const mockOnAccept = jest.fn()
  const mockOnLinkPress = jest.fn()

  const defaultProps = {
    visible: true,
    onClose: mockOnClose,
    onAccept: mockOnAccept,
    icon: require("@/assets/images/zkpassport-logo.png"),
    iconSize: 50,
    title: "Test Title",
    description: "Test Description",
    buttonText: "Accept",
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Basic Rendering", () => {
    it("renders title and description correctly", () => {
      const { getByText } = render(<AlertModal {...defaultProps} />)

      expect(getByText("Test Title")).toBeTruthy()
      expect(getByText("Test Description")).toBeTruthy()
    })

    it("renders primary button with correct text", () => {
      const { getByText } = render(<AlertModal {...defaultProps} />)

      expect(getByText("Accept")).toBeTruthy()
    })

    it("does not render when visible is false", () => {
      const { queryByText } = render(<AlertModal {...defaultProps} visible={false} />)

      expect(queryByText("Test Title")).toBeNull()
    })

    it("renders with custom icon size", () => {
      const { getByText } = render(<AlertModal {...defaultProps} iconSize={100} />)

      expect(getByText("Test Title")).toBeTruthy()
    })
  })

  describe("Secondary Button", () => {
    it("renders secondary button when buttonText2 is provided", () => {
      const { getByText } = render(<AlertModal {...defaultProps} buttonText2="Cancel" />)

      expect(getByText("Accept")).toBeTruthy()
      expect(getByText("Cancel")).toBeTruthy()
    })

    it("does not render secondary button when buttonText2 is not provided", () => {
      const { queryByText, getByText } = render(<AlertModal {...defaultProps} />)

      expect(getByText("Accept")).toBeTruthy()
      // No secondary button should exist
      expect(queryByText("Cancel")).toBeNull()
    })

    it("calls onClose when secondary button is pressed", () => {
      const { getByText } = render(<AlertModal {...defaultProps} buttonText2="Cancel" />)

      fireEvent.press(getByText("Cancel"))

      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(mockOnAccept).not.toHaveBeenCalled()
    })
  })

  describe("Button Interactions", () => {
    it("calls onAccept when primary button is pressed", () => {
      const { getByText } = render(<AlertModal {...defaultProps} />)

      fireEvent.press(getByText("Accept"))

      expect(mockOnAccept).toHaveBeenCalledTimes(1)
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe("Optional Content", () => {
    it("renders disclaimer when provided", () => {
      const { getByText } = render(
        <AlertModal {...defaultProps} disclaimer="This is a disclaimer" />,
      )

      expect(getByText("This is a disclaimer")).toBeTruthy()
    })

    it("does not render disclaimer section when not provided", () => {
      const { queryByText } = render(<AlertModal {...defaultProps} />)

      expect(queryByText("This is a disclaimer")).toBeNull()
    })

    it("renders link when linkText and onLinkPress are provided", () => {
      const { getByText } = render(
        <AlertModal {...defaultProps} linkText="Learn more" onLinkPress={mockOnLinkPress} />,
      )

      expect(getByText("Learn more")).toBeTruthy()
    })

    it("calls onLinkPress when link is pressed", () => {
      const { getByText } = render(
        <AlertModal {...defaultProps} linkText="Learn more" onLinkPress={mockOnLinkPress} />,
      )

      fireEvent.press(getByText("Learn more"))

      expect(mockOnLinkPress).toHaveBeenCalledTimes(1)
    })

    it("does not render link when only linkText is provided", () => {
      const { queryByText } = render(<AlertModal {...defaultProps} linkText="Learn more" />)

      expect(queryByText("Learn more")).toBeNull()
    })

    it("does not render link when only onLinkPress is provided", () => {
      const { queryByText } = render(<AlertModal {...defaultProps} onLinkPress={mockOnLinkPress} />)

      expect(queryByText("Learn more")).toBeNull()
    })
  })
})
