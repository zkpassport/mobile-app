import "@testing-library/jest-native/extend-expect"
import { TextEncoder, TextDecoder } from "util"
import { StorageService, DiskStorageService } from "./src/services/StorageService"

// Silence console logs in tests unless LOGGING is set
// To enable, run: LOGGING=1 bun run test
beforeAll(() => {
  if (!process.env.LOGGING) {
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "info").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  }
})

// Setup for better ES module support
global.TextEncoder = TextEncoder as any
global.TextDecoder = TextDecoder as any

// Ensure fetch exists for libraries that expect it
if (!(global as any).fetch) {
  ;(global as any).fetch = require("cross-fetch")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).setImmediate =
  (global as any).setImmediate || ((fn: any, ..._args: any[]) => setTimeout(fn, 0))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).clearImmediate = (global as any).clearImmediate || ((id: any) => clearTimeout(id))

// Global InMemoryStorageService fixture
declare global {
  // eslint-disable-next-line no-var
  var __TEST_STORAGE__: StorageService
}

// Create a global instance that persists across all tests
global.__TEST_STORAGE__ = new DiskStorageService()

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Add setImmediate polyfill for React Native animations
global.setImmediate = global.setImmediate || ((fn: () => void) => setTimeout(fn, 0))

// Mock react-i18next
jest.mock("react-i18next", () => {
  const React = require("react")
  return {
    useTranslation: () => ({
      t: (key: string) => key,
    }),
    Trans: ({ i18nKey, children }: any) => {
      // If i18nKey is provided, return it as text, otherwise return children
      return React.createElement("span", {}, i18nKey || children)
    },
    initReactI18next: {
      type: "3rdParty",
      init: jest.fn(),
    },
  }
})

// Mock expo-video VideoView component
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: jest.fn().mockReturnValue({
    loop: false,
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  }),
}))

// Mock ModalPortalProvider to avoid context issues
jest.mock("@/components/Modals/ModalPortalProvider", () => {
  const React = require("react")
  return {
    __esModule: true,
    ModalPortalProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useModalPortal: () => ({
      registerModal: jest.fn(),
      unregisterModal: jest.fn(),
      updateModal: jest.fn(),
    }),
    default: ({ children }: any) => React.createElement(React.Fragment, null, children),
  }
})

// Mock ModalWrapper to render children when visible (for testing modals)
jest.mock("@/components/Modals/ModalWrapper", () => {
  const React = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    ModalWrapper: ({ visible, children }: any) => {
      if (!visible) return null
      return React.createElement(View, { testID: "modal-wrapper" }, children)
    },
    default: ({ visible, children }: any) => {
      if (!visible) return null
      return React.createElement(View, { testID: "modal-wrapper" }, children)
    },
  }
})

// Mock expo-file-system
jest.mock("expo-file-system", () => ({
  documentDirectory: "/mock/document/directory/",
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  EncodingType: {
    Base64: "base64",
    UTF8: "utf8",
  },
}))

// Mock @/lib index module to provide deriveSecretFromMasterKey and other utilities
// Note: Use requireActual to preserve unmocked functions
jest.mock("@/lib", () => {
  const actual = jest.requireActual("@/lib")
  return {
    ...actual,
    deriveSecretFromMasterKey: jest.fn().mockResolvedValue("0x" + "a".repeat(64)),
    getRandomBytesHex: jest.fn().mockReturnValue("0x" + "b".repeat(64)),
    sendAnonymousMetadata: jest.fn().mockResolvedValue(undefined),
    checkRAMAndWarnUser: jest.fn(),
    isMeetingMinVersion: jest.fn().mockReturnValue(true),
    needsLowMemoryProver: jest.fn().mockReturnValue(false),
    getPassportUniqueId: jest.fn().mockImplementation((passport: any) => {
      // Handle mock passports that don't have full sod structure
      if (!passport?.sod?.signedAttributes) {
        return "mock-passport-unique-id"
      }
      const { sha256 } = require("@noble/hashes/sha256")
      const { bytesToHex } = require("@noble/hashes/utils")
      const sod = passport.sod
      const dataToHash = JSON.stringify({
        signedAttributes: sod.signedAttributes,
        dataGroups: passport.dataGroups,
      })
      return bytesToHex(sha256(dataToHash))
    }),
  }
})

// Mock constants that use Binary.from at module load time
jest.mock("@/lib/constants", () => {
  return {
    CIRCUIT_VERSION: "0.16.0",
    CLOUD_PROVER_URL: "https://cloud-prover.zkpassport.id",
    API_URL: "https://api.zkpassport.id/api",
    RPC_URL: "https://eth-mainnet.g.alchemy.com/v2/test",
    NFC_MAX_ATTEMPTS: 3,
    BRIDGE_REQUEST_STORAGE_MAX_REQUESTS: 5,
    OUTER_CONTAINER_TOP_PADDING: 0,
    MASTER_KEY_DERIVATION_IDS: {
      id_data_encryption_key: "test_id_data_encryption_key",
      commitment_salt: "test_commitment_salt",
      oprf_secret: "test_oprf_secret",
    },
    COUNTRIES_ALPHA_2_TO_NAME: { en: {}, fr: {} },
    ID_CARD_CODES: ["I<", "I", "C<", "C", "A<", "A"],
    RESIDENCE_PERMIT_CODES: ["IR", "AR", "CR"],
  }
})

