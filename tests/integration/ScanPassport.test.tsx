import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import ScanPassportView from "@/components/ScanPassportView"
import { PASSPORTS, ID_CARDS } from "../fixtures/passports"
import { DocumentType } from "@/types/DocumentInfo"
import { t } from "i18next"

// Create shared mock functions that can be referenced in tests
const mockSavePassport = jest.fn()
const mockUpdateSettings = jest.fn()
const mockReportError = jest.fn()
const mockGetMasterKey = jest.fn().mockResolvedValue("1234567890")

// Create mocks for services before jest.mock calls
const mockMrzScan = jest.fn()
const mockParseMRZ = jest.fn()
const mockGetCountryCodeFromMRZ = jest.fn()
const mockNfcScan = jest.fn()
const mockConstructMrzFromManualInput = jest.fn()
const mockIsDuplicateMrz = jest.fn()
const mockIsExpired = jest.fn()
const mockWaitForBiometricMessage = jest.fn()
const mockGetIssuingCountryFromMRZ = jest.fn()
const mockFormatDateDisplay = jest.fn()
const mockExtractMrzData = jest.fn()
const mockValidateInputs = jest.fn()
const mockGetDocumentType = jest.fn()
const mockGetMrzs = jest.fn()

// Create a dynamic settings object that can be modified for individual tests
let mockSettings = {
  passports: [],
  showResetDataButton: false,
  fullProofMode: false,
  generatingBaseSubproofs: false,
  circuitBeingProven: "",
  startedGeneratingBaseSubproofsAt: 0,
  baseSubproofs: {},
  cleanExitDuringProofGeneration: true,
  memoryTooLow: false,
  hideIDDetails: false,
  hasSeenBiometricCheck: true,
}

jest.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    savePassport: mockSavePassport,
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    getMrzs: mockGetMrzs,
    getMasterKey: mockGetMasterKey,
  }),
}))

jest.mock("@/context/ErrorContext", () => ({
  useError: () => ({
    reportError: mockReportError,
  }),
}))

// Mock state for the usePassportScanning hook
let mockHookState = {
  isScanning: false,
  currentStep: 0,
  mrz: null,
  documentType: DocumentType.PASSPORT,
  nfcAttempts: 0,
  lastError: null,
}

const mockScanMrz = jest.fn()
const mockScanNfc = jest.fn()
const mockCancelScan = jest.fn()
const mockResetScanState = jest.fn()
const mockOpenNfcSettings = jest.fn()
const mockSetDocumentType = jest.fn()
const mockSetMrz = jest.fn()
const mockSetShowNfcDisabledModal = jest.fn()
const mockSetCurrentStep = jest.fn()
const mockStartManualMrzEntry = jest.fn()
const mockEndManualMrzEntry = jest.fn()

