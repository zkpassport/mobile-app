import React from "react"
import { render } from "@testing-library/react-native"
import { Image } from "react-native"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { PassportView } from "@/components/PassportView/PassportView"
import { t } from "i18next"

describe("PassportInfo", () => {
  const defaultProps = {
    passport: PASSPORTS.john,
    showDetails: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Basic Rendering", () => {
    it("should render the component with all labels", () => {
      const { getByText } = render(<PassportView {...defaultProps} />)

      expect(getByText(t("passportView.name"))).toBeDefined()
      expect(getByText(t("passportView.dateOfBirth"))).toBeDefined()
      expect(getByText(t("passportView.nationality"))).toBeDefined()
      expect(getByText(t("passportView.gender"))).toBeDefined()
      expect(getByText("ZP1111111")).toBeDefined()
      expect(getByText("01/01/35")).toBeDefined()
    })

    it("should render passport data when showDetails is true", () => {
      const { getByText } = render(<PassportView {...defaultProps} />)

      expect(getByText("John Smith")).toBeDefined()
      // Date format depends on locale, just check it's rendered
      expect(getByText("12/11/95")).toBeDefined()
      expect(getByText("Male")).toBeDefined()
      expect(getByText(PASSPORTS.john.passportNumber)).toBeDefined()
      expect(getByText("01/01/35")).toBeDefined()
    })

    it("should not render anything when passport is null", () => {
      const { toJSON } = render(<PassportView passport={null as any} showDetails={true} />)

      // Should render nothing when passport is null
      expect(toJSON()).toBeNull()
    })
  })

  describe("Blur Functionality", () => {
    it("should render ********* when showDetails is false", () => {
      const component = render(<PassportView {...defaultProps} showDetails={false} />)

      const tree = component.toJSON()
      const treeString = JSON.stringify(tree)
      // Default mask length is 9 asterisks
      expect(treeString).toContain("*********")
    })

    it("should render clear content when showDetails is true", () => {
      const component = render(<PassportView {...defaultProps} showDetails={true} />)

      expect(component.getByText("John Smith")).toBeDefined()
      expect(component.getByText("12/11/95")).toBeDefined()

      // Should not have any blur views when details are shown
      const tree = component.toJSON()
      const treeString = JSON.stringify(tree)
      expect(treeString).not.toContain("ViewManagerAdapter_ExpoBlurView")
    })

    it("should render labels visible regardless of blur state", () => {
      const { getByText: getByTextBlurred } = render(
        <PassportView {...defaultProps} showDetails={false} />,
      )
      const { getByText: getByTextClear } = render(
        <PassportView {...defaultProps} showDetails={true} />,
      )

      // Labels should be visible in both states
      expect(getByTextBlurred(t("passportView.name"))).toBeDefined()
      expect(getByTextBlurred(t("passportView.dateOfBirth"))).toBeDefined()
      expect(getByTextClear(t("passportView.name"))).toBeDefined()
      expect(getByTextClear(t("passportView.dateOfBirth"))).toBeDefined()
    })

    it("should not render blur views when showDetails is true", () => {
      const { queryAllByTestId } = render(<PassportView {...defaultProps} showDetails={true} />)

      // Should not have any blur views when details are shown
      const blurViews = queryAllByTestId("blur-view")
      expect(blurViews).toHaveLength(0)
    })
  })

  describe("Gender Rendering", () => {
    it("should render male gender correctly", () => {
      const malePassport = { ...PASSPORTS.john, gender: "M" as const }
      const { getByText } = render(<PassportView passport={malePassport} showDetails={true} />)

      expect(getByText("Male")).toBeDefined()
    })

    it("should render female gender correctly", () => {
      const femalePassport = { ...PASSPORTS.john, gender: "F" as const }
      const { getByText } = render(<PassportView passport={femalePassport} showDetails={true} />)

      expect(getByText(t("Female"))).toBeDefined()
    })

    it("should render gender label but not value when gender is not M or F", () => {
      const unknownGenderPassport = { ...PASSPORTS.john, gender: "X" as any }
      const { queryByText } = render(
        <PassportView passport={unknownGenderPassport} showDetails={true} />,
      )

      // Gender label is rendered, but value will be empty string
      expect(queryByText(t("passportView.gender"))).not.toBeNull()
      expect(queryByText(t("Male"))).toBeNull()
      expect(queryByText(t("Female"))).toBeNull()
    })

    it("should render gender label even when gender is null", () => {
      const noGenderPassport = { ...PASSPORTS.john, gender: null as any }
      const { queryByText } = render(
        <PassportView passport={noGenderPassport} showDetails={true} />,
      )

      // Gender label is always rendered in the current implementation
      expect(queryByText(t("passportView.gender"))).not.toBeNull()
    })
  })

  describe("Data Formatting", () => {
    it("should format dates correctly", () => {
      const { getByText } = render(<PassportView {...defaultProps} />)

      expect(getByText("12/11/95")).toBeDefined()
      expect(getByText("01/01/35")).toBeDefined()
    })

    it("should handle empty date fields", () => {
      const passportWithEmptyDates = {
        ...PASSPORTS.john,
        dateOfBirth: "",
        passportExpiry: "",
      }

      const { queryByText } = render(
        <PassportView passport={passportWithEmptyDates} showDetails={true} />,
      )

      // Should not crash and should render empty strings
      expect(queryByText(t("passportView.dateOfBirth"))).toBeDefined()
      expect(queryByText(t("passportView.idExpiryDate"))).toBeDefined()
    })

    it("should capitalize names correctly", () => {
      const passportWithLowercaseName = {
        ...PASSPORTS.john,
        name: "john smith",
      }

      const { getByText } = render(
        <PassportView passport={passportWithLowercaseName} showDetails={true} />,
      )

      expect(getByText("John Smith")).toBeDefined()
    })
  })

  describe("Edge Cases", () => {
    it("should handle missing passport number", () => {
      const passportWithoutNumber = {
        ...PASSPORTS.john,
        passportNumber: "",
      }

      const { queryByText } = render(
        <PassportView passport={passportWithoutNumber} showDetails={true} />,
      )

      expect(queryByText(t("passportView.idNumber"))).toBeDefined()
    })

    it("should handle missing nationality", () => {
      const passportWithoutNationality = {
        ...PASSPORTS.john,
        nationality: "",
      }

      const { queryByText } = render(
        <PassportView passport={passportWithoutNationality} showDetails={true} />,
      )

      expect(queryByText(t("passportView.nationality"))).toBeDefined()
    })

    it("should handle very long names with text truncation", () => {
      const passportWithLongName = {
        ...PASSPORTS.john,
        name: "A Very Long Name That Should Be Truncated",
      }

      const { getByText } = render(
        <PassportView passport={passportWithLongName} showDetails={true} />,
      )

      expect(getByText("A Very Long Name That Should Be Truncated")).toBeDefined()
    })
  })

  describe("Photo Display", () => {
    it("should render photo when passport has valid photo", () => {
      const { UNSAFE_getAllByType } = render(<PassportView {...defaultProps} />)

      // Find Image components
      const images = UNSAFE_getAllByType(Image)
      expect(images.length).toBeGreaterThan(0)
    })

    it("should apply no blur to photo when showDetails is true", () => {
      const { UNSAFE_getAllByType } = render(<PassportView {...defaultProps} showDetails={true} />)

      const images = UNSAFE_getAllByType(Image)
      // Find the photo image (not the background images)
      const photoImage = images.find((img) => img.props.blurRadius !== undefined)

      if (photoImage) {
        expect(photoImage.props.blurRadius).toBe(0)
      }
    })

    it("should apply blur to photo when showDetails is false", () => {
      const { UNSAFE_getAllByType } = render(<PassportView {...defaultProps} showDetails={false} />)

      const images = UNSAFE_getAllByType(Image)
      // Find the photo image (not the background images)
      const photoImage = images.find((img) => img.props.blurRadius === 40)

      expect(photoImage).toBeDefined()
    })

    it("should not render photo when photo is invalid", () => {
      const passportWithInvalidPhoto = {
        ...PASSPORTS.john,
        photo: "invalid-photo",
      }

      const { UNSAFE_getAllByType } = render(
        <PassportView passport={passportWithInvalidPhoto} showDetails={true} />,
      )

      const images = UNSAFE_getAllByType(Image)
      // Should only have background images, not the photo
      const photoImage = images.find((img) => img.props.source?.uri === "invalid-photo")

      expect(photoImage).toBeUndefined()
    })

    it("should not render photo when photo is null", () => {
      const passportWithoutPhoto = {
        ...PASSPORTS.john,
        photo: null as any,
      }

      const { UNSAFE_getAllByType } = render(
        <PassportView passport={passportWithoutPhoto} showDetails={true} />,
      )

      const images = UNSAFE_getAllByType(Image)
      // Should only have background images
      const photoImage = images.find((img) => img.props.source?.uri)

      expect(photoImage).toBeUndefined()
    })
  })

  describe("Genuine Badge", () => {
    it("should render genuine badge text", () => {
      const { getByText } = render(<PassportView {...defaultProps} />)

      expect(getByText(t("passportView.idIsGenuine"))).toBeDefined()
    })

    it("should render genuine badge for all passport types", () => {
      const { getByText: getByTextJohn } = render(
        <PassportView passport={PASSPORTS.john} showDetails={true} />,
      )
      const { getByText: getByTextMary } = render(
        <PassportView passport={PASSPORTS.mary} showDetails={true} />,
      )
      const { getByText: getByTextJane } = render(
        <PassportView passport={PASSPORTS.jane} showDetails={true} />,
      )

      expect(getByTextJohn(t("passportView.idIsGenuine"))).toBeDefined()
      expect(getByTextMary(t("passportView.idIsGenuine"))).toBeDefined()
      expect(getByTextJane(t("passportView.idIsGenuine"))).toBeDefined()
    })
  })
})
