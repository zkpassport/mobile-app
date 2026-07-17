import {
  PackagedCircuit,
  PassportViewModel,
  CircuitManifest,
  PackagedCertificate,
  getDSCCircuitInputs,
  isCscaSupported,
  getCertificateLeafHash,
  ProofResult,
  getCscaForPassportAsync,
} from "@zkpassport/utils"
import { RegistryClient } from "@zkpassport/registry"
import { getDSCCircuit } from "@/lib/circuit-matcher"
import { setupCircuit, generateProof } from "@/lib/noir"
import { needsLowMemoryProver } from "@/lib"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import {
  ProofGenerationParams,
  CSCVerificationResult,
  DSCErrors,
  onProgressEvents,
  ProofNames,
  ProofIndex,
} from "@/types/ProofService"
import { createMissingCscaError, createUnsupportedPassportError } from "@/lib/errorUtils"

export class DSCProofService {
  private static instance: DSCProofService

  private constructor() {}

  public static getInstance(): DSCProofService {
    if (!DSCProofService.instance) {
      DSCProofService.instance = new DSCProofService()
    }
    return DSCProofService.instance
  }

  /**
   * Wrapper with error handling for the setupCircuit function
   */
  private async setupDSCCircuit(
    circuit: PackagedCircuit,
    forceLowMemoryProver: boolean,
  ): Promise<string> {
    try {
      const circuitId = await setupCircuit(
        circuit,
        needsLowMemoryProver(circuit.size) || forceLowMemoryProver,
      )
      return circuitId as any
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        DSCErrors.CircuitSetupFailed,
        {
          circuit_name: ProofNames.DSC,
          error_details: error,
        },
      )
    }
  }

  /**
   * Verifies and retrieves the CSC (Country Signing Certificate) for the passport
   */
  public async verifyAndGetCSC(
    passport: PassportViewModel,
    chainId: number,
  ): Promise<CSCVerificationResult> {
    const registryClient = new RegistryClient({
      chainId,
    })
    const packagedCerts = await registryClient.getCertificates(undefined, {
      validate: false,
    })
    const csc = await getCscaForPassportAsync(
      passport.sod.certificate,
      packagedCerts.certificates as PackagedCertificate[],
    )
    if (!csc) {
      const error = createMissingCscaError(passport)
      throw error
    }

    const isSupported = isCscaSupported(csc)
    if (!isSupported) {
      const error = createUnsupportedPassportError(DSCErrors.CSCNotSupported)
      throw error
    }

    return { csc, isSupported, packagedCerts }
  }

  private async safeGetDSCCircuitInputs(
    passport: PassportViewModel,
    salt: string,
    packagedCerts: any,
  ): Promise<any> {
    try {
      const dscCircuitInputs = await getDSCCircuitInputs(passport, BigInt(salt), packagedCerts)
      return dscCircuitInputs
    } catch (error: any) {
      // This function either fails silently, or throwns "Could not find CSCA for DSC"
      if (error.message === "Could not find CSCA for DSC") {
        throw new CircuitError(CircuitErrorSubType.ProofGenerationFailed, DSCErrors.NoCscForDsc, {
          circuit_name: ProofNames.DSC,
          error_details: error,
        })
      }
    }
  }

  /**
   * Gets the DSC circuit for the passport
   */
  // no wrapper anymore, was blocking errors
  public async safeGetDSCCircuit(
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
    chainId: number,
  ): Promise<PackagedCircuit> {
    return getDSCCircuit(passport, circuitManifest, chainId)
  }

  /**
   * Prepares DSC circuit inputs by verifying CSC and computing merkle proof
   */
  public async prepareDSCCircuitInputs(
    passport: PassportViewModel,
    salt: string,
    chainId: number,
  ): Promise<any> {
    // Verify CSC
    const { csc, packagedCerts } = await this.verifyAndGetCSC(passport, chainId)

    // Get CSC leaf hash
    const cscaLeaf = await getCertificateLeafHash(csc)

    // Generate circuit inputs
    const dscDataCircuitInputs = await this.safeGetDSCCircuitInputs(passport, salt, packagedCerts)

    if (!dscDataCircuitInputs) {
      // This is when this fails silently and returns undefined
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        DSCErrors.DSCCircuitInputsFailed,
        {
          circuit_name: ProofNames.DSC,
          csca_leaf: cscaLeaf,
        },
      )
    }

    return dscDataCircuitInputs
  }

  private async generateProof(circuitInputs: any, circuitId: string, vkey: string): Promise<any> {
    try {
      const proofResult = await generateProof(circuitInputs, circuitId, vkey)
      return proofResult
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        DSCErrors.ProofGenerationFailed,
        {
          circuit_name: ProofNames.DSC,
          error_details: error,
        },
      )
    }
  }

  /**
   * Generates DSC proof
   */
  public async generateDSCProof(params: ProofGenerationParams): Promise<ProofResult> {
    const {
      passport,
      salt,
      circuitManifest,
      forceLowMemoryProver = false,
      onProgress,
      checkRAM,
      updateSettings,
      devMode,
    } = params

    // Get DSC circuit
    const chainId = devMode ? 11155111 : 1
    const dscDataCircuit = await this.safeGetDSCCircuit(passport, circuitManifest, chainId)

    // Prepare circuit inputs
    const dscDataCircuitInputs = await this.prepareDSCCircuitInputs(passport, salt, chainId)

    // Update progress
    if (updateSettings) {
      await updateSettings({
        generatingBaseSubproofs: true,
        circuitBeingProven: dscDataCircuit.name,
      })
    }

    // Emit start event
    if (onProgress) {
      onProgress(onProgressEvents.Start, {
        circuitName: dscDataCircuit.name,
        circuitSize: dscDataCircuit.size,
        stage: onProgressEvents.Start,
        proofIndex: 1,
        totalProofs: 3,
      })
    }

    // Check RAM if provided
    if (checkRAM) {
      const { proceed } = await checkRAM()
      if (!proceed) {
        if (updateSettings) {
          await updateSettings({
            memoryTooLow: true,
            generatingBaseSubproofs: false,
            startedGeneratingBaseSubproofsAt: 0,
            circuitBeingProven: "",
          })
        }
        throw new Error(DSCErrors.MemoryTooLow)
      }
    }

    const dscCircuitId = await this.setupDSCCircuit(dscDataCircuit, forceLowMemoryProver)

    const proofResult = await this.generateProof(
      dscDataCircuitInputs,
      dscCircuitId,
      dscDataCircuit.vkey,
    )

    // Emit complete event
    if (onProgress) {
      onProgress(onProgressEvents.Complete, {
        circuitName: dscDataCircuit.name,
        circuitSize: dscDataCircuit.size,
        stage: onProgressEvents.Complete,
        proofIndex: ProofIndex.DSC,
        totalProofs: ProofIndex.Total,
      })
    }

    return {
      proof: proofResult.proofWithPublicInputs,
      vkeyHash: dscDataCircuit.vkey_hash,
      version: circuitManifest.version as `${number}.${number}.${number}`,
      name: dscDataCircuit.name,
    }
  }
}

export default DSCProofService
