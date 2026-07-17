import { ProofGenerationEvent } from "@/context/SettingsContext"
import { OperationTimer } from "@/services/TimingService"
import {
  PassportViewModel,
  CircuitManifest,
  PackagedCircuit,
  PackagedCertificate,
  ProofResult,
  Query,
  CommittedInputs,
  QueryResult,
  DisclosureCircuitName,
  ProofMode,
  QRCodeData,
  FacematchCommittedInputs,
  NullifierType,
  PackagedCertificatesFile,
} from "@zkpassport/utils"
import { AttestationContainer } from "@/services/facematch/facematch"

export interface BaseProofGenerationHandlersParams {
  proofGenerationTimer: OperationTimer
  emitProofGenerationEvent: (event: any) => void
  updateSettings: (settings: any) => Promise<void>
  handleProofGenerationError?: (
    error: any,
    proofType: string,
    passport: PassportViewModel,
  ) => Promise<{ handled: boolean; shouldReturn: boolean }>
  notifyError?: (message: string) => void
}

export interface ProofGenerationHandlersParams {
  accessRequestTimerRef: React.MutableRefObject<OperationTimer | null>
  animateProgress: (from: number, to: number, duration: number) => void
  setLoadingText: (text: string) => void
  getLoadingText: (circuitName: DisclosureCircuitName, credentialsRequest: QRCodeData) => string
  getBaseProofProgressShare: () => number
  credentialsRequest: any
  notifyError: (message: string) => void
  setProgress: (progress: number) => void
  settings: {
    generatingBaseSubproofs?: boolean
    currentProofGenerationProgress?: ProofGenerationEvent
  }
  t: (key: string, options?: any) => string
}

export type Stage =
  | "outer_circuit_inputs_generation"
  | "disclosure_proof_start"
  | "disclosure_proof_complete"
  | "disclosure_proof_error"
  | "cloud_prover_start"
  | "cloud_prover_complete"

export enum StageEnum {
  Start = "start",
  Complete = "complete",
  Error = "error",
  BaseSubproofGeneration = "base_subproof_generation",
  DisclosureProof = "disclosure_proof", // damn why are these so similar :(
  DisclosureProofs = "disclosure_proofs",
  DisclosureProofStart = "disclosure_proof_start",
  DisclosureProofComplete = "disclosure_proof_complete",
  DisclosureProofError = "disclosure_proof_error",
  CloudProverStart = "cloud_prover_start",
  CloudProverComplete = "cloud_prover_complete",
  CloudProverRequest = "cloud_prover_request",
  AccessRequest = "access_request",
  OuterCircuitInputsGeneration = "outer_circuit_inputs_generation",
  OuterCompression = "outer_compression",
  IntegrityCheckRegeneration = "integrity_check_regeneration",
  FaceMatch = "face_match",
}

export type DisclosureFactory = (
  disclosureProofCountRef: { current: number },
  succeededCircuits: string[],
  failedCircuits: { name: string; error: string }[],
  credentialsRequest: QRCodeData,
) => (stage: Extract<Stage, `disclosure_${string}`>, details: any) => void

export type OuterProofFactory = (
  attemptedCircuits: string[],
  credentialsRequest: QRCodeData,
) => (stage: Extract<Stage, `cloud_${string}`>, details: any) => void

export enum TimingEvents {
  BaseSubproof = "base_subproof_generation",
  IntegrityCheckRegeneration = "integrity_check_regeneration",
  CloudProverStart = "cloud_prover_start",
  CloudProverComplete = "cloud_prover_complete",
  DisclosureProofStart = "disclosure_proof_start",
  DisclosureProofComplete = "disclosure_proof_complete",
  OuterCircuitInputsGeneration = "outer_circuit_inputs_generation",
  OprfAuthProofsStart = "oprf_auth_proofs_start",
  OprfAuthProofsComplete = "oprf_auth_proofs_complete",
  OprfServerRequestStart = "oprf_server_request_start",
  OprfServerRequestComplete = "oprf_server_request_complete",
}

export type CloudProverMode = "compressed" | "compressed-evm"

export enum ProofModeEnum {
  Compressed = "compressed",
  CompressedEvm = "compressed-evm",
  Fast = "fast",
}

export enum ProofNames {
  DSC = "dsc_circuit",
  ID = "id_data_circuit",
  Integrity = "integrity_check_circuit",
  DataIntegrity = "data_check_integrity",
  SigCheckDsc = "sig_check_dsc",
  SigCheckIdData = "sig_check_id_data",
  Outer = "outer_circuit",
  Disclosure = "disclosure_circuit",
}

export enum DisclosureProofErrors {
  DisclosureProofError = "DISCLOSURE_PROOF_ERROR",
  UnknownProofMode = "UNKNOWN_PROOF_MODE",
  CriteriaNotMet = "CRITERIA_NOT_MET_FOR_THIS_PROOF",
  FailedToGetDisclosureCircuits = "FAILED_TO_GET_DISCLOSURE_CIRCUITS",
  ProofGenerationFailed = "DISCLOSURE_PROOF_GENERATION_FAILED",
}

export enum OuterProofErrors {
  OuterCircuitNotFound = "OUTER_CIRCUIT_NOT_FOUND",
  FailedToGenerateMerkleProof = "FAILED_TO_GENERATE_MERKLE_PROOF",
  FailedToGetProofData = "FAILED_TO_GET_PROOF_DATA",
  FailedToGetOuterCircuitInputs = "FAILED_TO_GET_OUTER_CIRCUIT_INPUTS",
}

