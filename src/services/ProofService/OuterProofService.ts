import {
  PackagedCircuit,
  PassportViewModel,
  CircuitManifest,
  ProofResult,
  OuterCircuitProof,
  getProofData,
  getNumberOfPublicInputs,
  ultraVkToFields,
  getCircuitMerkleProof,
  getOuterCircuitInputs,
  ProofData,
  withRetry,
} from "@zkpassport/utils"
import { getOuterCircuit } from "@/lib/circuit-matcher"
import { computeMerkleProof } from "@/lib/native-operations"
import { CircuitError, CircuitErrorSubType, ZKPassportError } from "@/types/Error"
import {
  createCloudProverError,
  getCloudProverErrorSubType,
  getVkeysAndPublicInputs,
} from "@/lib/errorUtils"
import {
  OuterProofParams,
  CloudProverResponse,
  CloudProverRequest,
  ProofNames,
  CloudProverMode,
  OuterProofErrors,
  DisclosureErrors,
  TimingEvents,
  ProofModeEnum,
} from "@/types/ProofService"
import DSCProofService from "./DSCProofService"
import IDCheckProofService from "./IDCheckProofService"
import IntegrityProofService from "./IntegrityProofService"

export class OuterProofService {
  private static instance: OuterProofService
  private dscProofService: DSCProofService
  private idCheckProofService: IDCheckProofService
  private integrityProofService: IntegrityProofService

  private constructor() {
    this.dscProofService = DSCProofService.getInstance()
    this.idCheckProofService = IDCheckProofService.getInstance()
    this.integrityProofService = IntegrityProofService.getInstance()
  }

  public static getInstance(): OuterProofService {
    if (!OuterProofService.instance) {
      OuterProofService.instance = new OuterProofService()
    }
    return OuterProofService.instance
  }

