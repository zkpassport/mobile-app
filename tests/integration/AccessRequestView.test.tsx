import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import AccessRequestView from "@/components/AccessRequestView"
import { StorageProvider } from "@/context/StorageContext"
import { ErrorProvider } from "@/context/ErrorContext"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { ErrorType, ZKPassportError } from "@/types/Error"
import { t } from "i18next"

const storage = (global as any).__TEST_STORAGE__

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}))

// Mocks
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}))

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}))

jest.mock("lottie-react-native", () => "LottieView")

jest.mock("react-native-country-flag", () => () => null)

jest.mock("@zkpassport/utils", () => ({
  ...jest.requireActual("@zkpassport/utils"),
  getProofData: jest.fn().mockImplementation((_proof: string, numberOfPublicInputs: number) => {
    // Mock the proof and public inputs for the integrity proof
    if (numberOfPublicInputs === 2) {
      return { proof: "0x1", publicInputs: ["0x11", "0x22"] }
    }
    // Mock the proof and public inputs for disclosure proofs
    return { proof: "0x2", publicInputs: ["0x22", "0x33"] }
  }),
}))

// Mock react-native-vision-camera
jest.mock("react-native-vision-camera", () => {
  const React = require("react")
  return {
    Camera: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        takeSnapshot: jest.fn(),
      }))
      return React.createElement("View", props)
    }),
    useCameraDevice: jest.fn(() => ({ id: "mock-camera" })),
    useCameraFormat: jest.fn(() => null),
    useCameraPermission: jest.fn(() => ({ hasPermission: true, requestPermission: jest.fn() })),
  }
})

// Mock expo-camera
jest.mock("expo-camera", () => ({
  useCameraPermissions: jest.fn(() => [{ granted: true, canAskAgain: true }, jest.fn()]),
  Camera: () => null,
}))

// Mock expo-status-bar
jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}))

// Mock AccessRequestActions to use a simple button instead of slide-to-confirm
jest.mock("@/components/AccessRequest/AccessRequestActions", () => {
  const React = require("react")
  const { TouchableOpacity, Text, View } = require("react-native")

  const AccessRequestActions = React.forwardRef(
    ({ onConfirm, onCancel, canContinue }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        resetSlider: jest.fn(),
      }))

      if (!canContinue) {
        return React.createElement(
          TouchableOpacity,
          { onPress: onCancel },
          React.createElement(Text, {}, "close"),
        )
      }

      return React.createElement(
        View,
        {},
        React.createElement(
          TouchableOpacity,
          { onPress: onConfirm },
          React.createElement(Text, {}, "confirm"),
        ),
      )
    },
  )

  AccessRequestActions.displayName = "AccessRequestActions"

  return {
    __esModule: true,
    AccessRequestActions,
  }
})

// these are all ones i can bring over from my other branches.

// Mock lucide-react-native icons to simple components
jest.mock("lucide-react-native", () => {
  const React = require("react")
  const MockIcon = (props: any) => React.createElement("View", props)
  return {
    // Icons used directly in component
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    ChevronDownIcon: MockIcon,
    ChevronUpIcon: MockIcon,
    InformationCircleIcon: MockIcon,
    MinusIcon: MockIcon,
    PlusIcon: MockIcon,
    CheckIcon: MockIcon,
    AlertTriangleIcon: MockIcon,
    // Icons used in SlideToConfirm, AccessRequestView, CloseButton
    ArrowRight: MockIcon,
    ArrowDown: MockIcon,
    X: MockIcon,
    // Icons used via credentials.ts
    CakeIcon: MockIcon,
    CalendarX: MockIcon,
    Earth: MockIcon,
    FileText: MockIcon,
    Fingerprint: MockIcon,
    Globe: MockIcon,
    IdCardIcon: MockIcon,
    NetworkIcon: MockIcon,
    SignatureIcon: MockIcon,
    UserRoundSearch: MockIcon,
    VenusAndMars: MockIcon,
  }
})

// Mock @react-native-masked-view/masked-view
jest.mock("@react-native-masked-view/masked-view", () => {
  return {
    __esModule: true,
    default: ({ children }: any) => children,
  }
})

// WebSocket fns we can assert on (prefixed with mock to allow jest.mock access)
const mockWsFns = {
  isDomainVerified: true,
  notifyAccept: jest.fn().mockResolvedValue(true),
  notifyReject: jest.fn().mockResolvedValue(true),
  notifyError: jest.fn().mockResolvedValue(true),
  notifyProof: jest.fn().mockResolvedValue(true),
  notifyDone: jest.fn().mockResolvedValue(true),
  closeConnection: jest.fn(),
}

// Mock WebSocket context used by the component
jest.mock("@/context/WebSocketContext", () => ({
  useWebSocket: () => mockWsFns,
}))