export enum DisclosureErrors {
  DisclosureCircuitNotFound = "DISCLOSURE_CIRCUIT_NOT_FOUND",
  DisclosureProofError = "DISCLOSURE_PROOF_ERROR",
}

export enum DSCErrors {
  CSCNotFound = "CSC_NOT_FOUND",
  CSCNotSupported = "CSC_NOT_SUPPORTED",
  DSCCircuitNotFound = "DSC_CIRCUIT_NOT_FOUND",
  DSCCircuitNotFoundDetails = "Circuit not found in manifest",
  FailedInputs = "Failed to generate DSC circuit inputs",
  NoCscForDsc = "CSC not found for DSC circuit",
  MemoryTooLow = "Memory too low",
  CircuitSetupFailed = "DSC circuit setup failed",
  ProofGenerationFailed = "DSC proof generation failed",
  DSCCircuitInputsFailed = "getDSCCircuitInputs failed silenty",
}

export enum IDCheckErrors {
  IDDataCircuitNotFound = "ID_DATA_CIRCUIT_NOT_FOUND",
  IDDataCircuitNotFoundDetails = "Circuit not found in manifest",
  ProofGenerationFailed = "ID data proof generation failed",
  CircuitSetupFailed = "ID data circuit setup failed",
  FailedInputs = "Failed to generate ID data circuit inputs",
}

export enum IntegrityErrors {
  IntegrityCircuitNotFound = "INTEGRITY_CIRCUIT_NOT_FOUND",
  IntegrityCircuitNotFoundDetails = "Circuit not found in manifest",
  ExpirationCheckFailed = "Error checking integrity proof expiration",
  ProofGenerationFailed = "Integrity proof generation failed",
  FailedInputs = "Failed to generate integrity check circuit inputs",
  CircuitSetupFailed = "Integrity check circuit setup failed",
}

export enum onProgressEvents {
  Start = "start",
  Complete = "complete",
}

export enum ProofIndex {
  DSC = 1,
  ID = 2,
  Integrity = 3,
  Total = 3,
}

export interface CredentialsRequest {
  mode: ProofModeEnum | ProofMode
  query: Query
  domain?: string
  service?: {
    cloudProverUrl?: string
    chainId?: number
    scope?: string
  }
}

export interface DisclosureProofParams extends getDisclosureProofParams {
  baseSubproofs: ProofResult[]
  credentialsRequest: QRCodeData
  circuitVersion: string
  facematchAttestation?: AttestationContainer
  onProofGenerated?: (proof: ProofResult) => Promise<void>
  canGenerateProofForCircuit?: (
    circuitName: DisclosureCircuitName,
    queryResults: QueryResult,
  ) => boolean
  queryResults?: QueryResult
  onNestedOperation?: (operation: string, subOperation: string, isEnd?: boolean) => void
}

export interface getDisclosureProofParams extends ProofGenerationParams {
  query: Query // credential request.query
  domainName?: string
  chainId?: number
  scope?: string
  evm?: boolean
  facematchAttestation?: AttestationContainer
  nullifierType?: NullifierType | null
  oprfAuthProofs?: ProofResult[]
  oprfBeta?: bigint
  oprfPrivateNullifier?: bigint
  oprfKeyId?: string | null
}

export interface ProofGenerationParams {
  passport: PassportViewModel
  circuitManifest: CircuitManifest
  salt: string
  devMode?: boolean
  forceLowMemoryProver?: boolean
  onProgress?: (stage: string, details?: any) => void
  checkRAM?: () => Promise<{ proceed: boolean }>
  updateSettings?: (settings: any) => Promise<void>
  regenerationTimestamp?: number
}

export interface MultiDisclosureProofResult {
  baseSubproofs: ProofResult[]
  disclosureProofs: DisclosureProofResult[]
  disclosureCircuits: DisclosureCircuitResult[]
  outerProof?: ProofResult
  attemptedCircuits: string[]
  currentCircuit?: string
}

export interface CircuitProofParams {
  circuit: PackagedCircuit
  circuitInputs: any
  proofIndex: number
}

export interface CSCVerificationResult {
  csc: PackagedCertificate
  packagedCerts: PackagedCertificatesFile
  isSupported: boolean
}

export interface DisclosureCircuitResult {
  label: string
  circuit: PackagedCircuit
  inputs: any
}

export interface DisclosureProofResult extends ProofResult {
  committedInputs?: { [key: string]: CommittedInputs | FacematchCommittedInputs }
}

export interface OuterProofParams {
  baseSubproofs: ProofResult[]
  disclosureProofs: DisclosureProofResult[]
  disclosureCircuits: DisclosureCircuitResult[]
  passport: PassportViewModel
  circuitManifest: CircuitManifest
  cloudProverUrl?: string
  mode: "compressed" | "compressed-evm"
  devMode?: boolean
  onProgress?: (stage: string, details?: any) => void
}

export interface CloudProverResponse {
  proof: string
  public_inputs: string
}

export interface CloudProverRequest {
  bb_version: string
  vkey: string
  circuit_root: string
  circuit_name: string
  inputs: any
  recursive: boolean
  evm: boolean
  disable_zk: boolean
  circuit: {
    bytecode: string
    abi: any // Circuit ABI object
    hash: number
  }
}

export interface ValidateAndRegenerateParams extends ProofGenerationParams {
  circuitVersion: string
  attemptedCircuits?: string[]
  onNestedOperation?: (operation: string, subOperation: string, isEnd?: boolean) => void
  activePassport?: string
}

export interface PrepareOuterCircuitProofParams {
  subproof: ProofResult
  circuit: PackagedCircuit
  circuitManifest: CircuitManifest
}
