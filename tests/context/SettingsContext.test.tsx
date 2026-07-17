import React from "react"
import { act, waitFor, renderHook } from "@testing-library/react-native"
import { ErrorProvider } from "@/context/ErrorContext"
import { StorageProvider } from "@/context/StorageContext"
import { SettingsProvider, useSettings } from "@/context/SettingsContext"
import { StorageService } from "@/services/StorageService"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { bytesToHex } from "@noble/hashes/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { BaseProofService } from "@/services/ProofService"
import { MissingCscaError, UnsupportedPassportError } from "@/types/Error"
import { CriteriaItem } from "@/components/AccessRequest/VerificationCriteriaList"
import { QRCodeData, Query } from "@zkpassport/utils"
import { ProofModeEnum } from "@/types/ProofService"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const storage = global.__TEST_STORAGE__

// Test fixtures and constants
const FIXTURES = {
  API_ENDPOINT: "https://test-api.com/report",
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
  SUCCESS_LOG_ADDITIONAL_DATA: {
    circuit_version: "1.0",
  },
}

// Mock secure storage functions to avoid keychain access
jest.mock("@/lib/settingsUtils", () => {
  const actual = jest.requireActual("@/lib/settingsUtils")
  return {
    ...actual,
    deleteFromSecureStorage: jest.fn(),
    getValueFromSecureStorage: jest.fn().mockResolvedValue("0x" + "1234567890".repeat(7)),
    saveToSecureStorage: jest.fn(),
  }
})

jest.mock("@/lib/errorUtils", () => {
  const actual = jest.requireActual("@/lib/errorUtils")
  return {
    ...actual,
    getDeviceMetadata: jest.fn().mockResolvedValue({
      device_info: FIXTURES.EXPECTED_DEVICE_INFO,
      deviceUuid: FIXTURES.DEVICE_DATA.deviceUuid,
    }),
    shouldAutoReportError: jest.fn().mockReturnValue(false),
    reportError: jest.fn().mockResolvedValue(false),
  }
})

jest.mock("@/components/Modals", () => {
  const React = require("react")
  const makeMock = () =>
    jest.fn(({ children }: any) => React.createElement(React.Fragment, null, children))
  return {
    ErrorOverlay: makeMock(),
    AlertModal: jest.fn(() => null),
  }
})

