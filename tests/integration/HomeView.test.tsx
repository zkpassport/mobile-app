import React from "react"
import { render, waitFor } from "@testing-library/react-native"
import HomeView from "@/app/index"
import { useParseDeepLinkParams } from "@/hooks/useParseDeepLinkParams"
import { useSettings } from "@/context/SettingsContext"
import { useWebSocket } from "@/context/WebSocketContext"
import { useError } from "@/context/ErrorContext"
import { useLocalSearchParams } from "expo-router"
import { checkVersions } from "@/lib"

// Mock dependencies
jest.mock("@/hooks/useParseDeepLinkParams")
jest.mock("@/context/SettingsContext")
jest.mock("@/context/WebSocketContext")
jest.mock("@/context/ErrorContext")
jest.mock("@/context/QRScannerContext", () => ({
  useQRScanner: jest.fn(() => ({
    isScanning: false,
    startScanning: jest.fn(),
    stopScanning: jest.fn(),
    handleScannedCode: jest.fn(),
    isCodeScanHandled: jest.fn(() => false),
    setCodeScanHandled: jest.fn(),
  })),
  QRScannerProvider: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
    dismissAll: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  SplashScreen: {
    hideAsync: jest.fn(),
  },
}))
jest.mock("expo-font", () => ({
  useFonts: jest.fn(() => [true]),
}))
jest.mock("@/lib/noir", () => ({
  prepareSrs: jest.fn(),
}))
jest.mock("@/lib", () => {
  const actual = jest.requireActual("@/lib")
  return {
    ...actual,
    checkVersions: jest.fn(),
  }
})
jest.mock("@/lib/navigationState", () => ({
  getCurrentDeepLinkTopic: jest.fn().mockReturnValue(null),
  setCurrentDeepLinkTopic: jest.fn(),
  isAccessRequestVisible: jest.fn().mockReturnValue(false),
}))
jest.mock("@/lib/permissions", () => ({
  checkCameraPermission: jest.fn().mockResolvedValue(true),
}))
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
}))
jest.mock("expo-linking", () => ({
  useLinkingURL: jest.fn(),
  parse: jest.fn(),
}))
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))
jest.mock("react-native-keychain", () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}))
jest.mock("expo-blur", () => ({
  BlurView: "BlurView",
}))
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}))
jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}))
jest.mock("lucide-react-native", () => ({
  CheckCircleIcon: "CheckCircleIcon",
  ChevronDownIcon: "ChevronDownIcon",
  ScanQrCodeIcon: "ScanQrCodeIcon",
}))