// Mock usePassportScanning hook
jest.mock("@/hooks/usePassportScanning", () => ({
  usePassportScanning: (options: any) => {
    // Call callbacks when mock functions are called with success
    mockScanMrz.mockImplementation(async () => {
      try {
        const result = await mockMrzScan()
        console.log("mockScanMrz result:", result)
        if (result) {
          mockHookState.mrz = result
          if (options.onMrzSuccess) {
            options.onMrzSuccess()
          }
          return { success: true }
        }
        console.log("mockScanMrz: result was falsy, returning cancelled")
        return { success: false, cancelled: true }
      } catch (error: any) {
        // Handle rejected promises from mockMrzScan
        console.log("mockScanMrz caught error:", error)
        if (error.message === "User cancelled scan") {
          return { success: false, cancelled: true }
        }
        return { success: false, error }
      }
    })

    mockScanNfc.mockImplementation(async () => {
      const result = await mockNfcScan(mockHookState.mrz)
      if (result === "Invalid MRZ key") {
        return { success: false, mrzError: true, error: "Invalid MRZ key" }
      }
      if (result === "NFC connection lost") {
        return { success: false, canRetry: true, error: result }
      }
      if (result === "canceled") {
        return { success: false, cancelled: true }
      }
      if (result && typeof result === "object") {
        if (options.onNfcSuccess) {
          await options.onNfcSuccess(result)
        }
        return { success: true }
      }
      return { success: false }
    })

    mockSetDocumentType.mockImplementation((type: string) => {
      mockHookState.documentType = type as any
    })

    mockSetMrz.mockImplementation((mrz: string) => {
      mockHookState.mrz = mrz as any
    })

    return {
      ...mockHookState,
      scanMrz: mockScanMrz,
      scanNfc: mockScanNfc,
      cancelScan: mockCancelScan,
      reset: mockResetScanState,
      openNfcSettings: mockOpenNfcSettings,
      setDocumentType: mockSetDocumentType,
      setMrz: mockSetMrz,
      showNfcDisabledModal: false,
      setShowNfcDisabledModal: mockSetShowNfcDisabledModal,
      showMrzTimeoutModal: false,
      setShowMrzTimeoutModal: jest.fn(),
      pendingNfcScan: false,
      setPendingNfcScan: jest.fn(),
      setCurrentStep: mockSetCurrentStep,
      startManualMrzEntry: mockStartManualMrzEntry,
      endManualMrzEntry: mockEndManualMrzEntry,
      initializeOnboardingTimer: jest.fn(),
    }
  },
}))

// Mock UI components
jest.mock("@react-native-masked-view/masked-view", () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}))

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}))

jest.mock("lucide-react-native", () => {
  const React = require("react")
  const MockIcon = (props: any) => React.createElement("View", props)
  return {
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    ChevronLeft: MockIcon,
    ChevronRight: MockIcon,
    ChevronRightIcon: MockIcon,
    InformationCircleIcon: MockIcon,
    Check: MockIcon,
    X: MockIcon,
  }
})

jest.mock("lottie-react-native", () => {
  const React = require("react")
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", props),
  }
})

// Mock error modals - they interfere with the test flow
jest.mock("@/components/Modals", () => {
  const actual = jest.requireActual("@/components/Modals")
  return {
    ...actual,
    ErrorOverlay: () => null,
    // Use real AlertModal for error cases, but simplify it for testing
    AlertModal: ({
      visible,
      title,
      description,
      buttonText,
      buttonText2,
      onClose,
      onAccept,
    }: any) => {
      const React = require("react")
      const { View, Text, TouchableOpacity } = require("react-native")
      if (!visible) return null
      return React.createElement(
        View,
        { testID: "alert-modal" },
        React.createElement(Text, null, title),
        React.createElement(Text, null, description),
        buttonText &&
          React.createElement(
            TouchableOpacity,
            { onPress: onAccept },
            React.createElement(Text, null, buttonText),
          ),
        buttonText2 &&
          React.createElement(
            TouchableOpacity,
            { onPress: onClose },
            React.createElement(Text, null, buttonText2),
          ),
      )
    },
  }
})

// Mock NFCModalView
jest.mock("@/components/NFCModalView", () => ({
  __esModule: true,
  default: () => null,
}))

// Mock EventPage
jest.mock("@/components/Info/EventPage", () => ({
  __esModule: true,
  default: ({ onContinue, stepType }: any) => {
    const React = require("react")
    const { View, Text, TouchableOpacity } = require("react-native")
    const titles: Record<string, string> = {
      mrz: "Scan successful",
      nfc: "Chip scan successful",
    }
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, titles[stepType] || stepType),
      React.createElement(
        TouchableOpacity,
        { onPress: onContinue, accessibilityLabel: "continue-button" },
        React.createElement(Text, null, "Continue"),
      ),
    )
  },
  EventPageType: {
    MRZ: "mrz",
    NFC: "nfc",
    NFC_FAILED: "nfc-failed",
    NOT_SUPPORTED: "not-supported",
    EXPIRED_ID: "expired-id",
    SOMETHING_WRONG: "something-wrong",
    VERIFIED: "verified",
  },
}))