// Mock QRScannerContext
jest.mock("@/context/QRScannerContext", () => ({
  useQRScanner: () => ({
    scannedData: null,
    setScannedData: jest.fn(),
    clearScannedData: jest.fn(),
  }),
}))

// Minimal SettingsContext mock to satisfy component requirements
const mockUpdateSettings = jest.fn()
const mockGetBaseSubproofs = jest.fn().mockResolvedValue([
  { proof: "p1", vkeyHash: "h", version: "1.0.0", name: "sig_check_dsc" },
  { proof: "p2", vkeyHash: "h", version: "1.0.0", name: "sig_check_id_data" },
  { proof: "p3", vkeyHash: "h", version: "1.0.0", name: "data_check_integrity" },
])

// Avoid sharing variables into jest.mock factories

jest.mock("@/context/SettingsContext", () => {
  const { PASSPORTS } = require("@/assets/mock-data/passport")
  const activePassportId = "test-id"
  return {
    useSettings: () => ({
      settings: {
        userUuid: "test-uuid",
        activePassport: activePassportId,
        passports: [{ id: activePassportId }],
        showResetDataButton: false,
        fullProofMode: false,
        generatingBaseSubproofs: false,
        circuitBeingProven: "",
        startedGeneratingBaseSubproofsAt: 0,
        baseSubproofs: {},
        cleanExitDuringProofGeneration: false,
        memoryTooLow: false,
        hideIDDetails: false,
        hasSeenBiometricCheck: false,
        history: [],
      },
      updateSettings: mockUpdateSettings,
      getCommitmentSalt: jest.fn().mockResolvedValue("0xabc"),
      getBaseSubproofs: mockGetBaseSubproofs,
      canGenerateProofs: () => true,
      passports: { [activePassportId]: PASSPORTS.john },
      currentPassport: PASSPORTS.john,
      clearBaseProofs: jest.fn(),
      deleteAllPassports: jest.fn(),
    }),
  }
})

// Mock hooks used for progress and handlers
jest.mock("@/hooks/useAnimatedProgress", () => ({
  useAnimatedProgress: () => ({
    animateProgress: jest.fn(),
    clearProgressAnimation: jest.fn(),
  }),
}))

jest.mock("@/hooks/useProofGenerationHandlers", () => ({
  useProofGenerationHandlers: () => ({
    integrityProofNestedOperationHandler: () => jest.fn(),
    accessRequestProgressHandler: () => jest.fn(),
    startedBaseProofGenerationRef: { current: false },
  }),
}))

// Mock circuit matcher to avoid network/work
jest.mock("@/lib/circuit-matcher", () => ({
  checkManifestVersion: jest.fn(async () => ({
    circuitManifest: { circuits: [] },
    circuitVersion: "1.0.0",
  })),
  getCircuitManifest: jest.fn(async () => ({ circuits: [] })),
  clearCachedCircuitManifest: jest.fn(),
}))

// Mock RegistryClient so the cached-proof cert-root check passes without a real RPC call.
jest.mock("@zkpassport/registry", () => ({
  RegistryClient: jest.fn().mockImplementation(() => ({
    getLatestCertificateRoot: jest.fn().mockResolvedValue("0x11"),
  })),
}))

// Mock services so disclosure proofs throw a typed error
const mockGenerateAccessRequestProofs = jest
  .fn()
  .mockRejectedValue(new ZKPassportError("Proof failed", ErrorType.CIRCUIT_ERROR))

jest.mock("@/services/ProofService", () => {
  const defaultExport = { areBaseSubproofsCached: jest.fn().mockResolvedValue(false) }
  return {
    __esModule: true,
    default: defaultExport,
    DisclosureProofService: {
      getInstance: () => ({
        generateAccessRequestProofs: mockGenerateAccessRequestProofs,
      }),
    },
    BaseProofService: defaultExport,
  }
})

jest.mock("../../modules/app-attest-module", () => ({
  isSupported: jest.fn().mockResolvedValue(true),
  generateKey: jest.fn().mockResolvedValue("key"),
  attestKey: jest.fn().mockResolvedValue("attestation"),
  generateAssertion: jest.fn().mockResolvedValue("assertion"),
}))

