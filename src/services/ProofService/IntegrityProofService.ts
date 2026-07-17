import {
  PackagedCircuit,
  PassportViewModel,
  CircuitManifest,
  getIntegrityCheckCircuitInputs,
  ProofResult,
} from "@zkpassport/utils"
import { getIntegrityCheckCircuit } from "@/lib/circuit-matcher"
import { setupCircuit, generateProof } from "@/lib/noir"
import { getIntegrityToDisclosureSalts, needsLowMemoryProver } from "@/lib"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import {
  IntegrityErrors,
  onProgressEvents,
  ProofGenerationParams,
  ProofIndex,
  ProofNames,
} from "@/types/ProofService"

export class IntegrityProofService {
  private static instance: IntegrityProofService

  private constructor() {}

  public static getInstance(): IntegrityProofService {
    if (!IntegrityProofService.instance) {
      IntegrityProofService.instance = new IntegrityProofService()
    }
    return IntegrityProofService.instance
  }

  /**
   * Gets the integrity check circuit for the passport
   */
  public async safeGetIntegrityCheckCircuit(
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
  ): Promise<PackagedCircuit> {
    const circuit = await getIntegrityCheckCircuit(passport, circuitManifest)
    if (!circuit) {
      throw new CircuitError(
        CircuitErrorSubType.CircuitNotFound,
        IntegrityErrors.IntegrityCircuitNotFound,
        {
          circuit_name: ProofNames.Integrity,
          error_details: IntegrityErrors.IntegrityCircuitNotFoundDetails,
        },
      )
    }
    return circuit
  }

  private async setupIntegrityCheckCircuit(
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
        IntegrityErrors.CircuitSetupFailed,
        {
          circuit_name: ProofNames.Integrity,
          error_details: error,
        },
      )
    }
  }

  private async safeGetIntegrityCheckCircuitInputs(
    passport: PassportViewModel,
    salt: bigint,
  ): Promise<any> {
    try {
      // Hash the private salt to get the public salt, so the inputs using the private salt
      // can be hidden from the prover while still being able to compute the commitments
      // between this proof and the disclosure proofs
      const integrityToDisclosureSalts = getIntegrityToDisclosureSalts(salt)
      const integrityCheckCircuitInputs = await getIntegrityCheckCircuitInputs(
        passport as any,
        BigInt(salt),
        integrityToDisclosureSalts,
      )
      return integrityCheckCircuitInputs
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        IntegrityErrors.FailedInputs,
        {
          circuit_name: ProofNames.Integrity,
          error_details: error,
        },
      )
    }
  }

  private async generateProof(circuitInputs: any, circuitId: string, vkey: string): Promise<any> {
    try {
      const proofResult = await generateProof(circuitInputs, circuitId, vkey)
      return proofResult
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        IntegrityErrors.ProofGenerationFailed,
        {
          circuit_name: ProofNames.Integrity,
          error_details: error,
        },
      )
    }
  }

  /**
   * Generates integrity check proof
   */
  public async generateIntegrityCheckProof(params: ProofGenerationParams): Promise<ProofResult> {
    const {
      passport,
      salt,
      circuitManifest,
      forceLowMemoryProver = false,
      onProgress,
      updateSettings,
    } = params

    // Get integrity check circuit
    const integrityCheckCircuit = await this.safeGetIntegrityCheckCircuit(passport, circuitManifest)

    // Update progress
    if (updateSettings) {
      await updateSettings({
        generatingBaseSubproofs: true,
        circuitBeingProven: integrityCheckCircuit.name,
      })
    }

    // Emit start event
    if (onProgress) {
      onProgress(onProgressEvents.Start, {
        circuitName: integrityCheckCircuit.name,
        circuitSize: integrityCheckCircuit.size,
        stage: onProgressEvents.Start,
        proofIndex: ProofIndex.Integrity,
        totalProofs: ProofIndex.Total,
      })
    }

    // Setup circuit
    const integrityCheckCircuitId = await this.setupIntegrityCheckCircuit(
      integrityCheckCircuit,
      forceLowMemoryProver,
    )

    // Generate circuit inputs
    const integrityCheckCircuitInputs = await this.safeGetIntegrityCheckCircuitInputs(
      passport as any,
      BigInt(salt),
    )

    // Generate proof (wrap failures as CircuitError)
    const proofResult = await this.generateProof(
      integrityCheckCircuitInputs as any,
      integrityCheckCircuitId,
      integrityCheckCircuit.vkey,
    )

    // Emit complete event
    if (onProgress) {
      onProgress(onProgressEvents.Complete, {
        circuitName: integrityCheckCircuit.name,
        circuitSize: integrityCheckCircuit.size,
        stage: onProgressEvents.Complete,
        proofIndex: ProofIndex.Integrity,
        totalProofs: ProofIndex.Total,
      })
    }

    // Return the proof result to push in the baseSubproofs array
    return {
      proof: proofResult.proofWithPublicInputs,
      vkeyHash: integrityCheckCircuit.vkey_hash,
      version: circuitManifest.version as `${number}.${number}.${number}`,
      name: integrityCheckCircuit.name,
    }
  }
}

export default IntegrityProofService