// Minimal mocks to avoid network/heavy work during base subproof generation
jest.mock("@/lib/circuit-matcher", () => ({
  checkManifestVersion: jest.fn(async () => ({
    circuitManifest: { circuits: {}, version: "1.0.0" },
    circuitVersion: "1.0.0",
  })),
  checkDuplicateProofs: jest.fn(async () => null),
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

// Mock additional dependencies specifically for getBaseSubproofs test
jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils")
  return {
    ...actual,
    getDSCCircuitInputs: jest.fn().mockResolvedValue({
      inputs: { test: "dsc-inputs" },
      signatureAlgorithm: "SHA256withRSA",
    }),
    getIDDataCircuitInputs: jest.fn().mockResolvedValue({
      inputs: { test: "id-data-inputs" },
    }),
    getIntegrityCheckCircuitInputs: jest.fn().mockResolvedValue({
      inputs: { test: "integrity-check-inputs" },
    }),
    getCscaForPassportAsync: jest.fn().mockResolvedValue({
      publicKey: "test-csca-public-key",
      signatureAlgorithm: "SHA256withRSA",
    }),
    isCscaSupported: jest.fn().mockReturnValue(true),
    getCertificateLeafHash: jest.fn().mockReturnValue(BigInt(123)),
    isIDSupported: jest.fn().mockResolvedValue({ supported: true }),
  }
})
jest.mock("@zkpassport/registry")
jest.mock("@/lib/circuit-matcher")
jest.mock("@/lib/noir")
const mockBaseProofService = {
  generateBaseSubproofs: jest.fn().mockResolvedValue([
    { proof: "test-proof-dsc", vkeyHash: "test-vkey-hash", version: "1.0.0", name: "dsc" },
    { proof: "test-proof-id-data", vkeyHash: "test-vkey-hash", version: "1.0.0", name: "id-data" },
    {
      proof: "test-proof-integrity",
      vkeyHash: "test-vkey-hash",
      version: "1.0.0",
      name: "integrity-check",
    },
  ]),
}
jest.mock("@/services/ProofService", () => ({
  BaseProofService: {
    getInstance: jest.fn(() => mockBaseProofService),
    clearBaseSubproofs: jest.fn().mockImplementation(async (updateSettings) => {
      await updateSettings({
        baseSubproofs: undefined,
        generatingBaseSubproofs: false,
        startedGeneratingBaseSubproofsAt: 0,
        cleanExitDuringProofGeneration: false,
        memoryTooLow: false,
        currentProofGenerationProgress: undefined,
      })
    }),
  },
}))
jest.mock("@/services/TimingService", () => ({
  createOperationTimer: jest.fn().mockReturnValue({
    startSubOperation: jest.fn(),
    endSubOperation: jest.fn(),
    end: jest.fn().mockReturnValue({
      time_elapsed_ms: 1000,
      sub_operations: {},
    }),
    addMetadata: jest.fn(),
  }),
}))

jest.mock("@/lib", () => ({
  needsLowMemoryProver: jest.fn().mockReturnValue(false),
  getPassportExpiryDate: jest.fn().mockReturnValue("2030-01-01"),
  getVersion: jest.fn().mockReturnValue("1.0.0"),
  checkRAMAndWarnUser: jest.fn().mockImplementation(async () => ({ proceed: true })),
  getIntegrityToDisclosureSalts: jest.fn().mockReturnValue({
    dg1Salt: BigInt(1),
    dg2HashSalt: BigInt(2),
    expiryDateSalt: BigInt(2),
    privateNullifierSalt: BigInt(1),
  }),
  deriveSecretFromMasterKey: jest.fn().mockResolvedValue("0x" + "a".repeat(64)),
  getRandomBytesHex: jest.fn().mockReturnValue("0x" + "b".repeat(24)),
  sendAnonymousMetadata: jest.fn().mockResolvedValue(undefined),
  isMeetingMinVersion: jest.fn().mockReturnValue(true),
  getPassportUniqueId: jest.fn().mockImplementation((passport: any) => {
    const { sha256 } = require("@noble/hashes/sha256")
    const { bytesToHex } = require("@noble/hashes/utils")
    return bytesToHex(sha256(passport.sod.signerInfo.signature.toUInt8Array()))
  }),
}))

// Dont like that this needs to be mocked
jest.mock("@/lib/constants", () => ({
  CIRCUIT_VERSION: "1.0.0",
  CLOUD_PROVER_URL: "https://test-api.com",
  API_URL: "https://test-api.com",
  NFC_MAX_ATTEMPTS: 3,
  MASTER_KEY_DERIVATION_IDS: {
    id_data_encryption_key: "test_id_data_encryption_key",
    commitment_salt: "test_commitment_salt",
    oprf_secret: "test_oprf_secret",
  },
  COUNTRIES_ALPHA_2_TO_NAME: { en: {}, fr: {} },
  ID_CARD_CODES: ["I<", "I", "C<", "C", "A<", "A"],
  RESIDENCE_PERMIT_CODES: ["IR", "AR", "CR"],
  BRIDGE_REQUEST_STORAGE_MAX_REQUESTS: 5,
  RPC_URL: "https://test-rpc.com",
  OUTER_CONTAINER_TOP_PADDING: 0,
}))

global.fetch = jest.fn()
global.setImmediate = jest.fn() as any

const SettingsProviderWrapper = ({ children }: { children: React.ReactNode }) => (
  <StorageProvider implementation={storage}>
    <ErrorProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </ErrorProvider>
  </StorageProvider>
)

// Helper to use useSettings hook with a wrapper provider and wait for settings to be loaded
const useSettingsHook = async (
  wrapper: React.ComponentType<{ children: React.ReactNode }> = SettingsProviderWrapper,
) => {
  // eslint-disable-next-line
  const { result: settings } = renderHook(() => useSettings(), {
    wrapper,
  })
  // Wait for first time default settings to be loaded
  await waitFor(() => expect(settings.current.settings.userUuid).toBeDefined())
  // Ensure settings were persisted
  await waitFor(async () => {
    const storedSettings = await storage.getItem("settings")
    const parsedStoredSettings = JSON.parse(storedSettings!)
    expect(parsedStoredSettings.userUuid).toBe(settings.current.settings.userUuid)
  })
  return () => settings.current
}

// Helper to add delay to storage.mergeItem to simulate race conditions
const addDelayToStorageMergeItem = async (filter: (json: any) => boolean, delay: number) => {
  jest.spyOn(storage, "mergeItem").mockImplementation(async function (key: string, value: string) {
    try {
      const json = JSON.parse(value)
      if (filter(json)) await sleep(delay)
    } catch {}
    // Call _mergeItem instead of mergeItem to prevent re-triggering the spy
    await (storage as StorageService)._mergeItem(key, value)
  })
}

describe("SettingsProvider", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await storage.clearSettings()
  })

  it("should initialize with default settings when no settings exist in storage", async () => {
    const current = await useSettingsHook()
    // Should have default settings
    expect(current().settings).toEqual({
      passports: [],
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
      currentProofGenerationProgress: undefined,
      faceMatchDebug: false,
      // UUID should be generated
      userUuid: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      history: [],
      hasAddedIdBefore: false,
      requireAuthForVerification: false,
    })
  })

  it("should properly reset settings while preserving UUID and clearing storage", async () => {
    const current = await useSettingsHook()
    const originalUuid = current().settings.userUuid

    // First, modify settings to have non-default values and simulate having passports
    await act(() => {
      current().updateSettings({
        fullProofMode: true,
        hideIDDetails: true,
        showResetDataButton: true,
        memoryTooLow: true,
        hasAddedIdBefore: true,
        history: [
          {
            id: "test-passport-1",
            passportId: "test-passport-1",
            metadata: {
              timestamp: new Date().toISOString(),
              countryCode: "USA",
              idType: "PASSPORT",
              name: "John Doe",
              accessItems: [] as CriteriaItem[],
            },
            request: {
              query: {} as Query,
              mode: ProofModeEnum.Fast,
              domain: "test-domain.com",
              service: {
                name: "Test Service",
                purpose: "Test Purpose",
                logo: "test-logo.png",
              },
              topic: "test-topic",
              sdkVersion: "1.0.0",
              timestamp: Date.now(),
              devMode: false,
            } as unknown as QRCodeData,
          },
        ],
        generatingBaseSubproofs: true,
        startedGeneratingBaseSubproofsAt: Date.now(),
        circuitBeingProven: "test-circuit",
        passports: [{ id: "test-passport-1" }, { id: "test-passport-2" }],
        activePassport: "test-passport-1",
        baseSubproofs: {
          "1": [],
          "2": [],
        },
        hasSeenBiometricCheck: true,
      })
    })

    // Verify settings were changed from defaults
    await waitFor(() => {
      expect(current().settings.fullProofMode).toBe(true)
      expect(current().settings.passports).toHaveLength(2)
      expect(current().settings.activePassport).toBe("test-passport-1")
      expect(current().settings.generatingBaseSubproofs).toBe(true)
    })

    // Add some mock data to storage
    await storage.setItem("some-other-key", "should-remain")

    // Reset settings
    await act(() => current().resetSettings())

    // Verify all settings are back to defaults except UUID, and added id before
    expect(current().settings).toEqual({
      passports: [],
      showResetDataButton: false,
      fullProofMode: false,
      generatingBaseSubproofs: false,
      circuitBeingProven: "",
      history: [],
      hasAddedIdBefore: true,
      startedGeneratingBaseSubproofsAt: 0,
      baseSubproofs: {},
      cleanExitDuringProofGeneration: false,
      memoryTooLow: false,
      hideIDDetails: false,
      hasSeenBiometricCheck: false,
      currentProofGenerationProgress: undefined,
      userUuid: originalUuid, // UUID should be preserved
      faceMatchDebug: false,
      requireAuthForVerification: false,
    })

    // Verify UUID was preserved
    expect(current().settings.userUuid).toBe(originalUuid)

    // Verify reset worked and settings were persisted to storage correctly
    const storedSettings = await storage.getItem("settings")

    const parsedStoredSettings = JSON.parse(storedSettings!)
    expect(parsedStoredSettings.fullProofMode).toBe(false)
    expect(parsedStoredSettings.passports).toEqual([])
    expect(parsedStoredSettings.activePassport).toBeUndefined()
    expect(parsedStoredSettings.userUuid).toBe(originalUuid)

    // Verify other storage keys weren't affected by reset
    const otherData = await storage.getItem("some-other-key")
    expect(otherData).toBe("should-remain")
  })

  it("persists settings to storage", async () => {
    const current = await useSettingsHook()

    // Update settings
    await act(() => current().updateSettings({ fullProofMode: true }))

    // Ensure settings are persisted to storage
    await waitFor(async () => {
      const storedSettings = await storage.getItem("settings")
      const parsedStoredSettings = JSON.parse(storedSettings!)
      expect(parsedStoredSettings.fullProofMode).toBe(true)
    })

    // Ensure settings persisted to storage are loaded in new instance
    const current2 = await useSettingsHook(SettingsProviderWrapper)
    await waitFor(() => expect(current2().settings.fullProofMode).toBe(true))
  })

  it("updates settings correctly with race conditions", async () => {
    // Mock storage.mergeItem to add delay for Alice update to simulate race conditions
    await addDelayToStorageMergeItem((json) => json?.activePassport?.startsWith("alice"), 10)

    const current = await useSettingsHook()

    // Alice's update starts first but finishes last due to simulated delay above
    await act(async () => {
      await current().updateSettings({
        activePassport: "alice",
        circuitBeingProven: "alice",
      })
    })
    // Bob's update
    await act(async () => {
      await current().updateSettings({
        activePassport: "bob",
      })
    })

    // Ensure Alice AND Bob's updates persisted to storage
    await waitFor(async () => {
      expect(current().settings.activePassport).toBe("bob")
      expect(current().settings.circuitBeingProven).toBe("alice")
      const settings = JSON.parse((await storage.getItem("settings"))!)
      expect(settings.activePassport).toBe("bob")
      expect(settings.circuitBeingProven).toBe("alice")
    })
  })

  it("handles multiple updates in quick succession", async () => {
    // Mock storage.mergeItem to add delay for Alice update to simulate race conditions
    await addDelayToStorageMergeItem((json) => json?.activePassport?.startsWith("alice"), 1)

    const current = await useSettingsHook()

    // Update settings 5 times in quick succession
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        await current().updateSettings({
          activePassport: `alice-${i}`,
        })
      }
    })
    // Bob's update
    await act(async () => {
      await current().updateSettings({
        activePassport: "bob",
      })
    })

    // Ensure Bob's update persisted to storage
    await waitFor(async () => {
      expect(current().settings.activePassport).toBe("bob")
      const storedSettings = await storage.getItem("settings")
      const parsedStoredSettings = JSON.parse(storedSettings!)
      expect(parsedStoredSettings?.activePassport).toBe("bob")
    })
  })

  it("should properly clear base proofs", async () => {
    const current = await useSettingsHook()

    // Set up some base proofs and related settings
    await act(() => {
      current().updateSettings({
        baseSubproofs: {
          "1": [{ proof: "test-proof-1" } as any],
          "2": [{ proof: "test-proof-2" } as any],
        },
        generatingBaseSubproofs: true,
        startedGeneratingBaseSubproofsAt: Date.now(),
        cleanExitDuringProofGeneration: true,
        memoryTooLow: true,
      })
    })

    // Verify settings were changed from defaults
    await waitFor(() => {
      expect(current().settings.baseSubproofs).toEqual({
        "1": [{ proof: "test-proof-1" }],
        "2": [{ proof: "test-proof-2" }],
      })
      expect(current().settings.generatingBaseSubproofs).toBe(true)
      expect(current().settings.startedGeneratingBaseSubproofsAt).toBeGreaterThan(0)
      expect(current().settings.cleanExitDuringProofGeneration).toBe(true)
      expect(current().settings.memoryTooLow).toBe(true)
    })

    // Clear base proofs
    await act(() => current().clearBaseProofs())

    // Verify all base proof related settings are cleared
    await waitFor(async () => {
      const parsedStoredSettings = JSON.parse((await storage.getItem("settings"))!)
      expect(parsedStoredSettings?.baseSubproofs).toBeUndefined()
      expect(parsedStoredSettings?.generatingBaseSubproofs).toBe(false)
      expect(parsedStoredSettings?.startedGeneratingBaseSubproofsAt).toBe(0)
      expect(parsedStoredSettings?.cleanExitDuringProofGeneration).toBe(false)
      expect(parsedStoredSettings?.memoryTooLow).toBe(false)
      expect(parsedStoredSettings?.currentProofGenerationProgress).toBeUndefined()
    })
  })

  it("should properly delete one ID and its base proofs", async () => {
    const current = await useSettingsHook()

    // Set up some base proofs and related settings
    await act(() => {
      current().updateSettings({
        passports: [{ id: "1" }, { id: "2" }],
        activePassport: "1",
        baseSubproofs: {
          "1": [{ proof: "test-proof-1" } as any],
          "2": [{ proof: "test-proof-2" } as any],
        },
      })
    })

    // Verify settings were changed from defaults
    await waitFor(() => {
      expect(current().settings.baseSubproofs).toEqual({
        "1": [{ proof: "test-proof-1" }],
        "2": [{ proof: "test-proof-2" }],
      })
      expect(current().settings.passports).toEqual([{ id: "1" }, { id: "2" }])
      expect(current().settings.activePassport).toBe("1")
    })

    // Delete one ID and its base proofs
    await act(() => {
      current().deletePassport("1")
    })

    // Verify all base proof related settings are cleared
    await waitFor(async () => {
      const parsedStoredSettings = JSON.parse((await storage.getItem("settings"))!)
      expect(parsedStoredSettings?.baseSubproofs).toEqual({
        "1": [],
        "2": [{ proof: "test-proof-2" }],
      })
      expect(parsedStoredSettings?.passports).toEqual([{ id: "2" }])
      expect(parsedStoredSettings?.activePassport).toBe("2")
    })
  })

  it("should properly delete all IDs and their base proofs", async () => {
    const current = await useSettingsHook()

    // Set up some base proofs and related settings
    await act(() => {
      current().updateSettings({
        passports: [{ id: "1" }, { id: "2" }],
        activePassport: "1",
        baseSubproofs: {
          "1": [{ proof: "test-proof-1" } as any],
          "2": [{ proof: "test-proof-2" } as any],
        },
      })
    })

    // Verify settings were changed from defaults
    await waitFor(() => {
      expect(current().settings.baseSubproofs).toEqual({
        "1": [{ proof: "test-proof-1" }],
        "2": [{ proof: "test-proof-2" }],
      })
      expect(current().settings.passports).toEqual([{ id: "1" }, { id: "2" }])
      expect(current().settings.activePassport).toBe("1")
    })

    // Delete all IDs and their base proofs
    await act(() => {
      current().deleteAllPassports()
    })

    // Verify all base proof related settings are cleared
    await waitFor(async () => {
      const parsedStoredSettings = JSON.parse((await storage.getItem("settings"))!)
      expect(parsedStoredSettings?.baseSubproofs).toBeUndefined()
      expect(parsedStoredSettings?.passports).toEqual([])
      expect(parsedStoredSettings?.activePassport).toBeUndefined()
    })
  })

  it("should properly save a passport", async () => {
    const current = await useSettingsHook()

    const expectedId = bytesToHex(sha256(PASSPORTS.john.sod.signerInfo.signature.toUInt8Array()))

    // Save a mock passport
    await act(() => {
      current().savePassport(PASSPORTS.john)
    })

    // Verify settings were changed from defaults
    await waitFor(() => {
      expect(current().settings.passports).toEqual([{ id: expectedId }])
      expect(current().settings.activePassport).toBe(expectedId)
    })

    // Verify passport settings were saved to storage
    await waitFor(async () => {
      const storedSettings = await storage.getItem("settings")
      const parsedStoredSettings = JSON.parse(storedSettings!)
      expect(parsedStoredSettings?.passports).toEqual([{ id: expectedId }])
      expect(parsedStoredSettings?.activePassport).toBe(expectedId)
    })
  })

  it("should call getBaseSubproofs and generate base subproofs successfully", async () => {
    const current = await useSettingsHook()

    const mockCerts = require("../fixtures/certs_0x03c239fd.json")
    const { RegistryClient } = require("@zkpassport/registry")
    RegistryClient.mockImplementation(() => {
      return {
        getCertificates: jest.fn().mockResolvedValue(mockCerts),
        getCircuitManifest: jest.fn().mockResolvedValue({
          circuits: {},
          version: "1.0.0",
        }),
      }
    })

    const CircuitMatcher = require("@/lib/circuit-matcher")
    CircuitMatcher.checkManifestVersion = jest.fn().mockResolvedValue({
      circuitManifest: {
        version: "1.0.0",
      },
      circuitVersion: "1.0.0",
    })
    CircuitMatcher.checkDuplicateProofs = jest.fn().mockResolvedValue(null)
    CircuitMatcher.getDSCCircuit = jest.fn().mockResolvedValue({
      name: "dsc-circuit",
      size: 1000,
      vkey: "test-vkey",
      vkey_hash: "test-vkey-hash",
    })
    CircuitMatcher.getIDDataCircuit = jest.fn().mockResolvedValue({
      name: "id-data-circuit",
      size: 1000,
      vkey: "test-vkey",
      vkey_hash: "test-vkey-hash",
    })
    CircuitMatcher.getIntegrityCheckCircuit = jest.fn().mockResolvedValue({
      name: "integrity-check-circuit",
      size: 1000,
      vkey: "test-vkey",
      vkey_hash: "test-vkey-hash",
    })

    const Noir = require("@/lib/noir")
    Noir.setupCircuit = jest.fn().mockResolvedValue("circuit-id")
    Noir.generateProof = jest.fn().mockResolvedValue({
      proofWithPublicInputs: "test-proof",
    })

    // Create a mock passport object
    const mockPassport = PASSPORTS.john

    // Set up active passport
    await act(() => {
      current().updateSettings({
        activePassport: "test-passport-id",
        passports: [{ id: "test-passport-id" }],
        memoryTooLow: false, // Ensure proof generation is allowed
        generatingBaseSubproofs: false, // Not currently generating
        startedGeneratingBaseSubproofsAt: 0, // No recent generation
        baseSubproofs: {}, // Empty base subproofs
      })
    })

    // Wait for settings to be persisted
    await waitFor(() => {
      expect(current().settings.activePassport).toBe("test-passport-id")
    })

    // Call getBaseSubproofs to generate base subproofs
    let baseSubproofs: any
    await act(async () => {
      baseSubproofs = await current().getBaseSubproofs(
        current().settings.activePassport!,
        mockPassport as any,
      )
    })
    // Debug: log the result to understand what's happening
    console.log("Base subproofs result:", baseSubproofs)

    // Verify that base subproofs were generated
    expect(baseSubproofs).toBeDefined()
    expect(Array.isArray(baseSubproofs)).toBe(true)
    expect(baseSubproofs).toHaveLength(3) // DSC, ID Data, and Integrity Check subproofs

    // Verify each subproof has the expected structure
    baseSubproofs.forEach((subproof: any) => {
      expect(subproof).toHaveProperty("proof")
      expect(subproof).toHaveProperty("vkeyHash")
      expect(subproof).toHaveProperty("version")
      expect(subproof).toHaveProperty("name")
      expect(subproof.proof).toContain("test-proof")
      expect(subproof.vkeyHash).toBe("test-vkey-hash")
      expect(subproof.version).toBe("1.0.0")
    })
  })

  describe("display modals", () => {
    let current: any
    let expectedId: string

    describe("base subproof regeneration errors", () => {
      beforeEach(async () => {
        current = await useSettingsHook()
        expectedId = bytesToHex(sha256(PASSPORTS.john.sod.signerInfo.signature.toUInt8Array()))

        // Save mock passport
        await act(() => {
          current().savePassport(PASSPORTS.john)
        })

        // Ensure active passport set
        await waitFor(() => expect(current().settings.activePassport).toBe(expectedId))

        await act(() => current().clearBaseProofs())
      })

      it("shows CSCANotFound modal when DSCProofService throws MissingCscaError", async () => {
        // Spy on BaseProofService, throw the error
        const proofService = BaseProofService.getInstance()
        const generateBaseSubproofsSpy = jest
          .spyOn(proofService as any, "generateBaseSubproofs")
          .mockImplementation(async () => {
            throw new MissingCscaError("No CSCA found", {
              nationality: "USA",
            })
          })

        // Trigger getBaseSubproofs
        await act(async () => {
          try {
            await current().getBaseSubproofs(expectedId, PASSPORTS.john)
          } catch {}
        })

        // Expect CSCANotFound modal flag set via SettingsContext
        await waitFor(() => expect(current().showCSCANotFoundModal).toBe(true))

        generateBaseSubproofsSpy.mockRestore()
      })

      it("shows UnsupportedPassport modal when DSCProofService throws UnsupportedPassportError", async () => {
        // Spy on BaseProofService, throw the error
        const proofService = BaseProofService.getInstance()
        const generateBaseSubproofsSpy = jest
          .spyOn(proofService as any, "generateBaseSubproofs")
          .mockImplementation(async () => {
            throw new UnsupportedPassportError("CSC not supported", { reason: "hash_alg" })
          })

        // Trigger getBaseSubproofs explicitly to simulate uncached path
        await act(async () => {
          try {
            await current().getBaseSubproofs(expectedId, PASSPORTS.john)
          } catch {}
        })

        // Expect UnsupportedPassport modal flag set via SettingsContext
        await waitFor(() => expect(current().showUnsupportedPassportModal).toBe(true))

        generateBaseSubproofsSpy.mockRestore()
      })
    })

    // This is dealt with on the MRZ Level
    // it("shows ExpiredDocumentModal when saving a passport expired", async () => {
    //   const current = await useSettingsHook()

    //   // Spy the modal component to assert it was rendered
    //   const expiredSpy = jest.spyOn(Modals, "ExpiredDocumentModal")

    //   // Create a copy of john passport with past expiry
    //   const expiredPassport = {
    //     ...PASSPORTS.john,
    //     passportExpiry: "2010-01-01",
    //   } as any

    //   await act(() => {
    //     current().savePassport(expiredPassport)
    //   })

    //   // Modal should render (SettingsProvider renders it based on state)
    //   await waitFor(() => expect(expiredSpy).toHaveBeenCalled())
    // })

    // This is dealt with in ScanPassportView
    // it("shows AlreadyScannedModal when attempting to save a duplicate passport", async () => {
    //   const current = await useSettingsHook()

    //   const alreadyScannedSpy = jest.spyOn(Modals, "AlreadyScannedModal")

    //   // Save once
    //   await act(() => {
    //     current().savePassport(PASSPORTS.john)
    //   })
    //   await waitFor(() => expect(current().settings.passports.length).toBe(1))

    //   // Try saving the same passport again → should trigger AlreadyScanned modal
    //   await act(() => {
    //     current().savePassport(PASSPORTS.john)
    //   })

    //   await waitFor(() => expect(alreadyScannedSpy).toHaveBeenCalled())
    // })
  })
})
