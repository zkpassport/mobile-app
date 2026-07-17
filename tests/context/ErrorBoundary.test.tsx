import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { ErrorProvider } from "@/context/ErrorContext"
import { SettingsProvider } from "@/context/SettingsContext"
import { PASSPORTS } from "../fixtures/passports"
import { Text } from "react-native"
import RNRestart from "react-native-restart"
import { StorageProvider } from "@/context/StorageContext"
import { API_URL } from "@/lib/constants"

const storage = global.__TEST_STORAGE__

// Mock modules
jest.mock("react-native-restart", () => ({
  Restart: jest.fn(),
}))

jest.mock("react-native-exception-handler", () => ({
  setJSExceptionHandler: jest.fn(),
  setNativeExceptionHandler: jest.fn(),
}))

const mockShouldAutoReportError = jest.fn()

jest.mock("@/lib/errorUtils", () => {
  const actual = jest.requireActual("@/lib/errorUtils")
  return {
    ...actual,
    shouldAutoReportError: (...args: any[]) => mockShouldAutoReportError(...args),
    storeErrorLocally: jest.fn(),
    getDeviceMetadata: jest.fn().mockResolvedValue({
      device_info: {
        device_brand: "Apple",
        device_model: "iPhone 13",
        os_name: "iOS",
        os_version: "15.0",
        app_version: "1.0.0",
      },
      deviceUuid: "test-device-uuid",
    }),
  }
})

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Create a shared AlertModal mock factory
const createAlertModalMock = () => {
  const React = require("react")
  const { View, Text, TouchableOpacity } = require("react-native")

  return ({ visible, title, description, buttonText, buttonText2, onAccept, onClose }: any) => {
    if (!visible) return null
    return React.createElement(
      View,
      { testID: "alert-modal" },
      React.createElement(Text, {}, title),
      React.createElement(Text, {}, description),
      buttonText &&
        React.createElement(
          TouchableOpacity,
          { onPress: onAccept },
          React.createElement(Text, {}, buttonText),
        ),
      buttonText2 &&
        React.createElement(
          TouchableOpacity,
          { onPress: onClose },
          React.createElement(Text, {}, buttonText2),
        ),
    )
  }
}

// Mock @/components/Modals/AlertModal directly (used by ErrorBoundary)
jest.mock("@/components/Modals/AlertModal", () => {
  return {
    AlertModal: createAlertModalMock(),
    default: createAlertModalMock(),
  }
})

jest.mock("@/components/Modals", () => {
  return {
    AutoErrorReportingFailureModal: ({ children }: any) => children,
    ErrorOverlay: () => null,
    AlertModal: createAlertModalMock(),
  }
})

// jest.mock("react-native-modal", () => {
//   const React = require("react")
//   const RN = require("react-native")
//   return ({ children, visible }: any) => visible ? React.createElement(RN.View, {}, children) : null
// })

jest.mock("@/lib/passport-chip-positions", () => ({
  estimatePassportIssueDate: jest.fn().mockReturnValue(new Date("2024-01-01")),
}))

jest.mock("@/services/MrzScanService", () => ({
  parseMRZ: jest.fn().mockReturnValue({
    dateOfExpiry: "2034-01-01",
  }),
}))

jest.mock("@/lib/credentials", () => ({
  getDocumentType: jest.fn().mockReturnValue("P"),
  getIssuingCountryCode: jest.fn().mockReturnValue("US"),
}))

jest.mock("react-native-keychain", () => ({
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
}))

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

jest.mock("expo-local-authentication", () => ({
  authenticateAsync: jest.fn(),
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
}))

jest.mock("expo-file-system", () => ({
  documentDirectory: "/mock/document/directory/",
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}))

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid"),
}))

// Create a mocked useSettings hook
const mockUseSettings = jest.fn()

// Mock the SettingsContext to provide currentPassport
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/context/SettingsContext", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = jest.requireActual("@/context/SettingsContext")
  return {
    ...actual,
    useSettings: () => mockUseSettings(),
    SettingsProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  }
})

// Mock fetch globally
global.fetch = jest.fn()

// Helper component that throws an error
const ThrowError: React.FC<{ error: Error }> = ({ error }) => {
  throw error
}

// Test wrapper with all required providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StorageProvider implementation={storage}>
    <ErrorProvider>
      <SettingsProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
      </SettingsProvider>
    </ErrorProvider>
  </StorageProvider>
)

