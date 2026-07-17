import { PASSPORTS } from "../../../assets/mock-data/passport"
import circuitManifest from "../../fixtures/circuit-manifest.json"
import certificatesManifest from "../../fixtures/certificates.json"
import { DSC, PackagedCertificate } from "@zkpassport/utils"
import { getSodSignatureAlgorithmHashAlgorithm } from "@/lib/circuit-matcher"

// Mock getCscaForPassport using doMock (needed for proper ES module mocking)
const mockGetCscaForPassport = jest.fn()

// Mock the utils module before importing the module under test
jest.doMock("@zkpassport/utils", () => {
  const originalModule = jest.requireActual("@zkpassport/utils")
  return {
    ...originalModule,
    getCscaForPassport: mockGetCscaForPassport,
  }
})

// Import after mocking
const { getDSCCircuit } = require("@/lib/circuit-matcher")

const mockGetCertificates = jest.fn()
const mockGetPackagedCircuit = jest.fn()
const mockGetCircuitManifest = jest.fn()
jest.mock("@zkpassport/registry", () => ({
  RegistryClient: jest.fn().mockImplementation(() => ({
    getCertificates: mockGetCertificates,
    getPackagedCircuit: mockGetPackagedCircuit,
    getCircuitManifest: mockGetCircuitManifest,
  })),
}))

describe("getDSCCircuit", () => {
  beforeAll(() => {
    mockGetCertificates.mockResolvedValue(certificatesManifest)
    mockGetCircuitManifest.mockResolvedValue(circuitManifest)
    mockGetPackagedCircuit.mockImplementation((circuitName) => {
      return {
        name: circuitName,
        hash: "1234567890",
        size: 1234567,
      }
    })
    mockGetCscaForPassport.mockImplementation((dsc: DSC, certificates: PackagedCertificate[]) => {
      if (dsc.signatureAlgorithm.name.toLowerCase().includes("rsa")) {
        return certificates.find(
          (x) => x.country === "ZKR" && x.signature_algorithm === "RSA",
        ) as PackagedCertificate
      } else {
        return certificates.find(
          (x) => x.country === "ZKR" && x.signature_algorithm === "ECDSA",
        ) as PackagedCertificate
      }
    })
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("should get the right circuit for a passport with RSA 2048 bits and SHA-256", async () => {
    const dscCircuit = await getDSCCircuit(PASSPORTS.john, circuitManifest)
    expect(dscCircuit).not.toBeNull()
    expect(dscCircuit?.name).toBe("sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256")
  })

  it("should get the right circuit for a passport with ECDSA P-256 and SHA-256", async () => {
    const dscCircuit = await getDSCCircuit(PASSPORTS.mary, circuitManifest)
    expect(dscCircuit).not.toBeNull()
    expect(dscCircuit?.name).toBe("sig_check_dsc_tbs_700_ecdsa_nist_p256_sha256")
  })

  it("should get the right hash for signature algorithm hash algorithm", async () => {
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "sha256WithRSAEncryption"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha256")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "sha1-with-rsa-signature"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha1")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "sha224WithRSAEncryption" as any
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha224")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "sha384WithRSAEncryption"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha384")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "sha512WithRSAEncryption"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha512")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "rsaEncryption" as any
    // Defaults to signed attributes hash algorithm
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha256")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "unknown-signature-algorithm" as any
    // Defaults to signed attributes hash algorithm
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha256")

    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "ecdsa-with-SHA1"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha1")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "ecdsa-with-SHA224" as any
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha224")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "ecdsa-with-SHA256"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha256")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "ecdsa-with-SHA384"
    expect(getSodSignatureAlgorithmHashAlgorithm(PASSPORTS.mary)).toBe("sha384")
    PASSPORTS.mary.sod.signerInfo.signatureAlgorithm.name = "ecdsa-with-SHA512"
  })

  it("should get the right circuit hash algorithm for a CSC indicating a different hash than the DSC", async () => {
    mockGetCscaForPassport.mockImplementation((_, certificates: PackagedCertificate[]) => {
      const baseCert = certificates.find(
        (x) => x.country === "ZKR" && x.signature_algorithm === "RSA",
      )
      return {
        ...baseCert,
        hash_algorithm: "SHA-512",
      } as PackagedCertificate
    })
    const dscCircuit = await getDSCCircuit(PASSPORTS.john, circuitManifest)
    expect(dscCircuit).not.toBeNull()
    expect(dscCircuit?.name).toBe("sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256")
  })
})
