import React from "react"
import { render, act, waitFor } from "@testing-library/react-native"
import { ErrorProvider, useError } from "@/context/ErrorContext"
import {
  ErrorContextType,
  ErrorType,
  WebSocketError,
  WebSocketErrorSubType,
  ZKPassportError,
} from "@/types/Error"
import { PASSPORTS } from "../fixtures/passports"
import { StorageProvider } from "@/context/StorageContext"
import { API_URL } from "@/lib/constants"

const storage = global.__TEST_STORAGE__

// Test fixtures and constants
const FIXTURES = {
  DEVICE_DATA: {
    deviceUuid: "test-device-uuid",
  },
  EXPECTED_DEVICE_INFO: {
    device_brand: "Apple",
    device_model: "iPhone 13",
    device_model_id: "iPhone14,5",
    os_name: "iOS",
    os_version: "15.0",
    app_version: "1.0.0",
    device_memory: 6442450944,
    is_rooted: false,
    cpu_architecture: ["arm64"],
    device_year_class: 2021,
  },
}

// Test error helpers
const createTestError = (message = "Test error", errorType?: ErrorType) => {
  const error = new ZKPassportError(message, errorType || ErrorType.CIRCUIT_ERROR)
  return error
}

// Mock react-native-exception-handler
jest.mock("react-native-exception-handler", () => ({
  setJSExceptionHandler: jest.fn(),
  setNativeExceptionHandler: jest.fn(),
}))

jest.mock("@/lib/errorUtils", () => {
  const actual = jest.requireActual("@/lib/errorUtils")
  return {
    ...actual,
    getDeviceMetadata: jest.fn().mockResolvedValue({
      device_info: FIXTURES.EXPECTED_DEVICE_INFO,
      deviceUuid: FIXTURES.DEVICE_DATA.deviceUuid,
    }),
  }
})

jest.mock("@/components/Modals", () => ({
  ErrorOverlay: () => null,
  AlertModal: () => null,
}))

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

global.fetch = jest.fn()

const renderErrorProvider = async () => {
  let currentContext: ErrorContextType

  const TestComponent = () => {
    currentContext = useError()
    return null
  }
  render(
    <StorageProvider implementation={storage}>
      <ErrorProvider>
        <TestComponent />
      </ErrorProvider>
    </StorageProvider>,
  )
  await waitFor(() => {
    expect(currentContext).toBeDefined()
  })
  return () => currentContext
}

const getAPICallBody = () => {
  const calls = (global.fetch as jest.Mock).mock.calls
  return JSON.parse(calls[calls.length - 1][1].body)
}

describe("ErrorProvider", () => {
  let getContext: () => ErrorContextType

  beforeAll(async () => {
    jest.spyOn(storage, "getItem")
  })
  beforeEach(async () => {
    jest.clearAllMocks()
    await storage.clearSettings()
    getContext = await renderErrorProvider()
  })

  describe("consent management", () => {
    it("should load default error reporting consent on mount", async () => {
      expect(storage.getItem).toHaveBeenCalledWith("errorReportingConsent")
      await waitFor(() => {
        expect(getContext().hasErrorReportingConsent).toBe(false)
      })
    })

    it("should set error reporting consent", async () => {
      await act(async () => getContext().setErrorReportingConsent(true))
      expect(getContext().hasErrorReportingConsent).toBe(true)
    })

    // FIXME: This should properly throw an error when trying to get settings
    // it("should handle errors loading consent gracefully", async () => {
    //   storage.getItem.mockRejectedValue(new Error("Storage error"))
    //   expect(getContext().hasErrorReportingConsent).toBe(false)
    // })
  })

  describe("reportError", () => {
    it("should auto-report when consent is enabled", async () => {
      await act(async () => getContext().setErrorReportingConsent(true))
      const testError = createTestError("Test error message", ErrorType.MISSING_CSCA)
      const errorInfo = { componentStack: "TestComponent" }

      const result = await act(async () =>
        getContext().reportError(testError, errorInfo, PASSPORTS.john),
      )

      expect(result).toBe(true)

      // Wait for the background reporter to send the error
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `${API_URL}/report`,
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: expect.stringContaining('"message":"Test error message"'),
          }),
        )
      })

      const callBody = getAPICallBody()
      expect(callBody).toMatchObject({
        success: "false",
        message: "Test error message",
        error_type: ErrorType.MISSING_CSCA,
        device_uuid: FIXTURES.DEVICE_DATA.deviceUuid,
        id_info: expect.objectContaining({
          redacted_sod: PASSPORTS.john.sod.getRedactedSOD().toBase64(),
          issuing_date: "2024-01-01",
          document_issuer: "US",
          document_nationality: "ZKR",
          document_type: "P",
          document_type_code: "P<",
          document_expiry: "01/01/35",
          issuing_date_dg12: "",
        }),
        device_info: expect.objectContaining(FIXTURES.EXPECTED_DEVICE_INFO),
      })
    })

    it("should not auto-report when consent is disabled (default)", async () => {
      const error = createTestError("Test error message", ErrorType.MISSING_CSCA)

      const result = await act(async () => getContext().reportError(error))

      expect(result).toBe(false)
      expect(global.fetch).not.toHaveBeenCalled()
      expect(getContext().showErrorOverlay).toBe(true)
      expect(getContext().error).toBeTruthy()
      expect(getContext().error?.message).toBe("Test error message")
    })

    it("should not show error to user when options.showUser is false", async () => {
      const testError = new WebSocketError(
        "Test error message",
        WebSocketErrorSubType.CONNECTION_FAILED,
        { domain: "example.com" },
        { showUser: false },
      )
      await act(async () => {
        return await getContext().reportError(testError)
      })
      expect(getContext().showErrorOverlay).toBe(false)
    })

    it("should show error to user when options.showUser is true", async () => {
      const error = new WebSocketError(
        "Test error message",
        WebSocketErrorSubType.CONNECTION_FAILED,
        { domain: "example.com" },
        { showUser: true },
      )
      await act(async () => {
        return await getContext().reportError(error)
      })
      expect(getContext().showErrorOverlay).toBe(true)
    })

    it("should always show error to user when not an instance of ZKPassportError", async () => {
      const getContext = await renderErrorProvider()
      const error = new Error("Test error message")
      await act(async () => {
        return await getContext().reportError(error)
      })
      expect(getContext().showErrorOverlay).toBe(true)
    })
  })
})