jest.mock("@/services/NfcScanService", () => {
  const NfcScanService = {
    getInstance: () => ({
      scan: mockNfcScan,
      cancel: jest.fn(),
      addPassportReaderListener: jest.fn(() => ({ remove: jest.fn() })),
    }),
  }
  return {
    __esModule: true,
    default: NfcScanService,
  }
})

jest.mock("@/lib/permissions", () => ({
  checkCameraPermission: jest.fn().mockResolvedValue(true),
}))

jest.mock("@/lib/credentials", () => ({
  getDocumentType: (...args: any[]) => mockGetDocumentType(...args),
}))

jest.mock("@/services/MrzScanService", () => {
  const MrzScanService = {
    getInstance: () => ({
      constructMrzFromManualInput: (...args: any[]) => mockConstructMrzFromManualInput(...args),
      getIssuingCountryFromMRZ: (...args: any[]) => mockGetIssuingCountryFromMRZ(...args),
      formatDateDisplay: (...args: any[]) => mockFormatDateDisplay(...args),
      extractMrzData: (...args: any[]) => mockExtractMrzData(...args),
      validateInputs: (...args: any[]) => mockValidateInputs(...args),
      scan: (...args: any[]) => mockMrzScan(...args),
      parseMRZ: (...args: any[]) => mockParseMRZ(...args),
      getCountryCodeFromMRZ: (...args: any[]) => mockGetCountryCodeFromMRZ(...args),
      isDuplicateMrz: (...args: any[]) => mockIsDuplicateMrz(...args),
      isExpired: (...args: any[]) => mockIsExpired(...args),
    }),
  }
  return {
    __esModule: true,
    default: MrzScanService,
  }
})

jest.mock("@/lib", () => ({
  getCountryName: jest.fn().mockReturnValue("ZKR"),
  waitForBiometricMessage: (...args: any[]) => mockWaitForBiometricMessage(...args),
}))

jest.mock("@/lib/passport-chip-positions", () => ({
  estimatePassportIssueDate: jest.fn().mockReturnValue("2025-01-01"),
  getChipPosition: jest.fn().mockReturnValue("front_cover"),
  getChipPositionDescription: jest.fn().mockReturnValue("front cover"),
}))

