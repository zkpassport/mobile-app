import {
  DisclosureCircuitName,
  getNumberOfPublicInputs,
  getProofData,
  PackagedCircuit,
  withRetry,
  NullifierType,
  ProofResult,
  getOprfAuthCircuitInputs,
  randomBlindingFactor,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getNowTimestamp,
} from "@zkpassport/utils"
import {
  getDisclosureCircuits,
  getCommittedInputs,
  getPackagedCircuit,
  getFaceMatchCircuit,
} from "@/lib/circuit-matcher"
import { generateCircuitInputs as generateFacematchCircuitInputs } from "@/services/facematch/circuit-input-generator"
import { setupCircuit, generateProof } from "@/lib/noir"
import { getIntegrityToDisclosureSalts, needsLowMemoryProver } from "@/lib"
import { CLOUD_PROVER_URL } from "@/lib/constants"
import {
  DisclosureProofParams,
  DisclosureCircuitResult,
  DisclosureProofResult,
  MultiDisclosureProofResult,
  ProofModeEnum,
  DisclosureProofErrors,
  CloudProverMode,
  getDisclosureProofParams,
  ProofNames,
  StageEnum,
  TimingEvents,
  CloudProverRequest,
  CloudProverResponse,
} from "@/types/ProofService"
import OuterProofService from "./OuterProofService"
import {
  CircuitError,
  CircuitErrorSubType,
  CommitmentMismatchError,
  SanctionsFailedError,
  ZKPassportError,
} from "@/types/Error"
import { CircuitInputs } from "../facematch/circuit-input-generator"
import { createCloudProverError, getCloudProverErrorSubType } from "@/lib/errorUtils"
import * as Device from "expo-device"

export class DisclosureProofService {
  private static instance: DisclosureProofService
  private outerProofService: OuterProofService

  private constructor() {
    this.outerProofService = OuterProofService.getInstance()
  }

  public static getInstance(): DisclosureProofService {
    if (!DisclosureProofService.instance) {
      DisclosureProofService.instance = new DisclosureProofService()
    }
    return DisclosureProofService.instance
  }

  private checkCommitmentMismatch(
    params: DisclosureProofParams,
    disclosureProofs: DisclosureProofResult[],
  ): void {
    const integrityProof = params.baseSubproofs.find((x) =>
      x.name?.includes("data_check_integrity"),
    )
    if (integrityProof) {
      const integrityProofData = getProofData(
        integrityProof.proof as string,
        getNumberOfPublicInputs("data_check_integrity"),
      )
      const commOutOfIntegrityProof = integrityProofData.publicInputs[1]
      const disclosureProof = getProofData(
        disclosureProofs[0].proof as string,
        getNumberOfPublicInputs(disclosureProofs[0].name as string),
      )
      const commInDisclosureProof = disclosureProof.publicInputs[0]
      if (commOutOfIntegrityProof.replace("0x", "") !== commInDisclosureProof.replace("0x", "")) {
        console.log(
          "Integrity proof needs to be regenerated with new salts. Regenerating all base proofs...",
        )
        // Throws an error which will be caught by the retry, reset cache and regenerate all base proofs
        // which is what we want
        // But if the commitments mismatch is due to something else, we want this error to be thrown
        // after the retry count is exhausted
        throw new CommitmentMismatchError(
          "Commitment mismatch between integrity proof and disclosure proof",
          {
            circuit_name: integrityProof.name as string,
            disclosure_proofs: disclosureProofs.map((proof) => proof.name as string),
            comm_out_of_integrity_proof: commOutOfIntegrityProof,
            comm_in_disclosure_proof: commInDisclosureProof,
          },
        )
      }
    }
  }

  /**
   * Main entry point for generating Disclosure proofs
   */
  public async generateAccessRequestProofs(
    params: DisclosureProofParams,
  ): Promise<MultiDisclosureProofResult> {
    const { credentialsRequest } = params

    // Choose strategy based on mode
    switch (credentialsRequest.mode) {
      case ProofModeEnum.Fast:
        return this.generateFastModeProofs(params)
      case ProofModeEnum.Compressed:
      case ProofModeEnum.CompressedEvm:
        return this.generateCompressedModeProofs(params)
      default:
        throw new Error(`${DisclosureProofErrors.UnknownProofMode}: ${credentialsRequest.mode}`)
    }
  }

