import {
  PackagedCircuit,
  PassportViewModel,
  CircuitManifest,
  getIDDataCircuitInputs,
  ProofResult,
} from "@zkpassport/utils"
import { getIDDataCircuit } from "@/lib/circuit-matcher"
import { setupCircuit, generateProof } from "@/lib/noir"
import { needsLowMemoryProver } from "@/lib"
import { CircuitError, CircuitErrorSubType } from "@/types/Error"
import {
  IDCheckErrors,
  onProgressEvents,
  ProofGenerationParams,
  ProofIndex,
  ProofNames,
} from "@/types/ProofService"

export class IDCheckProofService {
  private static instance: IDCheckProofService

  private constructor() {}

  public static getInstance(): IDCheckProofService {
    if (!IDCheckProofService.instance) {
      IDCheckProofService.instance = new IDCheckProofService()
    }
    return IDCheckProofService.instance
  }

  /**
   * Gets the ID data circuit for the passport
   */
  public async safeGetIDDataCircuit(
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
  ): Promise<PackagedCircuit> {
    const circuit = await getIDDataCircuit(passport, circuitManifest)
    if (!circuit) {
      throw new CircuitError(
        CircuitErrorSubType.CircuitNotFound,
        IDCheckErrors.IDDataCircuitNotFound,
        {
          // TODO: do we need more context
          circuit_name: ProofNames.ID,
          error_details: IDCheckErrors.IDDataCircuitNotFoundDetails,
        },
      )
    }
    return circuit
  }

  private async setupIDDataCircuit(
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
        IDCheckErrors.CircuitSetupFailed,
        {
          circuit_name: ProofNames.ID,
          error_details: error,
        },
      )
    }
  }

  private async safeGetIDDataCircuitInputs(
    passport: PassportViewModel,
    salt: string,
  ): Promise<any> {
    try {
      const idDataCircuitInputs = await getIDDataCircuitInputs(
        passport as any,
        BigInt(salt),
        BigInt(salt),
      )
      return idDataCircuitInputs
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        IDCheckErrors.FailedInputs,
        {
          circuit_name: ProofNames.ID,
          error_details: error,
        },
      )
    }
  }

  private async safeGenerateProof(
    circuitInputs: any,
    circuitId: string,
    vkey: string,
  ): Promise<any> {
    try {
      const proofResult = await generateProof(circuitInputs, circuitId, vkey)
      return proofResult
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        IDCheckErrors.ProofGenerationFailed,
        {
          circuit_name: ProofNames.ID,
          error_details: error,
        },
      )
    }
  }

  /**
   * Generates ID data proof
   */
  public async generateIDDataProof(params: ProofGenerationParams): Promise<ProofResult> {
    const {
      passport,
      salt,
      circuitManifest,
      forceLowMemoryProver = false,
      onProgress,
      updateSettings,
    } = params

    // Get ID data circuit
    const idDataCircuit = await this.safeGetIDDataCircuit(passport, circuitManifest)

    // Update progress
    if (updateSettings) {
      await updateSettings({
        generatingBaseSubproofs: true,
        circuitBeingProven: idDataCircuit.name,
      })
    }

    // This is where the timer logic would start
    // Emit start event
    if (onProgress) {
      onProgress(onProgressEvents.Start, {
        circuitName: idDataCircuit.name,
        circuitSize: idDataCircuit.size,
        stage: onProgressEvents.Start,
        proofIndex: 2,
        totalProofs: 3,
      })
    }

    // Setup circuit (errors propagate as-is)
    const idDataCircuitId = await this.setupIDDataCircuit(idDataCircuit, forceLowMemoryProver)

    // Generate circuit inputs (errors propagate as-is)
    const idDataCircuitInputs = await this.safeGetIDDataCircuitInputs(passport, salt)

    const proofResult = await this.safeGenerateProof(
      idDataCircuitInputs as any,
      idDataCircuitId,
      idDataCircuit.vkey,
    )

    // Emit complete event
    if (onProgress) {
      onProgress(onProgressEvents.Complete, {
        circuitName: idDataCircuit.name,
        circuitSize: idDataCircuit.size,
        stage: onProgressEvents.Complete,
        proofIndex: ProofIndex.ID,
        totalProofs: ProofIndex.Total,
      })
    }

    // Return the proof result to push in the baseSubproofs array
    return {
      proof: proofResult.proofWithPublicInputs,
      vkeyHash: idDataCircuit.vkey_hash,
      version: circuitManifest.version as `${number}.${number}.${number}`,
      name: idDataCircuit.name,
    }
  }
}

export default IDCheckProofService
