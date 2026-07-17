import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { ChooseIDTypeView } from "@/components/ScanPassport/ChooseID"
import { DocumentType } from "@/types/DocumentInfo"
import { t } from "i18next"

// Mock the icons
jest.mock("@/assets/images/icons/PassportIcon", () => ({
  PassportIcon: () => "PassportIcon",
}))

jest.mock("@/assets/images/icons/IDCardIcon", () => ({
  IDCardIcon: () => "IDCardIcon",
}))

jest.mock("@/assets/images/icons/ResidencePermitIcon", () => ({
  ResidencePermitIcon: () => "ResidencePermitIcon",
}))

describe("ChooseIDTypeView", () => {
  const mockOnBack = jest.fn()
  const mockOnSelectIDType = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Rendering", () => {
    it("renders the title", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      expect(getByText(t("scanning.chooseIDType.title"))).toBeTruthy()
    })

    it("renders all three ID type cards", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      expect(getByText(t("scanning.chooseIDType.passport.title"))).toBeTruthy()
      expect(getByText(t("scanning.chooseIDType.idCard.title"))).toBeTruthy()
      expect(getByText(t("scanning.chooseIDType.residencePermit.title"))).toBeTruthy()
    })

    it("renders card descriptions", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      expect(getByText(t("scanning.chooseIDType.passport.description"))).toBeTruthy()
      expect(getByText(t("scanning.chooseIDType.idCard.description"))).toBeTruthy()
      expect(getByText(t("scanning.chooseIDType.residencePermit.description"))).toBeTruthy()
    })

    it("renders the back button", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      expect(getByText(t("scanning.back"))).toBeTruthy()
    })
  })

  describe("Interactions", () => {
    it("calls onBack when back button is pressed", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      const backButton = getByText(t("scanning.back"))
      fireEvent.press(backButton)

      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })

    it("shows modal when passport card is pressed", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      const passportCard = getByText(t("scanning.chooseIDType.passport.title"))
      fireEvent.press(passportCard)

      // Check that modal content is visible
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeTruthy()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeTruthy()
    })

    it("shows modal when ID card is pressed", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      const idCard = getByText(t("scanning.chooseIDType.idCard.title"))
      fireEvent.press(idCard)

      // Check that modal content is visible
      expect(getByText(t("modals.checkPassport.title.idCard"))).toBeTruthy()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeTruthy()
    })

    it("shows modal when residence permit card is pressed", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      const residenceCard = getByText(t("scanning.chooseIDType.residencePermit.title"))
      fireEvent.press(residenceCard)

      // Check that modal content is visible
      expect(getByText(t("modals.checkPassport.title.residencePermit"))).toBeTruthy()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeTruthy()
    })

    it("calls onSelectIDType with correct type when modal is confirmed", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      // Select passport
      const passportCard = getByText(t("scanning.chooseIDType.passport.title"))
      fireEvent.press(passportCard)

      // Confirm in modal
      const yesButton = getByText(t("modals.checkPassport.yesIHaveIt"))
      fireEvent.press(yesButton)

      expect(mockOnSelectIDType).toHaveBeenCalledWith(DocumentType.PASSPORT)
    })

    it("hides modal when declined", () => {
      const { getByText, queryByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      // Select passport
      const passportCard = getByText(t("scanning.chooseIDType.passport.title"))
      fireEvent.press(passportCard)

      expect(getByText(t("modals.checkPassport.title.passport"))).toBeTruthy()

      // Decline in modal
      const noButton = getByText(t("modals.checkPassport.noIDontHaveIt"))
      fireEvent.press(noButton)

      expect(queryByText(t("modals.checkPassport.title.passport"))).toBeNull()
    })

    it("allows selecting different ID types sequentially", () => {
      const { getByText } = render(
        <ChooseIDTypeView onBack={mockOnBack} onSelectIDType={mockOnSelectIDType} />,
      )

      // First selection: Passport
      fireEvent.press(getByText(t("scanning.chooseIDType.passport.title")))
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeTruthy()

      // Decline and try another
      fireEvent.press(getByText(t("modals.checkPassport.noIDontHaveIt")))

      // Second selection: National ID
      fireEvent.press(getByText(t("scanning.chooseIDType.idCard.title")))
      expect(getByText(t("modals.checkPassport.title.idCard"))).toBeTruthy()

      // Confirm this one
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))
      expect(mockOnSelectIDType).toHaveBeenCalledWith(DocumentType.ID_CARD)
    })
  })
})