  /**
   * Fast mode: Generate and send proofs immediately without compression
   */
  private async generateFastModeProofs(
    params: DisclosureProofParams,
  ): Promise<MultiDisclosureProofResult> {
    const attemptedCircuits: string[] = []

    // Send base subproofs immediately in fast mode
    if (params.onProofGenerated) {
      for (const subproof of params.baseSubproofs) {
        await params.onProofGenerated({
          ...subproof,
          version: params.circuitVersion as `${number}.${number}.${number}`,
        })
      }
    }

    // Step 0: Generate OPRF auth proofs if salted nullifier is requested
    const nullifierType = params.credentialsRequest?.uniqueIdentifierType
    const isSaltedNullifier = nullifierType === NullifierType.SALTED

    let oprfAuthProofs: ProofResult[] | undefined
    let oprfBeta: bigint | undefined
    let oprfPrivateNullifier: bigint | undefined
    if (isSaltedNullifier) {
      try {
        params.onProgress?.(TimingEvents.OprfAuthProofsStart)
        const oprfAuth = await this.generateOprfAuthProofs(params)
        params.onProgress?.(TimingEvents.OprfAuthProofsComplete)
        oprfAuthProofs = oprfAuth.oprfAuthProofs
        oprfBeta = oprfAuth.beta
        oprfPrivateNullifier = oprfAuth.privateNullifier
      } catch (error) {
        console.log("OPRF auth proof generation failed:", error)
        throw error
      }
    }

    // Step 1: Get disclosure circuits
    // has its own error handling
    const disclosureCircuits = await this.safeGetDisclosureCircuits({
      ...params,
      domainName: params.credentialsRequest.domain ?? undefined,
      chainId: params.credentialsRequest.service?.chainId,
      scope: params.credentialsRequest.service?.scope,
      evm: params.credentialsRequest.mode === ProofModeEnum.CompressedEvm,
      nullifierType: params.credentialsRequest?.uniqueIdentifierType,
      oprfAuthProofs,
      oprfBeta,
      oprfPrivateNullifier,
      oprfKeyId: params.credentialsRequest?.oprfKeyId,
    })

    // Track attempted circuits
    for (const circuit of disclosureCircuits) {
      if (circuit.circuit.name && !attemptedCircuits.includes(circuit.circuit.name)) {
        attemptedCircuits.push(circuit.circuit.name)
      }
    }

    // Step 2: Generate disclosure proofs (allow partial successes)
    const disclosureProofs = await this.generateDisclosureProofs({
      ...params,
      domainName: params.credentialsRequest.domain ?? undefined,
      chainId: params.credentialsRequest.service?.chainId,
      scope: params.credentialsRequest.service?.scope,
      evm: params.credentialsRequest.mode === ProofModeEnum.CompressedEvm,
      nullifierType: params.credentialsRequest?.uniqueIdentifierType,
      oprfAuthProofs,
      oprfBeta,
      oprfPrivateNullifier,
      oprfKeyId: params.credentialsRequest?.oprfKeyId,
    })

    // Check for commitment mismatch and regenerate all base proofs if necessary
    this.checkCommitmentMismatch(params, disclosureProofs)

    // Emit any successfully generated disclosure proofs
    if (params.onProofGenerated) {
      for (const proof of disclosureProofs) {
        await params.onProofGenerated({
          ...proof,
          version: params.circuitVersion as `${number}.${number}.${number}`,
        })
      }
    }

    return {
      baseSubproofs: params.baseSubproofs,
      disclosureProofs,
      disclosureCircuits,
      attemptedCircuits,
    }
  }