// Mock all the view components
jest.mock("@/components/PassportView", () => "PassportView")
jest.mock("@/components/HomeEmptyView", () => "HomeEmptyView")
jest.mock("@/components/UpdateModalView", () => {
  const React = require("react")
  const { Text } = require("react-native")
  return function UpdateModalView({ requiredVersion }: { requiredVersion: string }) {
    return React.createElement(
      Text,
      { testID: "update-modal" },
      `Update required: ${requiredVersion}`,
    )
  }
})
jest.mock("@/components/Modals", () => {
  const React = require("react")
  const { View, Text } = require("react-native")

  return {
    AlertModal: ({ visible, title, description, buttonText }: any) => {
      if (!visible) return null

      // Generate testID based on title for easier testing - using i18n key as returned by mocked t()
      const testID =
        title === "modals.incompatibleSdk.title" ? "incompatible-sdk-modal" : "alert-modal"

      return React.createElement(
        View,
        { testID },
        React.createElement(Text, {}, title),
        React.createElement(Text, {}, description),
        React.createElement(Text, {}, buttonText),
      )
    },
  }
})
jest.mock("@/components/QRCodeScannerView", () => "QRCodeScannerView")
jest.mock("@/components/ScanPassportView", () => "ScanPassportView")
jest.mock("@/components/LoadingView", () => "LoadingView")
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe("HomeView Integration Tests", () => {
  const mockUseParseDeepLinkParams = useParseDeepLinkParams as jest.Mock
  const mockUseSettings = useSettings as jest.Mock
  const mockUseWebSocket = useWebSocket as jest.Mock
  const mockUseError = useError as jest.Mock
  const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock
  const mockCheckVersions = checkVersions as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mocks
    mockUseLocalSearchParams.mockReturnValue({})
    mockUseSettings.mockReturnValue({
      currentPassport: null,
      settings: {
        passports: [],
      },
      passports: {},
      passportsLoaded: true,
      failedToLoadPassport: false,
      neededToResetSettings: false,
    })
    mockUseWebSocket.mockReturnValue({
      scan: jest.fn(),
    })
    mockUseError.mockReturnValue({
      reportError: jest.fn(),
    })

    // Default version check response (all good)
    mockCheckVersions.mockResolvedValue({
      appVersion: undefined,
      sdkVersion: undefined,
    })
  })

  describe("when app version update is required", () => {
    it("should display UpdateModalView with required version when checkVersions indicates update needed", async () => {
      // Mock deep link params
      mockUseParseDeepLinkParams.mockReturnValue({
        topic: "test-topic",
        query: { age: { gte: 18 } },
        pubkey: "test-pubkey",
        domain: "test-domain",
        service: { name: "Test Service" },
        mode: "fast",
        sdkVersion: "0.11.0",
        timestamp: 1762183034,
        devMode: false,
      })

      // Mock checkVersions to return that app needs update
      mockCheckVersions.mockResolvedValue({
        appVersion: {
          needToUpdate: true,
          requiredVersion: "2.5.0",
        },
        sdkVersion: undefined,
      })

      const { getByTestId, queryByTestId } = render(<HomeView />)

      // Wait for the component to process the version check
      await waitFor(() => {
        expect(getByTestId("update-modal")).toBeTruthy()
      })

      // Verify the update modal is shown with the correct version
      const updateModal = getByTestId("update-modal")
      expect(updateModal).toBeTruthy()
      expect(updateModal.props.children).toContain("2.5.0")

      // Verify other components are not shown
      expect(queryByTestId("passport-view")).toBeNull()
    })
  })

  describe("when useParseDeepLinkParams returns null", () => {
    it("should handle null deep link params gracefully", async () => {
      mockUseParseDeepLinkParams.mockReturnValue(null)

      const { queryByTestId } = render(<HomeView />)

      // Should not show update modal
      expect(queryByTestId("update-modal")).toBeNull()
    })
  })

  describe("when useParseDeepLinkParams returns normal params without update", () => {
    it("should not show update modal for normal deep link params", async () => {
      mockUseParseDeepLinkParams.mockReturnValue({
        topic: "test-topic",
        query: { age: { gte: 18 } },
        pubkey: "test-pubkey",
        domain: "test-domain",
        service: { name: "Test Service" },
        mode: "fast",
        sdkVersion: "0.11.0",
        timestamp: 1762183034,
        devMode: false,
      })

      // checkVersions returns all good (default mock)
      mockCheckVersions.mockResolvedValue({
        appVersion: undefined,
        sdkVersion: {
          sdkVersion: "0.11.0",
          sdkVersionSupported: true,
          sdkVersionRangeSupported: { min: "0.10.0", max: "1.0.0" },
        },
      })

      const { queryByTestId } = render(<HomeView />)

      // Should not show update modal
      await waitFor(() => {
        expect(queryByTestId("update-modal")).toBeNull()
      })
    })
  })

  describe("SDK version check result from navigation params", () => {
    it("should show incompatible SDK modal when sdkVersionCheckResult is passed", async () => {
      const sdkCheckResult = {
        sdkVersion: "0.5.0",
        sdkVersionSupported: false,
        sdkVersionRangeSupported: { min: "0.10.0", max: "1.0.0" },
      }

      mockUseLocalSearchParams.mockReturnValue({
        sdkVersionCheckResult: JSON.stringify(sdkCheckResult),
      })

      mockUseParseDeepLinkParams.mockReturnValue(null)

      const { getByTestId } = render(<HomeView />)

      await waitFor(() => {
        expect(getByTestId("incompatible-sdk-modal")).toBeTruthy()
      })
    })
  })

  describe("integration with real deep link flow", () => {
    it("should process deep link with SDK version and show update modal if needed", async () => {
      // Simulate a real deep link
      const realDeepLinkParams = {
        domain: "demo.zkpassport.id",
        topic: "033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242",
        query: {
          age: { gte: 18 },
          nationality: { eq: ["AFG"] },
          firstname: { disclose: true },
          facematch: { mode: "regular" },
        },
        service: {
          name: "Test Project",
          purpose: "stuff",
          scope: "more stuff",
        },
        pubkey: "033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242",
        mode: "fast" as const,
        sdkVersion: "0.11.0",
        timestamp: 1762183034,
        devMode: false,
      }

      mockUseParseDeepLinkParams.mockReturnValue(realDeepLinkParams)

      // Mock checkVersions to indicate app needs update
      mockCheckVersions.mockResolvedValue({
        appVersion: {
          needToUpdate: true,
          requiredVersion: "2.0.0",
        },
        sdkVersion: undefined,
      })

      const { getByTestId } = render(<HomeView />)

      await waitFor(() => {
        expect(getByTestId("update-modal")).toBeTruthy()
      })

      // Verify checkVersions was called with the deep link's SDK version
      expect(mockCheckVersions).toHaveBeenCalledWith(
        {
          appVersion: true,
          sdkVersion: true,
        },
        0,
        "0.11.0",
      )

      // Verify the update modal shows the required version
      const updateModal = getByTestId("update-modal")
      expect(updateModal.props.children).toContain("2.0.0")
    })

    it("should show SDK incompatibility modal when SDK version not supported", async () => {
      // Deep link with outdated SDK version
      const deepLinkParams = {
        domain: "demo.zkpassport.id",
        topic: "test-topic",
        query: { age: { gte: 18 } },
        service: { name: "Test Service" },
        pubkey: "test-pubkey",
        mode: "fast" as const,
        sdkVersion: "0.5.0", // Outdated SDK
        timestamp: 1762183034,
        devMode: false,
      }

      mockUseParseDeepLinkParams.mockReturnValue(deepLinkParams)

      // Mock checkVersions to indicate SDK not supported
      mockCheckVersions.mockResolvedValue({
        appVersion: undefined,
        sdkVersion: {
          sdkVersion: "0.5.0",
          sdkVersionSupported: false,
          sdkVersionRangeSupported: { min: "0.10.0", max: "1.0.0" },
        },
      })

      const { getByTestId } = render(<HomeView />)

      await waitFor(() => {
        expect(getByTestId("incompatible-sdk-modal")).toBeTruthy()
      })

      // Verify checkVersions was called
      expect(mockCheckVersions).toHaveBeenCalledWith(
        {
          appVersion: true,
          sdkVersion: true,
        },
        0,
        "0.5.0",
      )
    })
  })
})
