import {
  CircuitManifest,
  getNowTimestamp,
  PackagedCertificate,
  PackagedCircuit,
  ProofResult,
} from "@zkpassport/utils"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { DisclosureCircuitResult } from "@/types/ProofService"

export const mockCircuitManifest = {
  circuits: {},
  root: "mock-root",
  version: "1.0.0",
} as Partial<CircuitManifest>

export const mockCSC: PackagedCertificate = {
  country: "ZKR",
  signature_algorithm: "RSA",
  public_key: {
    type: "RSA",
    key_size: 2048,
    modulus: "mock-modulus",
    exponent: 65537,
  },
  validity: {
    not_before: 1717334400,
    not_after: 1717334400,
  },
}

const mockCircuit = {
  noir_version: "1.0.0",
  bb_version: "1.0.0",
  size: 600,
  abi: {
    parameters: [],
    param_witnesses: {},
    return_type: {},
    return_witnesses: [],
    error_types: [],
  },
  bytecode: "mock-bytecode",
  vkey: "mock-vkey",
  vkey_hash: "mock-vkey-hash",
  hash: 1234567890,
} as any

export const mockCircuitIntegrity: PackagedCircuit = {
  name: "data_check_integrity",
  ...mockCircuit,
}

export const mockCircuitIDCheck: PackagedCircuit = {
  name: "id_data_circuit",
  ...mockCircuit,
}

export const mockCircuitDSC: PackagedCircuit = {
  name: "dsc_circuit",
  ...mockCircuit,
}

export const mockDisclosureAge = {
  name: "compare_age",
  ...mockCircuit,
}

export const mockDisclosureBirthdate = {
  name: "compare_birthdate",
  ...mockCircuit,
}

export const mockBaseSubproofs: ProofResult[] = [
  {
    proof: "mock-dsc-proof",
    vkeyHash: "mock-vkey-hash",
    version: "1.0.0",
    name: "sig_check_dsc",
  },
  {
    proof: "mock-id-proof",
    vkeyHash: "mock-vkey-hash",
    version: "1.0.0",
    name: "sig_check_id_data",
  },
  {
    proof: "mock-integrity-proof",
    vkeyHash: "mock-vkey-hash",
    version: "1.0.0",
    name: "data_check_integrity",
  },
]

export const mockOuterCircuit = {
  name: "outer_circuit",
  ...mockCircuit,
}

export const mockDisclosureCircuits: DisclosureCircuitResult[] = [
  {
    label: "compare_age",
    circuit: mockDisclosureAge,
    inputs: {},
  },
  {
    label: "compare_birthdate",
    circuit: mockDisclosureBirthdate,
    inputs: {},
  },
]

export const mockDisclosureProofs: ProofResult[] = [
  {
    proof: "mock-age-proof",
    vkeyHash: "mock-vkey-hash",
    version: "1.0.0",
    name: "compare_age",
    committedInputs: {
      compare_age: { minAge: 25, maxAge: 0, currentDateTimestamp: getNowTimestamp() },
    },
  },
  {
    proof: "mock-birthdate-proof",
    vkeyHash: "mock-vkey-hash",
    version: "1.0.0",
    name: "compare_birthdate",
    committedInputs: {
      compare_birthdate: {
        minDateTimestamp: Math.floor(new Date("1990-01-01").getTime() / 1000),
        maxDateTimestamp: Math.floor(new Date("1990-01-01").getTime() / 1000),
        currentDateTimestamp: getNowTimestamp(),
      },
    },
  },
]

export const mockParams = {
  passport: PASSPORTS.john,
  salt: "0x1234567890abcdef",
  circuitManifest: mockCircuitManifest,
  forceLowMemoryProver: false,
  onProgress: jest.fn(),
  updateSettings: jest.fn(),
  checkRAM: jest.fn().mockResolvedValue({ proceed: true }),
}

export const mockCertificates: PackagedCertificate[] = [mockCSC]

export const mockProofResult: ProofResult = {
  proof: "mock-proof-data",
  vkeyHash: "mock-vkey-hash",
  version: "1.0.0",
  name: "data_check_integrity",
}

export const mockMerkleProof: { root: string; index: number; path: string[] } = {
  root: "mock-merkle-root",
  index: 0,
  path: ["mock-merkle-path"],
}