  private async safeGetCircuitMerkleProof(
    vkeyHash: string,
    circuitManifest: CircuitManifest,
    computeMerkleProofFn: (
      leaves: bigint[],
      index: number,
      height: number,
    ) => Promise<{ root: string; index: number; path: string[] }>,
  ): Promise<{ index: number; path: string[] }> {
    try {
      const { index, path } = await getCircuitMerkleProof(
        vkeyHash,
        circuitManifest,
        computeMerkleProofFn,
      )
      return { index, path }
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        OuterProofErrors.FailedToGenerateMerkleProof,
        {
          circuit_name: ProofNames.Outer,
          error_details: error,
        },
      )
    }
  }

  private async safeGetProofData(subproof: ProofResult): Promise<ProofData> {
    try {
      const proofData = getProofData(
        subproof.proof as string,
        getNumberOfPublicInputs(subproof.name as string),
      )
      return proofData
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        OuterProofErrors.FailedToGetProofData,
        {
          circuit_name: ProofNames.Outer,
          error_details: error,
        },
      )
    }
  }

  /**
   * Prepares outer circuit proof data for a given subproof
   */
  private async prepareOuterCircuitProof(
    subproof: ProofResult,
    circuit: PackagedCircuit,
    circuitManifest: CircuitManifest,
  ): Promise<OuterCircuitProof> {
    const proofData = await this.safeGetProofData(subproof)

    const { index, path } = await this.safeGetCircuitMerkleProof(
      subproof.vkeyHash as string,
      circuitManifest,
      computeMerkleProof,
    )

    return {
      proof: proofData.proof.map((x) => `0x${x}`),
      keyHash: subproof.vkeyHash as unknown as string,
      vkey: ultraVkToFields(Buffer.from(circuit.vkey ?? "", "base64")),
      publicInputs: proofData.publicInputs,
      treeHashPath: path,
      treeIndex: `0x${index.toString(16)}`,
    }
  }

  /**
   * Prepares CSC to DSC outer circuit proof
   */
  private async prepareCscToDscOuterCircuitProof(
    baseSubproofs: ProofResult[],
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
    chainId?: number,
  ): Promise<OuterCircuitProof> {
    const cscToDscSubproof = baseSubproofs.find((x) =>
      x.name?.startsWith(ProofNames.SigCheckDsc),
    ) as ProofResult
    const cscToDscCircuit = await this.dscProofService.safeGetDSCCircuit(
      passport,
      circuitManifest,
      chainId,
    )
    return await this.prepareOuterCircuitProof(cscToDscSubproof, cscToDscCircuit, circuitManifest)
  }

  /**
   * Prepares DSC to ID outer circuit proof
   */
  private async prepareDscToIdOuterCircuitProof(
    baseSubproofs: ProofResult[],
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
  ): Promise<OuterCircuitProof> {
    const dscToIdSubproof = baseSubproofs.find((x) =>
      x.name?.startsWith(ProofNames.SigCheckIdData),
    ) as ProofResult
    const dscToIdCircuit = await this.idCheckProofService.safeGetIDDataCircuit(
      passport,
      circuitManifest,
    )
    return await this.prepareOuterCircuitProof(dscToIdSubproof, dscToIdCircuit, circuitManifest)
  }

  /**
   * Prepares integrity check outer circuit proof
   */
  private async prepareIntegrityCheckOuterCircuitProof(
    baseSubproofs: ProofResult[],
    passport: PassportViewModel,
    circuitManifest: CircuitManifest,
  ): Promise<OuterCircuitProof> {
    const integrityCheckSubproof = baseSubproofs.find((x) =>
      x.name?.startsWith(ProofNames.DataIntegrity),
    ) as ProofResult
    const integrityCheckCircuit = await this.integrityProofService.safeGetIntegrityCheckCircuit(
      passport,
      circuitManifest,
    )
    return await this.prepareOuterCircuitProof(
      integrityCheckSubproof,
      integrityCheckCircuit,
      circuitManifest,
    )
  }

  private async useCloudProver(
    cloudProverUrl: string,
    outerCircuit: PackagedCircuit,
    outerCircuitInputs: any,
    mode: CloudProverMode,
  ): Promise<CloudProverResponse> {
    const request: CloudProverRequest = {
      bb_version: outerCircuit.bb_version,
      inputs: outerCircuitInputs,
      vkey: outerCircuit.vkey,
      circuit_root: outerCircuitInputs.circuit_registry_root,
      circuit_name: outerCircuit.name,
      recursive: mode === ProofModeEnum.Compressed,
      evm: mode === ProofModeEnum.CompressedEvm,
      disable_zk: mode === ProofModeEnum.CompressedEvm,
      circuit: {
        bytecode: outerCircuit.bytecode,
        abi: outerCircuit.abi,
        hash: outerCircuit.hash,
      },
    }

    try {
      const response = await withRetry(
        () =>
          fetch(`${cloudProverUrl}/prove`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
          }),
        3,
      )

      if (!response.ok) {
        const errorResponse = await response.json()
        console.log("Error calling cloud prover: " + JSON.stringify(errorResponse))
        const errorSubType = getCloudProverErrorSubType(errorResponse)
        // Get commitments for the cloud prover error
        const commitments = getVkeysAndPublicInputs(outerCircuitInputs)

        // Throw the proper cloud prover error
        throw createCloudProverError(outerCircuit.name, errorSubType, {
          proverUrl: cloudProverUrl,
          responseHeader: response.status + " " + response.statusText,
          responseBody: JSON.stringify(errorResponse),
          vkeys: commitments?.vkeys,
          publicInputs: commitments?.publicInputs,
        })
      }

      return (await response.json()) as CloudProverResponse
    } catch (error) {
      // If this is already a ZKPassportError (like from the !response.ok case above), re-throw it
      if (error instanceof ZKPassportError) {
        throw error
      }

      // Otherwise, handle network/fetch failures
      console.log(
        "Error calling cloud prover for outer circuit compression: " +
          error +
          "\nProver URL: " +
          cloudProverUrl,
      )

      // Determine error subtype based on error message
      const errorSubType = getCloudProverErrorSubType(error)
      // Get commitments for error context
      const commitments = getVkeysAndPublicInputs(outerCircuitInputs)

      throw createCloudProverError(outerCircuit.name, errorSubType, {
        proverUrl: cloudProverUrl,
        responseBody: JSON.stringify(error),
        vkeys: commitments?.vkeys,
        publicInputs: commitments?.publicInputs,
      })
    }
  }

  private async getOuterCircuit(
    disclosureProofsLength: number,
    circuitManifest: CircuitManifest,
    evm = false,
  ): Promise<PackagedCircuit> {
    const outerCircuit = await getOuterCircuit(disclosureProofsLength, circuitManifest, evm)
    if (!outerCircuit) {
      throw new CircuitError(
        CircuitErrorSubType.CircuitNotFound,
        OuterProofErrors.OuterCircuitNotFound,
        {
          circuit_name: ProofNames.Outer,
          error_details: OuterProofErrors.OuterCircuitNotFound,
          expected_size: disclosureProofsLength,
        },
      )
    }
    return outerCircuit
  }

  private async getOuterCircuitInputs(
    cscToDscOuterCircuitProof: OuterCircuitProof,
    dscToIdOuterCircuitProof: OuterCircuitProof,
    integrityCheckOuterCircuitProof: OuterCircuitProof,
    disclosureOuterCircuitProofs: OuterCircuitProof[],
    circuitManifestRoot: string,
  ): Promise<any> {
    try {
      const outerCircuitInputs = await getOuterCircuitInputs(
        cscToDscOuterCircuitProof,
        dscToIdOuterCircuitProof,
        integrityCheckOuterCircuitProof,
        disclosureOuterCircuitProofs,
        circuitManifestRoot,
      )
      return outerCircuitInputs
    } catch (error) {
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        OuterProofErrors.FailedToGetOuterCircuitInputs,
        {
          circuit_name: ProofNames.Outer,
          error_details: error,
        },
      )
    }
  }

  /**
   * Generates outer compression proof using cloud prover
   */
  public async generateOuterProof(params: OuterProofParams): Promise<ProofResult> {
    const {
      baseSubproofs,
      disclosureProofs,
      disclosureCircuits,
      passport,
      circuitManifest,
      cloudProverUrl,
      mode,
      devMode,
      onProgress,
    } = params

    const chainId = devMode ? 11155111 : 1

    // Get outer circuit
    const outerCircuit = await this.getOuterCircuit(
      disclosureProofs.length,
      circuitManifest,
      mode === ProofModeEnum.CompressedEvm,
    )

    if (onProgress) {
      onProgress(TimingEvents.OuterCircuitInputsGeneration, { circuitName: outerCircuit.name })
    }

    // Prepare base subproofs for outer circuit
    const cscToDscOuterCircuitProof = await this.prepareCscToDscOuterCircuitProof(
      baseSubproofs,
      passport,
      circuitManifest,
      chainId,
    )

    const dscToIdOuterCircuitProof = await this.prepareDscToIdOuterCircuitProof(
      baseSubproofs,
      passport,
      circuitManifest,
    )

    const integrityCheckOuterCircuitProof = await this.prepareIntegrityCheckOuterCircuitProof(
      baseSubproofs,
      passport,
      circuitManifest,
    )

    // Prepare disclosure outer circuit proofs
    const disclosureOuterCircuitProofs: OuterCircuitProof[] = []
    for (const proof of disclosureProofs) {
      const disclosureCircuit = disclosureCircuits.find(
        (x) => x.circuit.name === proof.name,
      )?.circuit

      if (!disclosureCircuit) {
        throw new CircuitError(
          CircuitErrorSubType.CircuitNotFound,
          DisclosureErrors.DisclosureCircuitNotFound,
          {
            circuit_name: proof.name as string,
            error_details: DisclosureErrors.DisclosureCircuitNotFound,
          },
        )
      }

      const disclosureOuterCircuitProof = await this.prepareOuterCircuitProof(
        proof,
        disclosureCircuit,
        circuitManifest,
      )
      disclosureOuterCircuitProofs.push(disclosureOuterCircuitProof)
    }

    // Get outer circuit inputs
    const outerCircuitInputs = await this.getOuterCircuitInputs(
      cscToDscOuterCircuitProof,
      dscToIdOuterCircuitProof,
      integrityCheckOuterCircuitProof,
      disclosureOuterCircuitProofs,
      circuitManifest.root,
    )

    // Call cloud prover
    if (onProgress) {
      onProgress(TimingEvents.CloudProverStart, { circuitName: outerCircuit.name })
    }

    const { proof, public_inputs } = await this.useCloudProver(
      cloudProverUrl!,
      outerCircuit,
      outerCircuitInputs,
      mode,
    )

    if (onProgress) {
      onProgress(TimingEvents.CloudProverComplete, { circuitName: outerCircuit.name })
    }

    // Collect committed inputs from disclosure proofs
    const committedInputs = disclosureProofs
      .map((x) => x.committedInputs)
      .reduce((acc, curr) => {
        if (curr) {
          return { ...acc, ...curr }
        }
        return acc
      }, {})

    return {
      proof: (public_inputs as string).concat(proof as string),
      vkeyHash: outerCircuit.vkey_hash,
      name: outerCircuit.name,
      version: circuitManifest.version as `${number}.${number}.${number}`,
      committedInputs,
    }
  }
}

export default OuterProofService
