import * as CircuitMatcher from "@/lib/circuit-matcher"
import {
  CircuitError,
  CircuitErrorSubType,
  MissingCscaError,
  UnsupportedPassportError,
} from "@/types/Error"
import type { CircuitManifest } from "@zkpassport/utils"
import { UnsupportedPassportEnum } from "@/lib/errorUtils"
import { PASSPORTS } from "@/assets/mock-data/passport"
import * as zkpassportUtils from "@zkpassport/utils"

jest.mock("@zkpassport/utils", () => {
  const actual = jest.requireActual("@zkpassport/utils")
  return {
    _esModule: true,
    ...actual,
    isIDSupported: jest.fn(),
    getSodSignatureAlgorithmType: jest.fn(actual.getSodSignatureAlgorithmType),
    extractTBS: jest.fn(actual.extractTBS),
    getECDSAInfo: jest.fn(actual.getECDSAInfo),
    getTBSMaxLen: jest.fn(actual.getTBSMaxLen),
    getCscaForPassportAsync: jest.fn(actual.getCscaForPassportAsync),
  }
})

const mockGetPackagedCircuitFromRegistry = jest.fn()
const mockGetCertificates = jest.fn()

jest.mock("@zkpassport/registry", () => ({
  RegistryClient: jest.fn().mockImplementation(() => ({
    getPackagedCircuit: mockGetPackagedCircuitFromRegistry,
    getCircuitManifest: jest.fn().mockResolvedValue({
      version: "0.7.0",
      root: "0x",
      circuits: {
        disclose_bytes: { hash: "h1", size: 1 },
        disclose_bytes_evm: { hash: "h1e", size: 1 },
      },
    }),
    getCertificates: mockGetCertificates,
  })),
}))

const mockIsIDSupported = zkpassportUtils.isIDSupported as jest.Mock
const mockGetSodSignatureAlgorithmType =
  zkpassportUtils.getSodSignatureAlgorithmType as unknown as jest.Mock
const mockExtractTBS = zkpassportUtils.extractTBS as unknown as jest.Mock
const mockGetECDSAInfo = zkpassportUtils.getECDSAInfo as unknown as jest.Mock
const mockGetTBSMaxLen = zkpassportUtils.getTBSMaxLen as unknown as jest.Mock
const mockGetCscaForPassportAsync = zkpassportUtils.getCscaForPassportAsync as unknown as jest.Mock

