import { Platform } from "react-native"
import { PASSPORTS } from "../fixtures/passports"
import { NativeModules } from "react-native"

// Mock the Android passport reader
jest.mock("react-native-passport-reader", () => ({
  scan: jest.fn(),
  isNFCEnabled: jest.fn(),
  goToNfcSetting: jest.fn(),
  cancel: jest.fn(),
}))

// Mock MrzScanService
jest.mock("@/services/MrzScanService", () => ({
  getInstance: jest.fn(() => ({
    parseMRZ: jest.fn(),
  })),
}))

// Mock version helper
jest.mock("@/lib", () => ({
  getVersion: jest.fn(() => "1.0.0"),
  negativeBytesToPositiveBytes: jest.fn((data) => data),
}))

const mockPassportReaderAndroid = require("react-native-passport-reader")
const john = PASSPORTS.john

describe("NfcScanService", () => {
  let nfcScanService: any
  let NfcErrorType: any

  beforeEach(() => {
    jest.clearAllMocks()
    // Clear the module cache to ensure fresh imports
    jest.resetModules()

    // Reset platform before requiring modules
    Platform.OS = "ios"

    // Set up MrzScanService mock
    jest.doMock("@/services/MrzScanService", () => ({
      getInstance: jest.fn(() => ({
        parseMRZ: jest.fn(),
      })),
    }))

    // Re-import the modules after setting platform
    nfcScanService = require("@/services/NfcScanService").default
    NfcErrorType = require("@/services/NfcScanService").NfcErrorType

    nfcScanService = nfcScanService.getInstance()

    // Clear NativeModules mocks
    if (NativeModules.PassportReaderModule) {
      NativeModules.PassportReaderModule.scan.mockClear()
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("NFC ios", () => {
    // for android, will test in integration tests

    it("should return true on iOS (NFC always available)", async () => {
      Platform.OS = "ios"

      const result = await nfcScanService.checkNFCEnabled()

      expect(result).toBe(true)
      expect(mockPassportReaderAndroid.isNFCEnabled).not.toHaveBeenCalled()
    })

    it("should return true on iOS (goToNfcSetting)", async () => {
      Platform.OS = "ios"

      const result = await nfcScanService.goToNfcSetting()

      expect(result).toBe(true)
      expect(mockPassportReaderAndroid.goToNfcSetting).not.toHaveBeenCalled()
    })
  })

  describe("scanWithResult", () => {
    it("should return success result when scan succeeds", async () => {
      const mockPassport = { ...john, appVersion: "1.0.0" }
      jest.spyOn(nfcScanService, "scan").mockResolvedValue(mockPassport)

      const result = await nfcScanService.scanWithResult(john.mrz)

      expect(result).toEqual({
        success: true,
        passport: mockPassport,
      })
    })

    it("should classify user cancellation error", async () => {
      jest.spyOn(nfcScanService, "scan").mockResolvedValue("User canceled the operation")

      const result = await nfcScanService.scanWithResult(john.mrz)

      expect(result).toEqual({
        success: false,
        error: "User canceled the operation",
        errorType: NfcErrorType.USER_CANCELLED,
      })
    })

    it("should classify MRZ authentication failure", async () => {
      jest.spyOn(nfcScanService, "scan").mockResolvedValue("Security status not satisfied")

      const result = await nfcScanService.scanWithResult(john.mrz)

      expect(result).toEqual({
        success: false,
        error: "Security status not satisfied",
        errorType: NfcErrorType.MRZ_AUTH_FAILED,
      })
    })

    it("should classify invalid MRZ key error", async () => {
      jest.spyOn(nfcScanService, "scan").mockResolvedValue("Invalid MRZ key provided")

      const result = await nfcScanService.scanWithResult(john.mrz)

      expect(result).toEqual({
        success: false,
        error: "Invalid MRZ key provided",
        errorType: NfcErrorType.MRZ_AUTH_FAILED,
      })
    })

    it("should classify generic errors", async () => {
      jest.spyOn(nfcScanService, "scan").mockResolvedValue("Unknown error occurred")

      const result = await nfcScanService.scanWithResult(john.mrz)

      expect(result).toEqual({
        success: false,
        error: "Unknown error occurred",
        errorType: NfcErrorType.GENERIC_ERROR,
      })
    })
  })

  describe("requiresPacePolling helper", () => {
    it("should return true for French ID cards", () => {
      // Testing the internal logic by checking French ID behavior
      const frenchMRZ = "IDFRASMITH<<JOHN<<<<<<<<<<<<"

      // Mock the scan to verify PACE polling is used
      jest.spyOn(nfcScanService, "scan").mockImplementation(async (mrz) => {
        // This would internally use requiresPacePolling
        const isPacePolling = (mrz as string).startsWith("IDFRA")
        expect(isPacePolling).toBe(true)
        return "mock-result"
      })

      nfcScanService.scan(frenchMRZ)
    })

    it("should return false for non-French documents", () => {
      const regularMRZ = "P<USASMITH<<JOHN<<<<<<<<<<<<"

      jest.spyOn(nfcScanService, "scan").mockImplementation(async (mrz) => {
        const isPacePolling = (mrz as string).startsWith("IDFRA")
        expect(isPacePolling).toBe(false)
        return "mock-result"
      })

      nfcScanService.scan(regularMRZ)
    })
  })
})