jest.mock("modules/facematch", () => ({
  __esModule: true,
  default: {
    initSessions: jest.fn().mockResolvedValue(true),
    cleanupSessions: jest.fn().mockResolvedValue(true),
    analyzeFaceDetection: jest.fn().mockResolvedValue({
      landmarks: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      pitch: 0,
      yaw: 0,
      roll: 0,
      gaze_magnitude: 0,
      gaze_angle_deg: 0,
      bbox: [0, 0, 0, 0],
      score: 0.9,
    }),
    analyzeFaceEmbedding: jest.fn().mockResolvedValue({
      embedding: new Array(512).fill(0.1),
    }),
  },
  initSessions: jest.fn().mockResolvedValue(true),
  cleanupSessions: jest.fn().mockResolvedValue(true),
  analyzeFaceDetection: jest.fn().mockResolvedValue({
    landmarks: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    pitch: 0,
    yaw: 0,
    roll: 0,
    gaze_magnitude: 0,
    gaze_angle_deg: 0,
    bbox: [0, 0, 0, 0],
    score: 0.9,
  }),
  analyzeFaceDetectionFromUri: jest.fn().mockResolvedValue({
    landmarks: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    pitch: 0,
    yaw: 0,
    roll: 0,
    gaze_magnitude: 0,
    gaze_angle_deg: 0,
    bbox: [0, 0, 0, 0],
    score: 0.9,
  }),
  analyzeFaceEmbedding: jest.fn().mockResolvedValue({
    embedding: new Array(512).fill(0.1),
  }),
  analyzeFaceEmbeddingFromUri: jest.fn().mockResolvedValue({
    embedding: new Array(512).fill(0.1),
  }),
}))

// Wrapper with storage and error providers so ErrorOverlay is available
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <StorageProvider implementation={storage}>
    <ErrorProvider>{children}</ErrorProvider>
  </StorageProvider>
)

describe("AccessRequestView Integration - Error surfacing", () => {
  it("shows error overlay when disclosure proof generation fails", async () => {
    const credentialsRequest = {
      domain: "example.com",
      mode: "fast",
      service: {
        name: "Test Service",
        logo: "https://example.com/logo.png",
        purpose: "For testing",
      },
      query: { age: { gte: 18 } },
    } as any

    const { getByText } = render(
      <Wrapper>
        <AccessRequestView
          onClose={jest.fn()}
          credentialsRequest={credentialsRequest}
          passport={PASSPORTS.john}
        />
      </Wrapper>,
    )

    // Trigger the accept flow via the mocked confirm button
    fireEvent.press(getByText("confirm"))

    // Expect the error overlay modal to appear with title and message
    await waitFor(() => {
      expect(getByText("somethingWentWrong")).toBeTruthy()
      expect(getByText("unexpectedErrorDescription")).toBeTruthy()
    })
  })
})

describe("AccessRequestView Integration - Happy Path", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWsFns.notifyAccept.mockResolvedValue(true)
    mockWsFns.notifyProof.mockResolvedValue(true)
    mockWsFns.notifyDone.mockResolvedValue(true)
  })

  it("completes end-to-end: accept -> base proofs -> disclosure proofs -> notifyDone -> close", async () => {
    const credentialsRequest = {
      domain: "example.com",
      mode: "fast",
      service: {
        name: "Test Service",
        logo: "https://example.com/logo.png",
        purpose: "For testing",
      },
      query: { age: { gte: 18 } },
    } as any

    // Make disclosure generation succeed and emit two proofs
    const proofA = { name: "compare_age", proof: "pA", vkeyHash: "h", version: "1.0.0" }
    const proofB = { name: "bind", proof: "pB", vkeyHash: "h", version: "1.0.0" }

    mockGenerateAccessRequestProofs.mockImplementation(async (args: any) => {
      return {
        baseSubproofs: args.baseSubproofs,
        attemptedCircuits: ["compare_age", "bind"],
        disclosureProofs: [proofA, proofB],
        currentCircuit: "bind",
      }
    })

    const onClose = jest.fn()

    const { getByText } = render(
      <Wrapper>
        <AccessRequestView
          onClose={onClose}
          credentialsRequest={credentialsRequest}
          passport={PASSPORTS.john}
        />
      </Wrapper>,
    )

    // Confirm via the mocked confirm button
    fireEvent.press(getByText("confirm"))

    // Accept should be notified
    await waitFor(() => expect(mockWsFns.notifyAccept).toHaveBeenCalled())

    // Proofs should be sent to the service
    await waitFor(() => expect(mockWsFns.notifyProof).toHaveBeenCalledTimes(5))

    // Completion UI then appears and done is notified
    await waitFor(() => expect(getByText(t("LoadingOverlay.verification"))).toBeTruthy())

    // Wait for internal success timeouts to fire
    await waitFor(() => expect(mockWsFns.notifyDone).toHaveBeenCalled(), { timeout: 5000 })

    // Done UI shown
    await waitFor(() => expect(getByText(t("eventPage.title.verified"))).toBeTruthy())
    expect(getByText(t("eventPage.description.verified"))).toBeTruthy()

    // Wait for EventPage countdown to complete
    await waitFor(() => expect(getByText(t("close") + " (5s)")).toBeTruthy(), { timeout: 5000 })

    // Modal should close after EventPage countdown (5s) + buffer
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 8000 })
  }, 15000)
})
