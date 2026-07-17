import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import OptionsPage from "@/components/settings/options"
import { useError } from "@/context/ErrorContext"
import { useSettings } from "@/context/SettingsContext"
import { useRouter } from "expo-router"
import { t } from "i18next"

// Mock icons
jest.mock("@/assets/images/icons/Trash", () => ({
  Trash: () => "Trash",
}))

jest.mock("@/assets/images/icons/Wrench", () => ({
  Wrench: () => "Wrench",
}))

jest.mock("@/assets/images/icons/Question", () => ({
  Question: () => "Question",
}))

// Mock services
jest.mock("@/services/facematch/facematch", () => ({
  FaceMatchService: jest.fn().mockImplementation(() => ({
    removeKeyId: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock("@/services/BridgeRequest", () => ({
  BridgeRequestStorage: jest.fn().mockImplementation(() => ({
    clear: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock("@/lib/circuit-matcher", () => ({
  clearCachedCircuitManifest: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("../../../modules/app-attest-module", () => ({
  __esModule: true,
  default: {},
}))

// Mock the StorageService that modals and other components depend on
jest.mock("@/services/StorageService", () => ({
  DiskStorageService: jest.fn().mockImplementation(() => ({
    clear: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  })),
}))

// Mock EventPage that DeleteIDModal uses
jest.mock("@/components/Info/EventPage", () => {
  const { View, Text } = require("react-native")
  return {
    __esModule: true,
    default: ({ stepType, _onContinue }: any) => (
      <View>
        <Text>Event Page: {stepType}</Text>
      </View>
    ),
    EventPageType: {
      DELETE_ID: "DELETE_ID",
      DELETE_WRONG: "DELETE_WRONG",
    },
  }
})

// Mock IDCardPreview
jest.mock("@/components/ui/Cards", () => {
  const { View, Text, Switch } = require("react-native")
  return {
    __esModule: true,
    IDCardPreview: ({ passport }: any) => (
      <View>
        <Text>
          {passport.firstName} {passport.lastName}
        </Text>
      </View>
    ),
    ToggleCard: ({ title, description, value, onChange }: any) => (
      <View>
        <Text>{title}</Text>
        <Text>{description}</Text>
        <Switch value={value} onValueChange={onChange} />
      </View>
    ),
  }
})

// Mock expo-blur
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => children,
}))

// Mock expo-linear-gradient
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}))

// Mock hooks
jest.mock("@/hooks/useModalSwipeDown", () => ({
  useModalSwipeDown: () => ({
    panResponder: { panHandlers: {} },
    translateY: 0,
  }),
}))

// Mock all modals from index.tsx
jest.mock("@/components/Modals/ErrorReporting", () => ({
  ErrorOverlay: () => null,
}))

jest.mock("@/components/Modals/DevMode", () => ({
  DevModeModal: () => null,
}))

jest.mock("@/components/Modals/HistoryFilterModal", () => ({
  HistoryFilterModal: () => null,
}))

jest.mock("@/components/Modals/CheckPassportModal", () => ({
  CheckPassportModal: () => null,
}))

// Mock contexts
jest.mock("@/context/ErrorContext", () => ({
  useError: jest.fn(),
}))

jest.mock("@/context/SettingsContext", () => ({
  useSettings: jest.fn(),
}))

describe("OptionsPage", () => {
  const mockOnBack = jest.fn()
  const mockOnDeleteComplete = jest.fn()
  const mockSetErrorReportingConsent = jest.fn()
  const mockClearBaseProofs = jest.fn()
  const mockGetPassportIdFromNumber = jest.fn(() => "passport-id-123")
  const mockRouterPush = jest.fn()
  const mockRouterBack = jest.fn()
  const mockRouterReplace = jest.fn()
  const mockRouterCanGoBack = jest.fn(() => true)

  const mockPassport = {
    passportNumber: "AB1234567",
    firstName: "John",
    lastName: "Doe",
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useError as jest.Mock).mockReturnValue({
      hasErrorReportingConsent: false,
      setErrorReportingConsent: mockSetErrorReportingConsent,
    })
    ;(useSettings as jest.Mock).mockReturnValue({
      getPassportIdFromNumber: mockGetPassportIdFromNumber,
      clearBaseProofs: mockClearBaseProofs,
      settings: {
        passports: [{ id: "passport-id-123" }],
      },
    })
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockRouterPush,
      back: mockRouterBack,
      replace: mockRouterReplace,
      canGoBack: mockRouterCanGoBack,
    })
  })

  describe("Rendering", () => {
    it("renders the title", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      expect(getByText(t("settings.options.title"))).toBeTruthy()
    })

    it("renders the back button", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      expect(getByText(t("settings.options.back"))).toBeTruthy()
    })

    it("renders all option items", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      expect(getByText(t("settings.options.deleteID"))).toBeTruthy()
      expect(getByText(t("settings.options.technicalInfo"))).toBeTruthy()
      expect(getByText(t("settings.options.help"))).toBeTruthy()
    })
  })

  describe("Interactions - Back button", () => {
    it("calls onBack when back button is pressed", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      const backButton = getByText(t("settings.options.back"))
      fireEvent.press(backButton)

      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })
  })

  describe("Interactions - Delete ID", () => {
    it("shows delete modal when Delete ID option is pressed", () => {
      const { getByText, getAllByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      const deleteOption = getAllByText(t("settings.options.deleteID"))[0]
      fireEvent.press(deleteOption)

      expect(getByText(t("modals.deleteID.title"))).toBeTruthy()
    })
  })

  describe("Interactions - Technical Info", () => {
    it("navigates to technical info page when option is pressed", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      const technicalInfoOption = getByText(t("settings.options.technicalInfo"))
      fireEvent.press(technicalInfoOption)

      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: "/(options)/technical-info",
        params: { passportId: "mock-passport-unique-id" },
      })
    })
  })

  describe("Interactions - What's Next", () => {
    it("navigates to what's next page when option is pressed", () => {
      const { getByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      const whatsNextOption = getByText(t("settings.options.help"))
      fireEvent.press(whatsNextOption)

      expect(mockRouterPush).toHaveBeenCalledWith("/(options)/whats-next")
    })
  })

  describe("Complete workflows", () => {
    it("allows opening delete modal", () => {
      const { getByText, getAllByText } = render(
        <OptionsPage
          passport={mockPassport}
          onBack={mockOnBack}
          onDeleteComplete={mockOnDeleteComplete}
        />,
      )

      const deleteOption = getAllByText(t("settings.options.deleteID"))[0]
      fireEvent.press(deleteOption)
      expect(getByText(t("modals.deleteID.title"))).toBeTruthy()
      expect(getByText(t("modals.deleteID.deleteButton"))).toBeTruthy()
    })
  })
})