// Mock react-native Keyboard specifically
jest.mock("react-native/Libraries/Components/Keyboard/Keyboard", () => ({
  __esModule: true,
  default: {
    dismiss: jest.fn(),
    addListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}))

jest.mock("@expo/vector-icons/Ionicons", () => "Icon")

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  default: {
    useNavigation: jest.fn(),
    useRoute: jest.fn(),
    useFocusEffect: jest.fn(),
  },
}))

jest.mock("expo-screen-capture", () => ({
  __esModule: true,
  default: {
    isScreenCaptureEnabled: jest.fn().mockResolvedValue(true),
    setScreenCaptureEnabled: jest.fn().mockResolvedValue(true),
    allowScreenCaptureAsync: jest.fn().mockResolvedValue(true),
    preventScreenCaptureAsync: jest.fn().mockResolvedValue(true),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
  },
}))

jest.mock("expo-device", () => ({
  brand: "Apple",
  modelName: "iPhone 13",
  modelId: "iPhone14,5",
  osName: "iOS",
  osVersion: "15.0",
}))

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en" }],
}))

// Mock i18next
jest.mock("i18next", () => ({
  use: jest.fn().mockReturnThis(),
  init: jest.fn().mockReturnThis(),
  t: (key: string) => key,
}))

// Mock InteractionManager to prevent animation warnings
jest.mock("react-native/Libraries/Interaction/InteractionManager", () => ({
  runAfterInteractions: (callback: any) => callback(),
  createInteractionHandle: jest.fn(),
  clearInteractionHandle: jest.fn(),
  setDeadline: jest.fn(),
}))

// Mock lucide-react-native
jest.mock("lucide-react-native", () => ({
  InfoIcon: "InfoIcon",
  ChevronLeft: "ChevronLeft",
  ChevronRight: "ChevronRight",
  ChevronDown: "ChevronDown",
  ChevronUp: "ChevronUp",
  Check: "Check",
  X: "X",
}))

// Mock @react-native-masked-view/masked-view
jest.mock("@react-native-masked-view/masked-view", () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}))

// Mock BackHandler
jest.doMock("react-native/Libraries/Utilities/BackHandler", () => {
  return {
    __esModule: true,
    default: {
      addEventListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
      removeEventListener: jest.fn(),
      exitApp: jest.fn(),
    },
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
  }
})

// Mock expo-router
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useGlobalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
  })),
}))

// Mock react-native-exception-handler
jest.mock("react-native-exception-handler", () => ({
  setJSExceptionHandler: jest.fn(),
  setNativeExceptionHandler: jest.fn(),
}))

jest.mock("react-native-linear-gradient", () => "LinearGradient")

// Mock expo-linear-gradient
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}))

// Mock expo-blur
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => children,
}))

// Mock FaceMatch native module
jest.mock("./modules/facematch/src/FaceMatchModule", () => ({
  __esModule: true,
  default: {
    analyzeFace: jest.fn().mockResolvedValue("mock-facematch-result"),
  },
}))

// Mock Dg2Crop native module
jest.mock("./modules/dg2-crop/src/Dg2CropModule", () => ({
  __esModule: true,
  default: {
    trimWhiteBorderBase64: jest
      .fn()
      .mockResolvedValue(JSON.stringify({ result: "mock-trimmed-base64" })),
    removeBackgroundBase64: jest
      .fn()
      .mockResolvedValue(JSON.stringify({ result: "mock-processed-base64" })),
  },
}))

// Mock react-native-worklets
jest.mock("react-native-worklets", () => ({
  __esModule: true,
  default: {},
}))

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () => {
  const { View, Text, Image, ScrollView } = require("react-native")

  const Reanimated = {
    default: {
      View,
      Text,
      Image,
      ScrollView,
      createAnimatedComponent: (component: any) => component,
      call: () => {},
    },
    View,
    Text,
    Image,
    ScrollView,
    Easing: {
      linear: (x: number) => x,
      ease: (x: number) => x,
      quad: (x: number) => x,
      cubic: (x: number) => x,
    },
    Extrapolation: {
      CLAMP: "clamp",
      EXTEND: "extend",
      IDENTITY: "identity",
    },
    createAnimatedComponent: (component: any) => component,
    useSharedValue: (value: any) => ({ value }),
    useAnimatedStyle: (cb: () => any) => cb(),
    useAnimatedScrollHandler: () => ({}),
    useAnimatedGestureHandler: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: () => {},
    useDerivedValue: (value: any) => ({ value }),
    useAnimatedProps: (cb: () => any) => cb(),
    interpolate: (value: number) => value,
    withTiming: (value: any) => value,
    withSpring: (value: any) => value,
    withDecay: (value: any) => value,
    withDelay: (_delay: number, value: any) => value,
    withRepeat: (value: any) => value,
    withSequence: (...values: any[]) => values[0],
    cancelAnimation: () => {},
    measure: () => ({}),
    runOnJS: (fn: Function) => fn,
    runOnUI: (fn: Function) => fn,
  }

  return Reanimated
})