describe("ErrorBoundary", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await storage.clearSettings()
    // Set default mock return value
    mockUseSettings.mockReturnValue({
      currentPassport: null,
      setCurrentPassport: jest.fn(),
      passports: {},
      settings: {},
      updateSettings: jest.fn(),
    })
    // Set up error reporting consent in global test storage
    await global.__TEST_STORAGE__.setItem("errorReportingConsent", "enabled")
    // By default, enable auto error reporting
    mockShouldAutoReportError.mockResolvedValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  describe("Basic error handling", () => {
    // FIXME: I'm a flaky test, please fix me (exceeds 5sec timeout)
    it("should catch errors and display error UI", async () => {
      // Disable error reporting to prevent the ErrorContext's AlertModal from showing
      await global.__TEST_STORAGE__.setItem("errorReportingConsent", "disabled")
      mockShouldAutoReportError.mockResolvedValue(false)

      const { getByText } = render(
        <TestWrapper>
          <ThrowError error={new Error("Test error message")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(getByText("somethingWentWrong")).toBeTruthy()
        expect(getByText("unexpectedErrorDescription")).toBeTruthy()
      })
    })

    it("should report errors with metadata when consent is enabled", async () => {
      render(
        <TestWrapper>
          <ThrowError error={new Error("Test error")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `${API_URL}/report`,
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: expect.stringContaining('"message":"Test error"'),
          }),
        )
      })
    })

    it("should handle restart button", async () => {
      // Disable error reporting to prevent the ErrorContext's AlertModal from showing
      await global.__TEST_STORAGE__.setItem("errorReportingConsent", "disabled")
      mockShouldAutoReportError.mockResolvedValue(false)

      const { getByText } = render(
        <TestWrapper>
          <ThrowError error={new Error("Test error")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(getByText("restartApp")).toBeTruthy()
      })

      fireEvent.press(getByText("restartApp"))
      expect(RNRestart.Restart).toHaveBeenCalled()
    })
  })

  describe("Passport metadata extraction", () => {
    it("should extract passport metadata for random error", async () => {
      // Mock useSettings to return the passport
      mockUseSettings.mockReturnValue({
        currentPassport: PASSPORTS.john,
        setCurrentPassport: jest.fn(),
        passports: {},
        settings: {},
        updateSettings: jest.fn(),
      })

      render(
        <TestWrapper>
          <ThrowError error={new Error("Random error")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const calls = (global.fetch as jest.Mock).mock.calls
      const requestBody = JSON.parse(calls[calls.length - 1][1].body)

      expect(requestBody.id_info).toMatchObject({
        redacted_sod: expect.any(String),
        issuing_date: expect.any(String),
        document_issuer: "US",
        document_nationality: "ZKR",
        document_type: "P",
        document_type_code: "P<",
        document_expiry: "01/01/35",
      })
    })

    it("should handle missing passport gracefully", async () => {
      render(
        <TestWrapper>
          <ThrowError error={new Error("Random error")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const calls = (global.fetch as jest.Mock).mock.calls
      const requestBody = JSON.parse(calls[calls.length - 1][1].body)

      expect(requestBody.id_info).toBeDefined()
      expect(requestBody.id_info.redacted_sod).toBeUndefined()
    })
  })

  describe("Error reporting with passport context", () => {
    it("should include passport metadata in error report when available", async () => {
      // Mock useSettings to return the passport
      mockUseSettings.mockReturnValue({
        currentPassport: PASSPORTS.john,
        setCurrentPassport: jest.fn(),
        passports: {},
        settings: {},
        updateSettings: jest.fn(),
      })

      const error = new Error("Random error")

      render(
        <TestWrapper>
          <ThrowError error={error} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const calls = (global.fetch as jest.Mock).mock.calls
      const requestBody = JSON.parse(calls[calls.length - 1][1].body)

      expect(requestBody).toMatchObject({
        success: "false",
        message: "Random error",
        device_uuid: "test-device-uuid",
        id_info: expect.objectContaining({
          redacted_sod: expect.any(String),
          document_nationality: "ZKR",
          document_issuer: "US",
          document_type: "P",
          document_expiry: "01/01/35",
        }),
        device_info: expect.objectContaining({
          device_brand: "Apple",
          device_model: "iPhone 13",
          os_name: "iOS",
          os_version: "15.0",
          app_version: "1.0.0",
        }),
      })
    })

    it("should handle partial passport data gracefully", async () => {
      const partialPassport = {
        ...PASSPORTS.john,
        sod: null,
      }

      // Mock useSettings to return the partial passport
      mockUseSettings.mockReturnValue({
        currentPassport: partialPassport,
        setCurrentPassport: jest.fn(),
        passports: {},
        settings: {},
        updateSettings: jest.fn(),
      })

      render(
        <TestWrapper>
          <ThrowError error={new Error("Random error")} />
        </TestWrapper>,
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const calls = (global.fetch as jest.Mock).mock.calls
      const requestBody = JSON.parse(calls[calls.length - 1][1].body)

      expect(requestBody.id_info).toMatchObject({
        issuing_date: "2024-01-01",
        document_nationality: "ZKR",
        document_issuer: "US",
        document_type: "P",
        document_expiry: "01/01/35",
      })
    })
  })

  describe("Fallback UI", () => {
    it("should render custom fallback UI when provided", async () => {
      const CustomFallback = <Text>Custom error UI</Text>

      const { getByText, queryByText } = render(
        <StorageProvider implementation={storage}>
          <ErrorProvider>
            <SettingsProvider>
              <ErrorBoundary fallback={CustomFallback}>
                <ThrowError error={new Error("Test error")} />
              </ErrorBoundary>
            </SettingsProvider>
          </ErrorProvider>
        </StorageProvider>,
      )

      await waitFor(() => {
        expect(getByText("Custom error UI")).toBeTruthy()
        expect(queryByText("somethingWentWrong")).toBeNull()
      })
    })
  })
})