describe("ScanPassportView Integration", () => {
  const mockOnFinish = jest.fn()
  const mockOnCancel = jest.fn()

  const defaultProps = {
    initialStep: "CHOOSE_ID_TYPE" as const,
    onFinish: mockOnFinish,
    onCancel: mockOnCancel,
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset hook state
    mockHookState = {
      isScanning: false,
      currentStep: 0,
      mrz: null,
      documentType: DocumentType.PASSPORT,
      nfcAttempts: 0,
      lastError: null,
    }

    // Reset mock settings to default state
    mockSettings = {
      passports: [],
      showResetDataButton: false,
      fullProofMode: false,
      generatingBaseSubproofs: false,
      circuitBeingProven: "",
      startedGeneratingBaseSubproofsAt: 0,
      baseSubproofs: {},
      cleanExitDuringProofGeneration: true,
      memoryTooLow: false,
      hideIDDetails: false,
      hasSeenBiometricCheck: true,
    }

    // Setup default mock implementations
    mockSavePassport.mockResolvedValue(undefined)
    mockUpdateSettings.mockResolvedValue(undefined)
    mockReportError.mockResolvedValue(undefined)

    mockMrzScan.mockResolvedValue(null)
    mockIsDuplicateMrz.mockResolvedValue(false)
    mockIsExpired.mockReturnValue(false)
    mockGetMrzs.mockResolvedValue([])
    mockParseMRZ.mockImplementation((mrz: string) => {
      if (mrz === PASSPORTS.john.mrz || mrz === ID_CARDS.janeDoe.mrz) {
        return {
          documentNumber: mrz.includes("P<")
            ? PASSPORTS.john.passportNumber
            : ID_CARDS.janeDoe.documentNumber,
          dateOfBirth: mrz.includes("P<")
            ? PASSPORTS.john.dateOfBirth
            : ID_CARDS.janeDoe.dateOfBirth,
          dateOfExpiry: mrz.includes("P<")
            ? PASSPORTS.john.passportExpiry
            : ID_CARDS.janeDoe.dateOfExpiry,
        }
      }
      return null
    })
    mockGetCountryCodeFromMRZ.mockReturnValue("ZKR")
    mockConstructMrzFromManualInput.mockImplementation((docType: DocumentType) => {
      if (docType === DocumentType.PASSPORT) {
        return PASSPORTS.john.mrz
      }
      return ID_CARDS.janeDoe.mrz
    })
    mockWaitForBiometricMessage.mockResolvedValue(true)
    mockGetIssuingCountryFromMRZ.mockReturnValue("ZKR")
    mockFormatDateDisplay.mockImplementation(
      (date: string) => `${date.slice(0, 2)}/${date.slice(2, 4)}/${date.slice(4, 6)}`,
    )
    mockExtractMrzData.mockReturnValue({
      documentNumber: "",
      dateOfBirth: "",
      dateOfExpiry: "",
    })
    mockValidateInputs.mockReturnValue({ errors: {}, isValid: true })
    mockGetDocumentType.mockImplementation((mrz: string) =>
      mrz.includes("P<") ? "passport" : "id_card",
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("Complete flow - Passport scanning", () => {
    beforeEach(() => {
      mockMrzScan.mockResolvedValue(PASSPORTS.john.mrz)
      mockNfcScan.mockResolvedValue({ passportData: "test" })
      mockConstructMrzFromManualInput.mockReturnValue(PASSPORTS.john.mrz)
      mockParseMRZ.mockImplementation(() => ({
        documentNumber: PASSPORTS.john.passportNumber,
        dateOfBirth: PASSPORTS.john.dateOfBirth,
        dateOfExpiry: PASSPORTS.john.passportExpiry,
      }))
      mockExtractMrzData.mockReturnValue({
        documentNumber: PASSPORTS.john.passportNumber,
        dateOfBirth: PASSPORTS.john.dateOfBirth,
        dateOfExpiry: PASSPORTS.john.passportExpiry,
      })
      mockValidateInputs.mockReturnValue({
        errors: {},
        isValid: true,
      })
      mockGetDocumentType.mockReturnValue(DocumentType.PASSPORT)
      mockIsDuplicateMrz.mockResolvedValue(false)
      mockIsExpired.mockReturnValue(false)
    })

    it("should complete full passport scanning flow from Step1 to finish", async () => {
      const { getByText, getByPlaceholderText } = render(<ScanPassportView {...defaultProps} />)

      // Step 1: Should start on Step1
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()
      // expect(getByText("scanning.continue")).toBeDefined()

      // Click continue to scan MRZ
      fireEvent.press(getByText(t("scanning.chooseIDType.passport.description")))

      // check for modal
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeDefined()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // should be on Step2
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()
      expect(
        getByText(
          `${t("scanning.getReadyToScan.passport.name")}${t("scanning.getReadyToScan.steps.nfc")}`,
        ),
      ).toBeDefined()

      // click start scan
      fireEvent.press(getByText(t("scanning.getReadyToScan.startScan")))

      // Wait for MRZ scan to complete
      await waitFor(() => {
        expect(mockScanMrz).toHaveBeenCalled()
      })

      // Need to confirm the details first - wait for it to appear
      await waitFor(() => {
        expect(getByText(t("confirmDetails"))).toBeDefined()
      })

      // check to make sure john's details are displayed
      expect(getByText(t("scanning.documentNumber"))).toBeDefined()

      // Verify the TextInput has the expected value
      const documentNumberInput = getByPlaceholderText("AB1234567")
      expect(documentNumberInput.props.value).toBe("ZP1111111")

      fireEvent.press(getByText(t("confirmDetails")))

      // Wait for navigation after successful scan
      await waitFor(
        () => {
          expect(getByText(t("scanning.prepareID.title"))).toBeDefined()
        },
        { timeout: 5000 },
      )

      // Click Start Scan on PrepareID (now single page)
      fireEvent.press(getByText(t("scanning.prepareID.startScan")))

      // Wait for passport scan to complete
      await waitFor(() => {
        expect(mockNfcScan).toHaveBeenCalledWith(PASSPORTS.john.mrz)
      })

      // confirmation modal
      await waitFor(() => {
        expect(getByText("Chip scan successful")).toBeDefined()
      })
      fireEvent.press(getByText("Continue"))

      // Should save passport and call onFinish
      await waitFor(() => {
        expect(mockSavePassport).toHaveBeenCalledWith({ passportData: "test" }, false, "1234567890")
        expect(mockOnFinish).toHaveBeenCalled()
      })
    }, 10000)

    it("renders ID card flow to finish", async () => {
      const { getByText, getByPlaceholderText } = render(<ScanPassportView {...defaultProps} />)

      // Step 1: Should start on Step1
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // Click continue to scan MRZ
      fireEvent.press(getByText(t("scanning.chooseIDType.idCard.description")))

      // check for modal
      expect(getByText(t("modals.checkPassport.title.idCard"))).toBeDefined()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // should be on Step2
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()
      expect(
        getByText(
          `${t("scanning.getReadyToScan.idCard.name")}${t("scanning.getReadyToScan.steps.nfc")}`,
        ),
      ).toBeDefined()

      // click start scan
      fireEvent.press(getByText(t("scanning.getReadyToScan.startScan")))

      // Wait for MRZ scan to complete
      await waitFor(() => {
        expect(mockScanMrz).toHaveBeenCalled()
      })

      // Need to confirm the details first - wait for it to appear
      await waitFor(() => {
        expect(getByText(t("confirmDetails"))).toBeDefined()
      })

      // check to make sure john's details are displayed
      expect(getByText(t("scanning.documentNumber"))).toBeDefined()

      // Verify the TextInput has the expected value
      const documentNumberInput = getByPlaceholderText("123456789")
      expect(documentNumberInput.props.value).toBe("ZP1111111")

      fireEvent.press(getByText(t("confirmDetails")))

      // Wait for navigation after successful scan
      await waitFor(
        () => {
          expect(getByText(t("scanning.prepareID.title"))).toBeDefined()
        },
        { timeout: 5000 },
      )

      // Click Start Scan on PrepareID (now single page)
      expect(getByText(t("scanning.prepareID.title"))).toBeDefined()
      fireEvent.press(getByText(t("scanning.prepareID.startScan")))

      // Wait for passport scan to complete
      await waitFor(() => {
        expect(mockNfcScan).toHaveBeenCalledWith(PASSPORTS.john.mrz)
      })

      // confirmation modal
      await waitFor(() => {
        expect(getByText("Chip scan successful")).toBeDefined()
      })
      fireEvent.press(getByText("Continue"))

      // Should save passport and call onFinish
      await waitFor(() => {
        expect(mockSavePassport).toHaveBeenCalledWith({ passportData: "test" }, false, "1234567890")
        expect(mockOnFinish).toHaveBeenCalled()
      })
    })

    it("should handle going back from Prepare ID to Get Ready to Scan", async () => {
      // mockMrzScan is already defined at the top level
      mockMrzScan.mockResolvedValue(PASSPORTS.john.mrz)

      const newprops = {
        ...defaultProps,
        initialStep: "PREPARE_ID" as const,
      }

      const { getByText } = render(<ScanPassportView {...newprops} />)

      // expect to be on Prepare ID
      expect(getByText(t("scanning.prepareID.title"))).toBeDefined()

      // click on the back button
      fireEvent.press(getByText(t("scanning.back")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()
    })

    it("should show invalid MRZ error when NFC scan fails with invalid MRZ", async () => {
      mockMrzScan.mockResolvedValue(PASSPORTS.john.mrz)
      mockNfcScan.mockResolvedValue("Invalid MRZ key")

      const { getByText, getByPlaceholderText } = render(<ScanPassportView {...defaultProps} />)

      // Step 1: Should start on Step1
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // Click continue to scan MRZ
      fireEvent.press(getByText(t("scanning.chooseIDType.passport.description")))

      // check for modal
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeDefined()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // should be on Step2
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()
      expect(
        getByText(
          `${t("scanning.getReadyToScan.passport.name")}${t("scanning.getReadyToScan.steps.nfc")}`,
        ),
      ).toBeDefined()

      // click start scan
      fireEvent.press(getByText(t("scanning.getReadyToScan.startScan")))

      // Wait for MRZ scan to complete
      await waitFor(() => {
        expect(mockScanMrz).toHaveBeenCalled()
      })

      // Need to confirm the details first - wait for it to appear
      await waitFor(() => {
        expect(getByText(t("confirmDetails"))).toBeDefined()
      })

      // check to make sure john's details are displayed
      expect(getByText(t("scanning.documentNumber"))).toBeDefined()

      // Verify the TextInput has the expected value
      const documentNumberInput = getByPlaceholderText("AB1234567")
      expect(documentNumberInput.props.value).toBe("ZP1111111")

      fireEvent.press(getByText(t("confirmDetails")))

      // Wait for navigation after successful scan
      await waitFor(
        () => {
          expect(getByText(t("scanning.prepareID.title"))).toBeDefined()
        },
        { timeout: 5000 },
      )

      // Click Start Scan on PrepareID (now single page)
      fireEvent.press(getByText(t("scanning.prepareID.startScan")))

      // Wait for passport scan to complete
      await waitFor(() => {
        expect(mockNfcScan).toHaveBeenCalledWith(PASSPORTS.john.mrz)
      })

      // Should show error modal
      await waitFor(() => {
        expect(getByText(t("scanning.modals.mrzScanFailed.title"))).toBeDefined()
        expect(getByText(t("scanning.modals.mrzScanFailed.description"))).toBeDefined()
        expect(getByText(t("scanning.modals.mrzScanFailed.enterManually"))).toBeDefined()
      })
    })
  })

  describe("Document type switching", () => {
    it("should switch between passport and ID card and residence permit", async () => {
      const { getByText } = render(<ScanPassportView {...defaultProps} />)

      // Should default to passport
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // fire event on passport card
      fireEvent.press(getByText(t("scanning.chooseIDType.passport.title")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()

      // click back
      fireEvent.press(getByText(t("scanning.back")))

      // expect to be on Choose ID type
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // click on National ID card
      fireEvent.press(getByText(t("scanning.chooseIDType.idCard.title")))

      // click on ID card card
      expect(getByText(t("modals.checkPassport.title.idCard"))).toBeDefined()

      fireEvent.press(getByText(t("modals.checkPassport.noIDontHaveIt")))

      // expect to be on Choose ID type
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // click on residence permit card
      fireEvent.press(getByText(t("scanning.chooseIDType.residencePermit.title")))

      // expect to be on Check your Residence Permit
      expect(getByText(t("modals.checkPassport.title.residencePermit"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()
    })
  })

  describe("Manual MRZ entry", () => {
    it("should open manual MRZ editor when scan is cancelled", async () => {
      // Mock MRZ scan to return cancelled
      mockMrzScan.mockResolvedValue(null)
      mockScanMrz.mockImplementation(async () => {
        return { success: false, cancelled: true }
      })

      const { getByText, queryByText, getByPlaceholderText, getAllByPlaceholderText } = render(
        <ScanPassportView {...defaultProps} />,
      )

      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // fire event on passport card
      fireEvent.press(getByText(t("scanning.chooseIDType.passport.title")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("modals.checkPassport.title.passport"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // expect to be on Get Ready to Scan
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()

      // Verify manual entry button is not shown initially
      expect(queryByText(t("scanning.getReadyToScan.enterManually"))).toBeNull()

      // click start scan
      fireEvent.press(getByText(t("scanning.getReadyToScan.startScan")))

      // Verify camera permission and MRZ scan mocks were called
      await waitFor(() => {
        expect(mockScanMrz).toHaveBeenCalled()
      })

      // Open manual entry
      expect(getByText(t("scanning.getReadyToScan.enterManually"))).toBeDefined()
      fireEvent.press(getByText(t("scanning.getReadyToScan.enterManually")))

      // Modal should be open
      expect(getByText(t("scanning.manualMRZEntry"))).toBeDefined()
      expect(getByText(t("scanning.documentNumber"))).toBeDefined()

      fireEvent.changeText(getByPlaceholderText("AB1234567"), PASSPORTS.john.passportNumber)

      const dateInputs = getAllByPlaceholderText(" - -  /  - -  /  - - - -")
      fireEvent.changeText(dateInputs[0], "12/11/1995")
      fireEvent.changeText(dateInputs[1], "01/01/2035")

      fireEvent.press(getByText(t("confirm")))

      await waitFor(() => {
        expect(getByText(t("scanning.prepareID.title"))).toBeDefined()
      })
    })
  })

  describe("Error handling", () => {
    it("should handle camera permission denied", async () => {
      const mockCheckCameraPermission = require("@/lib/permissions").checkCameraPermission
      mockCheckCameraPermission.mockResolvedValue(false)

      const { getByText } = render(<ScanPassportView {...defaultProps} />)

      // Step 1: Should start on Step1
      expect(getByText(t("scanning.chooseIDType.title"))).toBeDefined()

      // Click continue to scan MRZ
      fireEvent.press(getByText(t("scanning.chooseIDType.idCard.title")))

      // check for modal
      expect(getByText(t("modals.checkPassport.title.idCard"))).toBeDefined()
      expect(getByText(t("modals.checkPassport.yesIHaveIt"))).toBeDefined()

      // confirm modal
      fireEvent.press(getByText(t("modals.checkPassport.yesIHaveIt")))

      // should be on Step2
      expect(getByText(t("scanning.getReadyToScan.flipID"))).toBeDefined()
      expect(getByText(t("scanning.getReadyToScan.title"))).toBeDefined()

      // click start scan
      fireEvent.press(getByText(t("scanning.getReadyToScan.startScan")))

      // Should not proceed (camera permission denied)
      await waitFor(() => {
        expect(getByText(t("scanning.getReadyToScan.startScan"))).toBeDefined()
      })
    })
  })

  describe("Biometric check flow", () => {
    // this is shown every time now, should we change this?
    it.skip("should show biometric check modal for first-time users", async () => {
      // Set hasSeenBiometricCheck to false for this test
      mockSettings.hasSeenBiometricCheck = false

      const { getByText } = render(<ScanPassportView {...defaultProps} />)

      // Click continue
      const biometricCheckButton = getByText("scanning.continue")
      fireEvent.press(biometricCheckButton)

      expect(getByText("scanning.biometricCheckTitle")).toBeDefined()

      // handle biometric confirm
      const biometricConfirmButton = getByText("scanning.yesIHaveIt")
      fireEvent.press(biometricConfirmButton)

      // settings should be updated
      expect(mockUpdateSettings).toHaveBeenCalledWith({ hasSeenBiometricCheck: true })
    })
  })
})