beforeEach(() => {
  mockGetPackagedCircuitFromRegistry.mockReset()
  mockGetCertificates.mockReset()
  mockGetPackagedCircuitFromRegistry.mockResolvedValue({ name: "x", hash: "y", size: 1 })
  mockGetCertificates.mockResolvedValue({ certificates: [], serialised: [[]] })
  mockIsIDSupported.mockReset()
  mockIsIDSupported.mockReturnValue(true as any)
  mockGetSodSignatureAlgorithmType.mockReset()
  mockGetSodSignatureAlgorithmType.mockImplementation(
    jest.requireActual("@zkpassport/utils").getSodSignatureAlgorithmType,
  )
  mockExtractTBS.mockReset()
  mockExtractTBS.mockImplementation(jest.requireActual("@zkpassport/utils").extractTBS)
  mockGetECDSAInfo.mockReset()
  mockGetECDSAInfo.mockImplementation(jest.requireActual("@zkpassport/utils").getECDSAInfo)
  mockGetTBSMaxLen.mockReset()
  mockGetTBSMaxLen.mockImplementation(jest.requireActual("@zkpassport/utils").getTBSMaxLen)
  mockGetCscaForPassportAsync.mockReset()
  mockGetCscaForPassportAsync.mockImplementation(
    jest.requireActual("@zkpassport/utils").getCscaForPassport,
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("getCommittedInputs", () => {
  const manifest: CircuitManifest = {
    version: "0.7.0",
    root: "0x",
    circuits: {
      disclose_bytes: { hash: "h1", size: 1 },
      disclose_bytes_evm: { hash: "h1e", size: 1 },
      compare_age: { hash: "h2", size: 1 },
      compare_age_evm: { hash: "h2e", size: 1 },
      compare_birthdate: { hash: "h3", size: 1 },
      compare_birthdate_evm: { hash: "h3e", size: 1 },
      compare_expiry: { hash: "h4", size: 1 },
      compare_expiry_evm: { hash: "h4e", size: 1 },
      inclusion_check_nationality: { hash: "h5", size: 1 },
      inclusion_check_nationality_evm: { hash: "h5e", size: 1 },
      inclusion_check_issuing_country: { hash: "h6", size: 1 },
      inclusion_check_issuing_country_evm: { hash: "h6e", size: 1 },
      exclusion_check_nationality: { hash: "h7", size: 1 },
      exclusion_check_nationality_evm: { hash: "h7e", size: 1 },
      exclusion_check_issuing_country: { hash: "h8", size: 1 },
      exclusion_check_issuing_country_evm: { hash: "h8e", size: 1 },
      bind: { hash: "h9", size: 1 },
      bind_evm: { hash: "h9e", size: 1 },
    } as any,
  }

  it("returns committed inputs for disclose circuits", async () => {
    const inputs = {
      salted_dg1: { value: [0, 0, 0, 0, 0, 10, 20, 30], salt: "0x1", hash: "0x0" },
      disclose_mask: [1, 0, 1],
    }
    const result = await CircuitMatcher.getCommittedInputs(inputs, "disclose_bytes", manifest)
    expect(result).toEqual({
      disclosedBytes: [10, 0, 30],
      discloseMask: [1, 0, 1],
    })
  })

  it("returns committed inputs for age compare", async () => {
    const inputs = { current_date: 250101, min_age_required: 18, max_age_required: 120 }
    const result = await CircuitMatcher.getCommittedInputs(inputs, "compare_age", manifest)
    expect(result).toEqual({ minAge: 18, maxAge: 120 })
  })

  it("throws circuit not found error for unsupported circuit names", async () => {
    await expect(
      CircuitMatcher.getCommittedInputs({}, "unsupported_circuit" as any, manifest),
    ).rejects.toThrow(
      new CircuitError(
        CircuitErrorSubType.CircuitNotFound,
        `Circuit not found: unsupported_circuit`,
        {
          circuit_name: "unsupported_circuit",
          error_details: "Circuit not found in manifest",
        },
      ),
    )
  })
})

describe("getCSCSignatureHashAlgorithm", () => {
  it("uses DSC signature algorithm when available", () => {
    const sod: any = {
      certificate: {
        signatureAlgorithm: {
          name: "SHA256withRSA",
        },
      },
    }
    const result = CircuitMatcher.getCSCSignatureHashAlgorithm(sod)

    expect(result).toBe("SHA-256")
  })

  it("falls back to SHA-256 when DSC signatureAlgorithm name is unrecognised", () => {
    const sod: any = {
      certificate: {
        signatureAlgorithm: {
          name: "UnknownAlgo",
        },
      },
    }

    const result = CircuitMatcher.getCSCSignatureHashAlgorithm(sod)

    expect(result).toBe("SHA-256")
  })
})

describe("getDSCCircuit", () => {
  const manifest: CircuitManifest = {
    version: "0.7.0",
    root: "0x",
    circuits: {} as any,
  }

  it("throws UnsupportedPassportError when ID is not supported", async () => {
    mockIsIDSupported.mockReturnValue(false as any)

    await expect(CircuitMatcher.getDSCCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      UnsupportedPassportError,
    )
    await expect(CircuitMatcher.getDSCCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      UnsupportedPassportEnum.NOT_SUPPORTED,
    )
  })

  it("throws MissingCscaError when CSC cannot be found", async () => {
    mockGetCscaForPassportAsync.mockResolvedValue(null)

    await expect(CircuitMatcher.getDSCCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      MissingCscaError,
    )
  })

  it("throws UnsupportedPassportError when CSC curve details are missing", async () => {
    mockGetCscaForPassportAsync.mockResolvedValue({
      signature_algorithm: "ECDSA",
      hash_algorithm: "SHA-256",
      public_key: { curve: "brainpoolPundefined" },
    } as any)

    await expect(CircuitMatcher.getDSCCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      UnsupportedPassportEnum.FAILED_ROOT_CERTIFICATE_CHECK,
    )
  })
})

describe("getIDDataCircuit", () => {
  const manifest: CircuitManifest = {
    version: "0.7.0",
    root: "0x",
    circuits: {} as any,
  }

  it("throws UnsupportedPassportError when ID is not supported", async () => {
    mockIsIDSupported.mockReturnValue(false as any)

    await expect(CircuitMatcher.getIDDataCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      UnsupportedPassportEnum.NOT_SUPPORTED,
    )
  })

  it("throws UnsupportedPassportError when ECDSA curve information is incomplete", async () => {
    mockExtractTBS.mockReturnValue({ subjectPublicKeyInfo: "tbs" } as any)
    mockGetECDSAInfo.mockReturnValue({ curve: "brainpoolPundefined" } as any)
    mockGetTBSMaxLen.mockReturnValue(512 as any)

    await expect(CircuitMatcher.getIDDataCircuit(PASSPORTS.mary, manifest)).rejects.toThrow(
      UnsupportedPassportEnum.FAILED_ID_SIG_DETAILS,
    )
  })

  it("throws UnsupportedPassportError when signature algorithm type is unknown", async () => {
    mockGetSodSignatureAlgorithmType.mockReturnValue("Something")

    await expect(CircuitMatcher.getIDDataCircuit(PASSPORTS.john, manifest)).rejects.toThrow(
      UnsupportedPassportEnum.NOT_SUPPORTED,
    )
  })
})

describe("getIntegrityCheckCircuit", () => {
  const manifest: CircuitManifest = {
    version: "0.7.0",
    root: "0x",
    circuits: {} as any,
  }

  const basePassport: any = {
    sod: {
      signerInfo: { digestAlgorithm: "sha-256" },
      encapContentInfo: { eContent: { hashAlgorithm: "sha-256" } },
    },
  }

  it("throws UnsupportedPassportError when circuit name is incomplete", async () => {
    const passport = {
      ...basePassport,
      sod: {
        signerInfo: { digestAlgorithm: "sha-undefined" },
        encapContentInfo: { eContent: { hashAlgorithm: "sha-undefined" } },
      },
    }

    await expect(
      CircuitMatcher.getIntegrityCheckCircuit(passport as any, manifest),
    ).rejects.toThrow(UnsupportedPassportEnum.FAILED_HASH_ALG_DETAILS)
  })

  it("throws UnsupportedPassportError when packaged circuit cannot be fetched", async () => {
    // this is network error most likely if we've got this far
    mockGetPackagedCircuitFromRegistry.mockResolvedValueOnce(undefined as any)
    await expect(
      CircuitMatcher.getIntegrityCheckCircuit(basePassport as any, manifest),
    ).rejects.toThrow("Failed to fetch packaged circuit")
  })
})