  /**
   * Compressed mode: Generate all proofs, then compress with outer proof
   */
  private async generateCompressedModeProofs(
    params: DisclosureProofParams,
  ): Promise<MultiDisclosureProofResult> {
    const attemptedCircuits: string[] = []

    // Step 1: Generate OPRF auth proofs if salted nullifier is requested
    const compressedNullifierType = params.credentialsRequest?.uniqueIdentifierType
    const compressedIsSalted = compressedNullifierType === NullifierType.SALTED

    let compressedOprfAuthProofs: ProofResult[] | undefined
    let compressedOprfBeta: bigint | undefined
    let compressedOprfPrivateNullifier: bigint | undefined
    if (compressedIsSalted) {
      params.onProgress?.(TimingEvents.OprfAuthProofsStart)
      const oprfAuth = await this.generateOprfAuthProofs(params)
      params.onProgress?.(TimingEvents.OprfAuthProofsComplete)
      compressedOprfAuthProofs = oprfAuth.oprfAuthProofs
      compressedOprfBeta = oprfAuth.beta
      compressedOprfPrivateNullifier = oprfAuth.privateNullifier
    }

    // Step 2: Get disclosure circuits
    const disclosureCircuits = await this.safeGetDisclosureCircuits({
      ...params,
      domainName: params.credentialsRequest.domain ?? undefined,
      chainId: params.credentialsRequest.service?.chainId,
      scope: params.credentialsRequest.service?.scope,
      evm: params.credentialsRequest.mode === ProofModeEnum.CompressedEvm,
      nullifierType: params.credentialsRequest?.uniqueIdentifierType,
      oprfAuthProofs: compressedOprfAuthProofs,
      oprfBeta: compressedOprfBeta,
      oprfPrivateNullifier: compressedOprfPrivateNullifier,
    })

    // Track attempted circuits
    for (const circuit of disclosureCircuits) {
      if (circuit.circuit.name && !attemptedCircuits.includes(circuit.circuit.name)) {
        attemptedCircuits.push(circuit.circuit.name)
      }
    }

    // Step 3: Generate disclosure proofs
    const disclosureProofs = await this.generateDisclosureProofs({
      ...params,
      domainName: params.credentialsRequest.domain ?? undefined,
      chainId: params.credentialsRequest.service?.chainId,
      scope: params.credentialsRequest.service?.scope,
      evm: params.credentialsRequest.mode === ProofModeEnum.CompressedEvm,
      nullifierType: params.credentialsRequest?.uniqueIdentifierType,
      oprfAuthProofs: compressedOprfAuthProofs,
      oprfBeta: compressedOprfBeta,
      oprfPrivateNullifier: compressedOprfPrivateNullifier,
    })

    // Check for commitment mismatch and regenerate all base proofs if necessary
    this.checkCommitmentMismatch(params, disclosureProofs)

    // Step 3: Generate outer compression proof
    const outerProof = await this.outerProofService.generateOuterProof({
      baseSubproofs: params.baseSubproofs,
      disclosureProofs,
      disclosureCircuits,
      passport: params.passport,
      circuitManifest: params.circuitManifest,
      cloudProverUrl: params.credentialsRequest.service?.cloudProverUrl ?? CLOUD_PROVER_URL,
      mode: params.credentialsRequest.mode as CloudProverMode,
      devMode: params.credentialsRequest?.devMode ?? false,
      onProgress: params.onProgress,
    })

    // Send only the outer proof in compressed mode
    if (params.onProofGenerated) {
      await params.onProofGenerated(outerProof)
    }

    return {
      baseSubproofs: params.baseSubproofs,
      disclosureProofs,
      disclosureCircuits,
      outerProof,
      attemptedCircuits,
    }
  }

