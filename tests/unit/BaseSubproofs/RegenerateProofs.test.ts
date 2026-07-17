import { MySettings, SavedPassport } from "../../../src/context/SettingsContext"
import { ProofResult } from "@zkpassport/utils"
import { checkDuplicateProofs } from "../../../src/lib/circuit-matcher"

describe("Regenerate Proofs", () => {
  const savedPassports: SavedPassport[] = [
    {
      id: "1",
    },
    {
      id: "2",
    },
  ]

  const mockSettings: MySettings = {
    userUuid: "123",
    activePassport: "1",
    passports: savedPassports,
    showResetDataButton: false,
    fullProofMode: false,
    generatingBaseSubproofs: false,
    circuitBeingProven: "",
    startedGeneratingBaseSubproofsAt: 0,
    baseSubproofs: {},
    cleanExitDuringProofGeneration: false,
    memoryTooLow: false,
    hideIDDetails: false,
    hasSeenBiometricCheck: true,
    currentProofGenerationProgress: undefined,
  }

  const mockSigCheckDsc1: ProofResult = {
    name: "sig_check_dsc_tbs_1000_ecdsa_nist_p384_sha256",
    version: "1.0.0",
    proof: "123",
    vkeyHash: "1234",
  }

  const mockSigCheckDsc2: ProofResult = {
    ...mockSigCheckDsc1,
  }

  const mockSigCheckId1: ProofResult = {
    name: "sig_check_id_tbs_1000_ecdsa_nist_p384_sha256",
    version: "1.0.0",
    proof: "123",
    vkeyHash: "1234",
  }

  const mockSigCheckId2: ProofResult = {
    ...mockSigCheckId1,
  }

  const mockSigCheckIntegrity1: ProofResult = {
    name: "data_check_integrity_tbs_1000_ecdsa_nist_p384_sha256",
    version: "1.0.0",
    proof: "123",
    vkeyHash: "1234",
  }

  const mockSigCheckIntegrity2: ProofResult = {
    ...mockSigCheckIntegrity1,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return the base subproofs if they are already generated", async () => {
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1],
      },
    }

    const checkDuplicate = await checkDuplicateProofs("1.0.0", mockSettingsWithBaseSubproofs, "1")
    expect(checkDuplicate).toEqual([mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1])
  })

  it("should filter out duplicate proofs", async () => {
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [
          mockSigCheckDsc1,
          mockSigCheckId1,
          mockSigCheckDsc2,
          mockSigCheckId2,
          mockSigCheckIntegrity2,
        ],
      },
    }

    const checkDuplicate = await checkDuplicateProofs("1.0.0", mockSettingsWithBaseSubproofs, "1")
    expect(checkDuplicate).toEqual([mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1])
  })

  it("if the base subproofs are not generated, the filter should do nothing", async () => {
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [],
      },
    }
    const baseSubproofs = await checkDuplicateProofs("1.0.0", mockSettingsWithBaseSubproofs, "1")
    expect(baseSubproofs).toEqual([])
  })

  it("should make sure that there is only one DSC, one ID, and one Integrity proof", async () => {
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [
          mockSigCheckDsc1,
          mockSigCheckId1,
          mockSigCheckIntegrity1,
          mockSigCheckDsc2,
          mockSigCheckId2,
          mockSigCheckIntegrity2,
        ],
      },
    }
    const checkDuplicate = await checkDuplicateProofs("1.0.0", mockSettingsWithBaseSubproofs, "1")
    const dscCount = checkDuplicate.filter((x) => x.name?.includes("sig_check_dsc")).length
    const idCount = checkDuplicate.filter((x) => x.name?.includes("sig_check_id")).length
    const integrityCount = checkDuplicate.filter((x) =>
      x.name?.includes("data_check_integrity"),
    ).length
    expect(dscCount).toEqual(1)
    expect(idCount).toEqual(1)
    expect(integrityCount).toEqual(1)
    expect(checkDuplicate.length).toEqual(3)
  })

  it("should make sure that the proofs are from the same version", async () => {
    // Mock the getCircuitManifest function
    const circuitVersion = "1.0.0"
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1],
      },
    }
    const checkDuplicate = await checkDuplicateProofs(
      circuitVersion,
      mockSettingsWithBaseSubproofs,
      "1",
    )
    expect(checkDuplicate).toEqual([mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1])
    expect(checkDuplicate[0].version).toEqual(circuitVersion)
    expect(checkDuplicate[1].version).toEqual(circuitVersion)
    expect(checkDuplicate[2].version).toEqual(circuitVersion)
    expect(checkDuplicate.length).toEqual(3)
  })

  it("if the circuits are a different version, it should return an empty array", async () => {
    const circuitVersion = "2.0.0"
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [mockSigCheckDsc1, mockSigCheckId1, mockSigCheckIntegrity1],
      },
    }
    const baseSubproofs = await checkDuplicateProofs(
      circuitVersion,
      mockSettingsWithBaseSubproofs,
      "1",
    )
    expect(baseSubproofs).toEqual([])
    expect(baseSubproofs.length).toEqual(0)
  })

  it("if just one circuit is from a different version, the whole array should be empty", async () => {
    const circuitVersion = "1.0.0"
    const mockSettingsWithBaseSubproofs: MySettings = {
      ...mockSettings,
      baseSubproofs: {
        "1": [mockSigCheckDsc1, { ...mockSigCheckId1, version: "2.0.0" }, mockSigCheckIntegrity1],
      },
    }
    const baseSubproofs = await checkDuplicateProofs(
      circuitVersion,
      mockSettingsWithBaseSubproofs,
      "1",
    )
    expect(baseSubproofs).toEqual([])
    expect(baseSubproofs.length).toEqual(0)
  })
})
