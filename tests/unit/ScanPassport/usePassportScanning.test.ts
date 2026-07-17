import { renderHook, act } from "@testing-library/react-native"
import { Platform, AppState } from "react-native"
import { usePassportScanning } from "@/hooks/usePassportScanning"
import MrzScanService from "@/services/MrzScanService"
import NfcScanService, { NfcErrorType } from "@/services/NfcScanService"
import { createMRZReadError, createNFCScanError } from "@/lib/errorUtils"
import * as permissions from "@/lib/permissions"
import { PASSPORTS } from "../../fixtures/passports"
import { DocumentType } from "@/types/DocumentInfo"
import { reportEvent } from "@/services/EventReportingService"

// Mock dependencies
jest.mock("@/services/MrzScanService")
jest.mock("@/services/NfcScanService")
jest.mock("@/lib/errorUtils")
jest.mock("@/lib/permissions", () => ({
  waitForBiometricMessage: jest.fn(),
}))
jest.mock("@/services/EventReportingService", () => ({
  reportEvent: jest.fn(),
}))

describe("usePassportScanning", () => {
  // Mock instances
  const mockMrzService = {
    scan: jest.fn(),
    setErrorReporting: jest.fn(),
    getCountryCodeFromMRZ: jest.fn(),
  }

  const mockNfcService = {
    scanWithResult: jest.fn(),
    checkNFCEnabled: jest.fn(),
    cancel: jest.fn(),
    goToNfcSetting: jest.fn(),
    IDSupported: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup default mocks
    ;(MrzScanService.getInstance as jest.Mock).mockReturnValue(mockMrzService)
    ;(NfcScanService.getInstance as jest.Mock).mockReturnValue(mockNfcService)
    ;(permissions.waitForBiometricMessage as jest.Mock).mockResolvedValue(true)
    ;(createMRZReadError as jest.Mock).mockImplementation(
      (mrz, isNfcError, isInvalidMrz) =>
        new Error(`MRZ Error: ${mrz}, NFC: ${isNfcError}, Invalid: ${isInvalidMrz}`),
    )
    ;(createNFCScanError as jest.Mock).mockImplementation(
      (error, docType) => new Error(`NFC Error: ${error}, DocType: ${docType}`),
    )
    mockNfcService.IDSupported.mockResolvedValue(true)

    // Mock Platform
    Platform.OS = "ios"

    // Mock AppState
    const mockEventEmitter = {
      remove: jest.fn(),
    }
    jest.spyOn(AppState, "addEventListener").mockReturnValue(mockEventEmitter)
  })

  describe("Initial State", () => {
    it("should initialize with correct default values", () => {
      const { result } = renderHook(() => usePassportScanning())

      expect(result.current.isScanning).toBe(false)
      expect(result.current.currentStep).toBe("CHOOSE_ID_TYPE")
      expect(result.current.mrz).toBeNull()
      expect(result.current.documentType).toBe(DocumentType.PASSPORT)
      expect(result.current.nfcAttempts).toBe(0)
      expect(result.current.lastError).toBeNull()
      expect(result.current.showNfcDisabledModal).toBe(false)
      expect(result.current.pendingNfcScan).toBe(false)
      expect(result.current.showMrzTimeoutModal).toBe(false)
    })
  })

  describe("MRZ Scanning", () => {
    const documentType = "passport" as DocumentType
    it("should successfully scan MRZ", async () => {
      const mockMrzResult = {
        success: true,
        mrz: PASSPORTS.john.mrz!,
        parsedData: { documentType: "passport" },
        documentType: "passport",
      }
      mockMrzService.scan.mockResolvedValueOnce(mockMrzResult)

      const onMrzSuccess = jest.fn()
      const { result } = renderHook(() => usePassportScanning({ onMrzSuccess }))

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanMrz(documentType)
      })

      expect(mockMrzService.scan).toHaveBeenCalledWith({ documentType: "passport" })
      expect(result.current.mrz).toBe(mockMrzResult.mrz)
      expect(result.current.documentType).toBe("passport")
      expect(result.current.currentStep).toBe("PREPARE_ID")
      expect(onMrzSuccess).toHaveBeenCalledWith(mockMrzResult.mrz, "passport")
      expect(scanResult).toEqual({
        success: true,
        mrz: mockMrzResult.mrz,
        timing: expect.objectContaining({
          operation_type: "mrz_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            manual_entry_attempted: false,
            scan_attempts: 1,
            document_type: "passport",
          }),
        }),
      })
    })

    it("should report the scan events", async () => {
      const mockMrzResult = {
        success: true,
        mrz: PASSPORTS.john.mrz!,
        parsedData: { documentType: "passport" },
        documentType: "passport",
        countryCode: "USA",
      }
      mockMrzService.scan.mockResolvedValueOnce(mockMrzResult)

      const { result } = renderHook(() => usePassportScanning())
      await act(async () => {
        await result.current.scanMrz(documentType)
      })

      expect(reportEvent).toHaveBeenCalledWith(
        "mrz_scan_succeeded",
        {
          manual_entry: false,
          document_type: "passport",
        },
        null,
        expect.objectContaining({
          mrz: PASSPORTS.john.mrz,
          operationTiming: expect.objectContaining({ operation_type: "mrz_scan" }),
        }),
      )
    })

    it("should handle MRZ scan cancellation", async () => {
      mockMrzService.scan.mockResolvedValueOnce({
        success: false,
        isCancelled: true,
      })

      const { result } = renderHook(() => usePassportScanning())
      const documentType = "passport" as DocumentType

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanMrz(documentType)
      })

      expect(scanResult).toEqual({
        success: false,
        cancelled: true,
        timing: expect.objectContaining({
          operation_type: "mrz_scan",
          time_elapsed_ms: expect.any(Number),
        }),
      })
      expect(result.current.mrz).toBeNull()
      expect(result.current.currentStep).toBe("CHOOSE_ID_TYPE")
    })

    it("should handle MRZ scan error", async () => {
      const mockError = new Error("Camera permission denied")
      mockMrzService.scan.mockResolvedValueOnce({
        success: false,
        error: mockError,
      })

      const { result } = renderHook(() => usePassportScanning())

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanMrz(documentType)
      })

      expect(scanResult).toEqual({
        success: false,
        error: mockError,
        timing: expect.objectContaining({
          operation_type: "mrz_scan",
          time_elapsed_ms: expect.any(Number),
        }),
      })
      expect(result.current.lastError).toBe(mockError)
      expect(result.current.currentStep).toBe("CHOOSE_ID_TYPE")
    })

    it("should set error reporting when provided", async () => {
      const reportError = jest.fn()
      mockMrzService.scan.mockResolvedValueOnce({
        success: true,
        mrz: "test-mrz",
        parsedData: {},
      })

      const { result } = renderHook(() => usePassportScanning({ reportError }))

      await act(async () => {
        await result.current.scanMrz(documentType)
      })

      expect(mockMrzService.setErrorReporting).toHaveBeenCalledWith(reportError)
    })

    it("should handle MRZ scan timeout", async () => {
      mockMrzService.scan.mockResolvedValueOnce({
        success: false,
        isTimeout: true,
      })

      const { result } = renderHook(() => usePassportScanning())

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanMrz(documentType)
      })

      expect(scanResult).toEqual({
        success: false,
        timeout: true,
        timing: expect.objectContaining({
          operation_type: "mrz_scan",
          time_elapsed_ms: expect.any(Number),
        }),
      })
      expect(result.current.showMrzTimeoutModal).toBe(true)
    })
  })

  describe("NFC Scanning", () => {
    beforeEach(() => {
      mockNfcService.checkNFCEnabled.mockResolvedValue(true)
    })

    it("should successfully scan NFC with existing MRZ", async () => {
      const testMrz = "test-mrz"
      mockNfcService.scanWithResult.mockImplementation(() =>
        Promise.resolve({
          success: true,
          passport: PASSPORTS.john,
        }),
      )
      mockMrzService.getCountryCodeFromMRZ.mockReturnValue("USA")

      const onNfcSuccess = jest.fn()
      const { result } = renderHook(() =>
        usePassportScanning({
          onNfcSuccess,
          initialStep: "PREPARE_ID", // Start at PREPARE_ID to properly initialize NFC timing
        }),
      )

      // Set MRZ first
      act(() => {
        result.current.setMrz(testMrz)
      })

      let scanResult: any
      await act(async () => {
        scanResult = await result.current.scanNfc()
      })

      expect(permissions.waitForBiometricMessage).toHaveBeenCalled()
      expect(mockNfcService.scanWithResult).toHaveBeenCalledWith(testMrz)
      // Check the scan result
      expect(scanResult).toEqual({
        success: true,
        passport: PASSPORTS.john,
        timing: expect.any(Object),
      })
      expect(onNfcSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          mrz: PASSPORTS.john.mrz,
          passportNumber: PASSPORTS.john.passportNumber,
        }),
      )
      expect(reportEvent).toHaveBeenCalledWith(
        "nfc_scan_succeeded",
        {
          duration_ms: expect.any(Number),
          attempt_number: 1,
          document_type: DocumentType.PASSPORT,
        },
        null,
        expect.objectContaining({
          passport: expect.objectContaining({ passportNumber: PASSPORTS.john.passportNumber }),
          operationTiming: undefined,
        }),
      )
      expect(scanResult).toEqual({
        success: true,
        passport: PASSPORTS.john,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            from_cache: false,
            scan_attempts: 1,
            document_type: "passport",
          }),
        }),
      })
      expect(result.current.nfcAttempts).toBe(0)
    })

    it("should scan NFC with override MRZ", async () => {
      const overrideMrz = "override-mrz"
      mockNfcService.scanWithResult.mockResolvedValueOnce({
        success: true,
        passport: PASSPORTS.john,
      })

      const { result } = renderHook(() => usePassportScanning())

      await act(async () => {
        await result.current.scanNfc(overrideMrz)
      })

      expect(mockNfcService.scanWithResult).toHaveBeenCalledWith(overrideMrz)
    })

    it("should throw error when no MRZ is available", async () => {
      const { result } = renderHook(() => usePassportScanning())

      await expect(async () => {
        await act(async () => {
          await result.current.scanNfc()
        })
      }).rejects.toThrow("MRZ is required for NFC scan")
    })

    it("should handle biometric permission denial", async () => {
      ;(permissions.waitForBiometricMessage as jest.Mock).mockResolvedValueOnce(false)

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setMrz("test-mrz")
      })

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanNfc()
      })

      expect(scanResult).toEqual({
        success: false,
        error: "Permission denied",
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
        }),
      })
      expect(mockNfcService.scanWithResult).not.toHaveBeenCalled()
    })

    it("should handle NFC disabled on Android", async () => {
      Platform.OS = "android"
      mockNfcService.checkNFCEnabled.mockResolvedValueOnce(false)

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setMrz("test-mrz")
      })

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanNfc()
      })

      expect(result.current.showNfcDisabledModal).toBe(true)
      expect(result.current.pendingNfcScan).toBe(true)
      expect(scanResult).toEqual({
        success: false,
        error: expect.any(Error),
        nfcDisabled: true,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
        }),
      })
      expect(mockNfcService.scanWithResult).not.toHaveBeenCalled()
    })

    it("should handle NFC user cancellation", async () => {
      mockNfcService.scanWithResult.mockResolvedValueOnce({
        success: false,
        errorType: NfcErrorType.USER_CANCELLED,
      })

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setMrz("test-mrz")
      })

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanNfc()
      })

      expect(scanResult).toEqual({
        success: false,
        cancelled: true,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            user_cancelled: true,
          }),
        }),
      })
    })

    it("should handle MRZ authentication failure", async () => {
      const testMrz = "test-mrz"
      mockNfcService.scanWithResult.mockResolvedValueOnce({
        success: false,
        errorType: NfcErrorType.MRZ_AUTH_FAILED,
      })

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setMrz(testMrz)
      })

      let scanResult
      await act(async () => {
        scanResult = await result.current.scanNfc()
      })

      expect(createMRZReadError).toHaveBeenCalledWith(
        testMrz,
        true,
        false,
        "passport",
        undefined,
        expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            error_details: "mrz_authentication_failed",
          }),
        }),
      )
      expect(result.current.currentStep).toBe("GET_READY_TO_SCAN")
      expect(result.current.nfcAttempts).toBe(0)
      expect(scanResult).toEqual({
        success: false,
        error: expect.any(Error),
        mrzError: true,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            error_details: "mrz_authentication_failed",
          }),
        }),
      })
    })

    it("should handle NFC scan retries", async () => {
      mockNfcService.scanWithResult.mockResolvedValue({
        success: false,
        error: "Connection lost",
      })

      const reportError = jest.fn()
      const { result } = renderHook(() => usePassportScanning({ maxNfcAttempts: 3, reportError }))

      act(() => {
        result.current.setMrz("test-mrz")
      })

      // First attempt
      let scanResult1
      await act(async () => {
        scanResult1 = await result.current.scanNfc()
      })

      expect(result.current.nfcAttempts).toBe(1)
      expect(scanResult1).toEqual({
        success: false,
        error: expect.any(Error),
        canRetry: true,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            error_details: "Connection lost",
            retry_count: 0,
          }),
        }),
      })

      // Second attempt
      let scanResult2
      await act(async () => {
        scanResult2 = await result.current.scanNfc()
      })

      expect(result.current.nfcAttempts).toBe(2)
      expect(scanResult2).toEqual({
        success: false,
        error: expect.any(Error),
        canRetry: true,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            error_details: "Connection lost",
            retry_count: 1,
          }),
        }),
      })

      // Third attempt - max reached
      let scanResult3
      await act(async () => {
        scanResult3 = await result.current.scanNfc()
      })

      expect(result.current.nfcAttempts).toBe(0) // Reset after max attempts
      expect(scanResult3).toEqual({
        success: false,
        error: expect.any(Error),
        canRetry: false,
        timing: expect.objectContaining({
          operation_type: "nfc_scan",
          time_elapsed_ms: expect.any(Number),
          metadata: expect.objectContaining({
            error_details: "Connection lost",
            retry_count: 2,
          }),
        }),
      })
    })
  })

  describe("Cancel and Reset", () => {
    it("should cancel ongoing scans", async () => {
      const { result } = renderHook(() => usePassportScanning())

      await act(async () => {
        await result.current.cancelScan()
      })

      expect(mockNfcService.cancel).toHaveBeenCalled()
      expect(result.current.isScanning).toBe(false)
    })

    it("should reset all state", () => {
      const { result } = renderHook(() => usePassportScanning())

      // Set some state
      act(() => {
        result.current.setMrz("test-mrz")
        result.current.setDocumentType(DocumentType.ID_CARD)
      })

      // Reset
      act(() => {
        result.current.reset()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.currentStep).toBe("CHOOSE_ID_TYPE")
      expect(result.current.mrz).toBeNull()
      expect(result.current.documentType).toBe(DocumentType.PASSPORT)
      expect(result.current.nfcAttempts).toBe(0)
      expect(result.current.lastError).toBeNull()
      expect(result.current.showNfcDisabledModal).toBe(false)
      expect(result.current.pendingNfcScan).toBe(false)
    })
  })

  describe("NFC Settings Modal", () => {
    it("should open NFC settings", () => {
      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.openNfcSettings()
      })

      expect(mockNfcService.goToNfcSetting).toHaveBeenCalled()
    })

    it("should monitor NFC state changes on Android", async () => {
      Platform.OS = "android"
      mockNfcService.checkNFCEnabled.mockResolvedValueOnce(true)

      const { result } = renderHook(() => usePassportScanning())

      // Simulate NFC disabled state
      act(() => {
        result.current.setShowNfcDisabledModal(true)
        result.current.setMrz("test-mrz")
      })

      // Get the app state change handler
      const appStateHandler = (AppState.addEventListener as jest.Mock).mock.calls[0][1]

      // Simulate app coming to foreground
      await act(async () => {
        await appStateHandler("active")
      })

      expect(mockNfcService.checkNFCEnabled).toHaveBeenCalled()
      expect(result.current.showNfcDisabledModal).toBe(false)
    })

    it("should not monitor NFC state on iOS", () => {
      Platform.OS = "ios"

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setShowNfcDisabledModal(true)
      })

      expect(AppState.addEventListener).not.toHaveBeenCalled()
    })
  })

  describe("Scanning State", () => {
    const documentType = "passport" as DocumentType
    it("should set isScanning during MRZ scan", async () => {
      let resolvePromise: any
      const scanPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      mockMrzService.scan.mockReturnValue(scanPromise)

      const { result } = renderHook(() => usePassportScanning())

      // Start the scan
      let scanResultPromise: any
      act(() => {
        scanResultPromise = result.current.scanMrz(documentType)
      })

      // Check state during scan
      expect(result.current.isScanning).toBe(true)

      // Resolve the scan
      act(() => {
        resolvePromise({ success: true, mrz: "test" })
      })

      await act(async () => {
        await scanResultPromise
      })

      // Check state after scan
      expect(result.current.isScanning).toBe(false)
    })

    it("should set isScanning during NFC scan", async () => {
      let resolvePromise: any
      const scanPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      mockNfcService.scanWithResult.mockReturnValue(scanPromise)

      const { result } = renderHook(() => usePassportScanning())

      act(() => {
        result.current.setMrz("test-mrz")
      })

      // Start the scan
      let scanResultPromise: any
      act(() => {
        scanResultPromise = result.current.scanNfc()
      })

      // Check state during scan
      expect(result.current.isScanning).toBe(true)

      // Resolve the scan
      act(() => {
        resolvePromise({ success: true, passport: PASSPORTS.john })
      })

      await act(async () => {
        await scanResultPromise
      })

      // Check state after scan
      expect(result.current.isScanning).toBe(false)
    })
  })
})