  /**
   * Generates the 5 auth proofs needed for OPRF evaluation:
   * 3 base subproofs + facematch proof + oprf_auth proof.
   * Returns the proofs array and the beta (blinding factor) used for oprf_auth.
   */
  private async generateOprfAuthProofs(
    params: DisclosureProofParams,
  ): Promise<{ oprfAuthProofs: ProofResult[]; beta: bigint; privateNullifier: bigint }> {
    const { passport, circuitManifest, baseSubproofs, facematchAttestation, salt } = params
    const query = params.query ?? params.credentialsRequest?.query
    const domainName = params.domainName ?? params.credentialsRequest?.domain ?? undefined
    const scope = params.scope ?? params.credentialsRequest?.service?.scope

    if (!facematchAttestation) {
      throw new CircuitError(
        CircuitErrorSubType.MissingAttestation,
        "Facematch attestation is required for OPRF auth",
        { circuit_name: "oprf_auth" },
      )
    }

    const integrityToDisclosureSalts = getIntegrityToDisclosureSalts(BigInt(salt))
    const serviceScope = getServiceScopeHash(domainName!)
    const serviceSubScope = getServiceSubscopeHash(scope!)
    const timestamp = getNowTimestamp()

    // 1. Generate facematch proof for OPRF auth
    const facematchInputs = await generateFacematchCircuitInputs(
      facematchAttestation,
      passport,
      query,
      integrityToDisclosureSalts,
      serviceScope,
      serviceSubScope,
      timestamp,
    )
    const facematchCircuit = await getFaceMatchCircuit(circuitManifest, facematchAttestation)
    const facematchCircuitId = await setupCircuit(facematchCircuit, false)
    const facematchProofResult = await generateProof(
      facematchInputs,
      facematchCircuitId,
      facematchCircuit.vkey,
    )
    const facematchCommittedInputs = await getCommittedInputs(
      facematchInputs,
      facematchCircuit.name as DisclosureCircuitName,
      circuitManifest,
    )
    const facematchCommittmentName =
      "facematch" + (facematchCircuit.name.endsWith("_evm") ? "_evm" : "")
    const facematchProof: ProofResult = {
      proof: facematchProofResult.proofWithPublicInputs,
      vkeyHash: facematchCircuit.vkey_hash,
      name: facematchCircuit.name,
      version: circuitManifest.version as `${number}.${number}.${number}`,
      committedInputs: facematchCommittedInputs
        ? { [facematchCommittmentName]: facematchCommittedInputs }
        : undefined,
    }

    // 2. Generate beta and oprf_auth proof
    const beta = randomBlindingFactor()
    const { inputs: oprfAuthInputs, privateNullifier } = await getOprfAuthCircuitInputs(
      passport,
      integrityToDisclosureSalts,
      beta,
    )
    const oprfAuthCircuit = await getPackagedCircuit("oprf_auth", circuitManifest)
    const oprfAuthCircuitId = await setupCircuit(oprfAuthCircuit, false)
    const oprfAuthProofResult = await generateProof(
      oprfAuthInputs,
      oprfAuthCircuitId,
      oprfAuthCircuit.vkey,
    )
    const oprfAuthProof: ProofResult = {
      proof: oprfAuthProofResult.proofWithPublicInputs,
      vkeyHash: oprfAuthCircuit.vkey_hash,
      name: oprfAuthCircuit.name,
      version: circuitManifest.version as `${number}.${number}.${number}`,
    }

    // 3. Combine: 3 base + facematch + oprf_auth
    const oprfAuthProofs: ProofResult[] = [...baseSubproofs, facematchProof, oprfAuthProof]

    return { oprfAuthProofs, beta, privateNullifier }
  }

  /**
   * Gets disclosure circuits based on the query
   */
  public async safeGetDisclosureCircuits(
    params: getDisclosureProofParams,
  ): Promise<DisclosureCircuitResult[]> {
    const {
      passport,
      query,
      salt,
      circuitManifest,
      domainName,
      scope,
      evm,
      facematchAttestation,
      nullifierType,
      oprfAuthProofs,
      oprfBeta,
      oprfPrivateNullifier,
      oprfKeyId,
    } = params

    const effectiveNullifierType = nullifierType

    try {
      const disclosureCircuits = await getDisclosureCircuits(
        passport,
        query,
        BigInt(salt),
        circuitManifest,
        domainName,
        scope,
        evm,
        facematchAttestation,
        effectiveNullifierType,
        oprfAuthProofs,
        oprfBeta,
        oprfPrivateNullifier,
        oprfKeyId,
        params.onProgress,
      )
      return disclosureCircuits
    } catch (error) {
      if (error instanceof SanctionsFailedError) {
        throw error
      }
      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        DisclosureProofErrors.FailedToGetDisclosureCircuits,
        {
          circuit_name: ProofNames.Disclosure,
          error_details: error,
        },
      )
    }
  }

  // This is repeated in all of the services, its just to get the correct error type
  private async safeGenerateProof(
    circuitName: string,
    inputs: any,
    circuitId: string,
    vkey: string,
  ): Promise<any> {
    try {
      const proofResult = await generateProof(inputs, circuitId, vkey)
      return proofResult
    } catch (error) {
      if (circuitName.startsWith("facematch")) {
        // make sure the type is CircuitInputs from facematch/circuit-input-generator.ts
        const circuitInputs = inputs as CircuitInputs
        const facematchMetadata = {
          environment: circuitInputs.environment,
          facematch_mode: circuitInputs.facematch_mode,
          app_id: circuitInputs.app_id,
          client_data: circuitInputs.client_data,
          auth_data: circuitInputs.auth_data,
          root_key: circuitInputs.root_key,
          intermediate_sig: circuitInputs.intermediate_sig,
          intermediate_tbs: circuitInputs.intermediate_tbs,
          intermediate_key: circuitInputs.intermediate_key,
          credential_sig: circuitInputs.credential_sig,
          credential_tbs: circuitInputs.credential_tbs,
          client_data_hash: circuitInputs.client_data_hash,
          // Include any additional properties that might be present in the inputs
          ...Object.keys(circuitInputs)
            .filter(
              (key) =>
                key.startsWith("intermediate_") ||
                key.includes("_key_redc_param") ||
                key.includes("credential_key") ||
                key.includes("client_data_sig") ||
                key.includes("integrity_token") ||
                key.includes("play_integrity_public_key") ||
                key === "auth_data" ||
                key === "client_data_hash",
            )
            .reduce((acc, key) => {
              acc[key] = (circuitInputs as any)[key]
              return acc
            }, {} as any),
        }

        throw new CircuitError(
          CircuitErrorSubType.ProofGenerationFailed,
          DisclosureProofErrors.ProofGenerationFailed,
          {
            circuit_name: circuitName,
            error_details: error,
            facematch_metadata: facematchMetadata,
          },
        )
      }

      throw new CircuitError(
        CircuitErrorSubType.ProofGenerationFailed,
        DisclosureProofErrors.ProofGenerationFailed,
        {
          circuit_name: circuitName,
          error_details: error,
        },
      )
    }
  }

  private async useCloudProver(
    cloudProverUrl: string,
    circuit: PackagedCircuit,
    circuitInputs: any,
    circuitRegistryRoot: string,
  ): Promise<CloudProverResponse> {
    const request: CloudProverRequest = {
      bb_version: circuit.bb_version,
      inputs: circuitInputs,
      vkey: circuit.vkey,
      circuit_root: circuitRegistryRoot,
      circuit_name: circuit.name,
      recursive: false,
      evm: false,
      disable_zk: false,
      circuit: {
        bytecode: circuit.bytecode,
        abi: circuit.abi,
        hash: circuit.hash,
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

        // Throw the proper cloud prover error
        throw createCloudProverError(circuit.name, errorSubType, {
          proverUrl: cloudProverUrl,
          responseHeader: response.status + " " + response.statusText,
          responseBody: JSON.stringify(errorResponse),
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

      throw createCloudProverError(circuit.name, errorSubType, {
        proverUrl: cloudProverUrl,
        responseBody: JSON.stringify(error),
      })
    }
  }

  /**
   * Generates a single disclosure proof
   */
  public async generateSingleDisclosureProof(
    params: DisclosureProofParams,
    disclosureCircuit: DisclosureCircuitResult,
    proofIndex: number,
    totalProofs: number,
  ): Promise<DisclosureProofResult> {
    const {
      circuitManifest,
      forceLowMemoryProver = false,
      onProgress,
      canGenerateProofForCircuit,
      queryResults,
    } = params

    const { circuit, inputs, label } = disclosureCircuit

    // Check if criteria are met before attempting to generate proof
    if (
      canGenerateProofForCircuit &&
      queryResults &&
      !canGenerateProofForCircuit(label as DisclosureCircuitName, queryResults)
    ) {
      // Emit error event for criteria not met
      if (onProgress) {
        onProgress(StageEnum.DisclosureProofError, {
          circuitName: circuit.name,
          circuitLabel: label,
          error: "Criteria not met for this proof: " + label,
        })
      }
    }

    // Emit start event
    if (onProgress) {
      onProgress(TimingEvents.DisclosureProofStart, {
        circuitName: circuit.name,
        circuitLabel: label,
        circuitSize: circuit.size,
        proofIndex,
        totalProofs,
      })
    }

    try {
      // First restrict the cloud prover to be only used for circuits that have the sensitive inputs hidden
      // from the prover, i.e. the private nullifier is 0 and the dg1 is an array of 0s
      const canUseCloudProver =
        BigInt(inputs.salted_private_nullifier.value) === BigInt(0) &&
        inputs.salted_dg1.value.every((x: number) => x === 0)
      // Check if the device has less than 3.5GB of RAM, if so, even the low memory prover might struggle to run 2^20 circuits
      const hasLowRAM = (Device.totalMemory ?? 0) < 1024 * 1024 * 1024 * 3.5 // 3GB
      // Use the cloud prover if the circuit is above the subgroup 2^20 (or above 2^19 if the device has less than 3.5GB of RAM)
      // and the sensitive inputs are hidden
      const needsCloudProver =
        canUseCloudProver && (circuit.size >= 1048576 - 50 || (hasLowRAM && circuit.size >= 524288))

      let proofResult: any

      if (needsCloudProver) {
        const { proof, public_inputs } = await this.useCloudProver(
          params.credentialsRequest.service?.cloudProverUrl ?? CLOUD_PROVER_URL,
          circuit,
          inputs,
          params.circuitManifest.root,
        )
        proofResult = {
          proofWithPublicInputs: (public_inputs as string).concat(proof as string),
        }
      } else {
        // Setup circuit
        const circuitId = await setupCircuit(
          circuit,
          needsLowMemoryProver(circuit.size) || forceLowMemoryProver,
        )

        // Generate proof
        proofResult = await this.safeGenerateProof(circuit.name, inputs, circuitId, circuit.vkey)
      }

      // Get committed inputs for disclosure proofs
      const committedInput = await getCommittedInputs(
        inputs,
        circuit.name as DisclosureCircuitName,
        circuitManifest,
      )

      // Commitment fields are strongly typed, so better stick to a static name
      const committmentName = circuit.name.startsWith("facematch")
        ? "facematch" + (circuit.name.endsWith("_evm") ? "_evm" : "")
        : circuit.name

      const committedInputs = committedInput
        ? {
            [committmentName]: committedInput,
          }
        : {}

      // Emit complete event
      if (onProgress) {
        onProgress(TimingEvents.DisclosureProofComplete, {
          circuitName: circuit.name,
          circuitLabel: label,
          proofIndex,
          totalProofs,
        })
      }

      return {
        proof: proofResult.proofWithPublicInputs,
        vkeyHash: circuit.vkey_hash,
        version: circuitManifest.version as `${number}.${number}.${number}`,
        name: circuit.name,
        committedInputs,
      }
    } catch (error) {
      // Emit error event
      if (onProgress) {
        onProgress(StageEnum.DisclosureProofError, {
          circuitName: circuit.name,
          circuitLabel: label,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      throw error
    }
  }

  /**
   * Generates all disclosure proofs based on the query
   */
  public async generateDisclosureProofs(
    params: DisclosureProofParams,
  ): Promise<DisclosureProofResult[]> {
    const disclosureCircuits = await this.safeGetDisclosureCircuits({
      ...params,
      domainName: params.domainName ?? params.credentialsRequest?.domain ?? undefined,
      chainId: params.chainId ?? params.credentialsRequest?.service?.chainId,
      scope: params.scope ?? params.credentialsRequest?.service?.scope,
      evm: params.evm ?? params.credentialsRequest?.mode === ProofModeEnum.CompressedEvm,
      nullifierType: params.nullifierType ?? params.credentialsRequest?.uniqueIdentifierType,
      oprfKeyId: params.oprfKeyId ?? params.credentialsRequest?.oprfKeyId,
    })
    const disclosureProofs: DisclosureProofResult[] = []

    for (let i = 0; i < disclosureCircuits.length; i++) {
      const circuit = disclosureCircuits[i]
      const proof = await this.generateSingleDisclosureProof(
        params,
        circuit,
        i + 1,
        disclosureCircuits.length,
      )
      disclosureProofs.push(proof)
    }

    return disclosureProofs
  }
}

export default DisclosureProofService
