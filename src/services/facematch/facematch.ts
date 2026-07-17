import { Platform } from "react-native"
import { DiskStorageService, type StorageService } from "../StorageService"
import {
  AlgorithmIdentifier,
  AttestationData,
  AttestationType,
  type CosineScore,
  DigestInfo,
  FaceMatchAttestation,
  FaceMatchMode,
  OID_SHA1,
  OID_SHA224,
  OID_SHA256,
  OID_SHA384,
  OID_SHA512,
  ZKPassportAppAttest,
} from "./asn"
import type { AppAttestModule } from "./types"
import {
  getAppIdFromCertificate,
  getEnvironmentFromAuthData,
  hashFaceprintPoseidon2,
  msgFromError,
  packAndHashPoseidon2,
  parseAppleKeyAttestation,
  parseAndroidIntegrityAttestation,
  serializeAttestation,
  isAndroidAttestation,
} from "./utils"

/**
 * Detects hash algorithm OID based on hash length
 */
function getHashAlgorithmOID(hashLength: number): string {
  switch (hashLength) {
    case 20:
      return OID_SHA1
    case 28:
      return OID_SHA224
    case 32:
      return OID_SHA256
    case 48:
      return OID_SHA384
    case 64:
      return OID_SHA512
    default:
      throw new Error(
        `Unsupported hash length: ${hashLength} bytes. Supported lengths: 20 (SHA-1), 28 (SHA-224), 32 (SHA-256), 48 (SHA-384), 64 (SHA-512)`,
      )
  }
}

// Utility to build a fixed-length tuple
type Tuple<T, N extends number, R extends unknown[] = []> = R["length"] extends N
  ? R
  : Tuple<T, N, [T, ...R]>
// 512-D faceprint
export type Faceprint = Tuple<number, 512>

/**
 * Parameters for creating a facematch attestation client data
 */
export interface CreateAttestationClientDataParams {
  appVersion: string
  dg2HashNormalized: Uint8Array
  faceprint: Faceprint
  cosineAvgSimilarity: CosineScore
  cosineThreshold?: CosineScore
  mode: FaceMatchMode
}

export class AttestationContainer {
  constructor(
    public readonly attestation: Uint8Array,
    public readonly client_data: Uint8Array,
    public readonly dg2_hash: Uint8Array,
    public readonly app_id: string,
    public readonly environment: "development" | "production",
    public readonly assertion?: Uint8Array,
    public readonly integrity_token?: string,
  ) {}
  toJSON(): AttestationContainerJson {
    return {
      attestation: Buffer.from(this.attestation).toString("base64"),
      client_data: Buffer.from(this.client_data).toString("base64"),
      dg2_hash: Buffer.from(this.dg2_hash).toString("base64"),
      app_id: this.app_id,
      environment: this.environment,
      assertion: this.assertion ? Buffer.from(this.assertion).toString("base64") : undefined,
      integrity_token: this.integrity_token,
    }
  }
  static fromJSON(json: AttestationContainerJson): AttestationContainer {
    const requiredFields = ["attestation", "app_id", "environment", "dg2_hash", "client_data"]
    for (const field of requiredFields) {
      if (!json[field as keyof AttestationContainerJson])
        throw new Error(`Attestation container JSON missing required field: '${field}'`)
    }
    return new AttestationContainer(
      new Uint8Array(Buffer.from(json.attestation, "base64")),
      new Uint8Array(Buffer.from(json.client_data, "base64")),
      new Uint8Array(Buffer.from(json.dg2_hash, "base64")),
      json.app_id,
      json.environment as "development" | "production",
      json.assertion ? new Uint8Array(Buffer.from(json.assertion, "base64")) : undefined,
      json.integrity_token ? json.integrity_token : undefined,
    )
  }
}

export interface AttestationContainerJson {
  attestation: string
  client_data: string
  app_id: string
  environment: string
  dg2_hash: string
  assertion?: string
  integrity_token?: string
}

export interface FaceMatchServiceOptions {
  storage: StorageService
  appAttest: AppAttestModule
}

export class FaceMatchService {
  private readonly storage: StorageService
  private readonly appAttest: AppAttestModule

  constructor(options: Partial<FaceMatchServiceOptions> = {}) {
    this.storage = options.storage ?? new DiskStorageService()
    this.appAttest = options.appAttest!
  }

  async isSupported(): Promise<boolean> {
    try {
      return await this.appAttest.isSupported()
    } catch (error) {
      throw new FaceMatchError(`Failed to check if App Attest is supported`, "FACEMATCH_ERROR", {
        error,
      })
    }
  }

  async getExistingOrGenerateNewKeyId(uniqueId: string): Promise<string> {
    const keyId = await this.getExistingKeyId(uniqueId)
    if (!keyId) {
      console.log(`Generating new keyId for ${uniqueId}`)
      return await this.generateKey(uniqueId)
    }
    console.log(`Using existing keyId for ${uniqueId}`)
    return keyId
  }

  async getExistingKeyId(instanceId: string): Promise<string | null> {
    try {
      const keyId = await this.storage.getItem(`appattest.key-ids.${instanceId}`)
      if (keyId) {
        // TODO: Check if keyId is close to expiring and return null if it is
        // This could be done by checking the validity notAfter of the credential certificate for the keyId
        // Credential certificates last for 1 year. Need to generate fresh keyId after that
      }
      return keyId
    } catch (error) {
      throw new FaceMatchError(`Failed checking for existing keyId`, "FACEMATCH_ERROR", {
        error,
      })
    }
  }

  async removeKeyId(instanceId: string): Promise<void> {
    try {
      const keyId = await this.getExistingKeyId(instanceId)
      if (keyId) {
        await this.storage.removeItem(`appattest.key-ids.${instanceId}`)
      }
    } catch (error) {
      throw new FaceMatchError(
        `Failed removing keyId for ${instanceId}: ${msgFromError(error)}`,
        "FACEMATCH_ERROR",
        {
          error,
        },
      )
    }
  }

  // Generate new key in Secure Enclave and store the keyId
  async generateKey(instanceId: string): Promise<string> {
    try {
      const keyId = await this.appAttest.generateKey()
      await this.storage.setItem(`appattest.key-ids.${instanceId}`, keyId)
      return keyId
    } catch (error) {
      throw new FaceMatchError(`Failed to generate key`, "FACEMATCH_ERROR", {
        error,
      })
    }
  }

  // Request a new key attestation with client data from Apple
  async generateKeyAttestationWithClientData(
    keyId: string,
    appVersion: string,
    dg2HashNormalized: Uint8Array,
    faceprint: Faceprint,
    cosineAvgSimilarity: CosineScore,
    cosineThreshold: CosineScore,
    mode: FaceMatchMode,
  ): Promise<AttestationContainer> {
    try {
      const clientData = await FaceMatchService.createAttestationClientData({
        appVersion,
        dg2HashNormalized,
        faceprint,
        cosineAvgSimilarity,
        cosineThreshold,
        mode,
      })
      const clientDataDER = serializeAttestation(clientData)
      const clientDataHash = await packAndHashPoseidon2(clientDataDER)
      const clientDataHashB64 = Buffer.from(clientDataHash).toString("base64")

      console.log("Client Data:", clientData)
      console.log("Client Data Hash (Base64):", clientDataHashB64)
      console.log("Requesting key attestation for keyId:", keyId)
      const keyAttestation = await this.appAttest.attestKey(keyId, clientDataHashB64)

      // Check if this is an Android or iOS attestation
      const attestationDER = Uint8Array.from(Buffer.from(keyAttestation, "base64"))
      let appId: string | null = null
      let environment: "development" | "production" = "development"
      let integrityToken: string | undefined = undefined

      if (isAndroidAttestation(attestationDER)) {
        // Android Play Integrity attestation
        const androidResponse = parseAndroidIntegrityAttestation(keyAttestation)
        integrityToken = androidResponse.integrityToken
        appId = androidResponse.appId
        environment = androidResponse.environment as "development" | "production"
        console.log(`Android Play Integrity attestation: ${JSON.stringify(androidResponse)}`)
        console.log(`App ID from Play Integrity: ${appId}`)
        console.log(`Environment from Play Integrity: ${environment}`)
      } else {
        // iOS App Attest attestation
        const { authData, attStmt } = parseAppleKeyAttestation(attestationDER)
        appId = getAppIdFromCertificate(attStmt.x5c[0])
        environment = getEnvironmentFromAuthData(authData)
        console.log(`App ID from App Attest credential cert: ${appId}`)
        console.log(`Environment from App Attest auth data: ${environment}`)
      }

      if (!appId) {
        throw new FaceMatchError(`Failed to extract appId from attestation`, "FACEMATCH_ERROR")
      }
      if (!environment) {
        throw new FaceMatchError(
          `Failed to extract environment from attestation`,
          "FACEMATCH_ERROR",
        )
      }

      const attestationContainer = new AttestationContainer(
        attestationDER,
        clientDataDER,
        dg2HashNormalized,
        appId,
        environment,
        undefined,
        integrityToken,
      )

      if (Platform.OS === "ios") {
        // On iOS, we store the attestation container, but on Android, we don't
        // because we generate a new attestation every time
        await this.storeKeyAttestation(keyId, attestationContainer, mode)
      }

      return attestationContainer
    } catch (error) {
      throw new FaceMatchError(
        `Failed getting key attestation for keyId ${keyId}: ${msgFromError(error)}`,
        "FACEMATCH_ERROR",
        {
          key_id: keyId,
          error,
        },
      )
    }
  }

  async getExistingKeyAttestation(
    keyId: string,
    mode: FaceMatchMode,
  ): Promise<AttestationContainer | null> {
    try {
      const data = await this.storage.getItem(
        `appattest.key-attestations-by-key-id.${keyId}.${mode}`,
      )
      if (!data) return null
      return AttestationContainer.fromJSON(JSON.parse(data))
    } catch (error) {
      throw new FaceMatchError(
        `Failed checking existing key attestation for keyId ${keyId}: ${msgFromError(error)}`,
        "FACEMATCH_ERROR",
        {
          key_id: keyId,
          error,
        },
      )
    }
  }

  async assertClientData(
    keyId: string,
    appVersion: string,
    dg2HashNormalized: Uint8Array,
    faceprint: Faceprint,
    cosineAvgSimilarity: CosineScore,
    cosineThreshold: CosineScore,
    mode: FaceMatchMode,
  ): Promise<AttestationContainer> {
    try {
      const clientData = await FaceMatchService.createAttestationClientData({
        appVersion,
        dg2HashNormalized,
        faceprint,
        cosineAvgSimilarity,
        cosineThreshold,
        mode,
      })
      const clientDataDER = serializeAttestation(clientData)
      const clientDataHash = await packAndHashPoseidon2(clientDataDER)
      const clientDataHashB64 = Buffer.from(clientDataHash).toString("base64")

      console.log("Client Data:", clientData)
      console.log("Client Data Hash (Base64):", clientDataHashB64)
      console.log("Requesting assertion with keyId:", keyId)
      const assertion = await this.appAttest.generateAssertion(keyId, clientDataHashB64)

      // Check if this is an Android or iOS attestation
      const assertionDER = Uint8Array.from(Buffer.from(assertion, "base64"))
      let appId: string | null = null
      let environment: "development" | "production" = "development"

      const keyAttestation = await this.getExistingKeyAttestation(keyId, mode)
      if (!keyAttestation) {
        throw new FaceMatchError(`No key attestation found for keyId ${keyId}`, "FACEMATCH_ERROR")
      }

      if (isAndroidAttestation(assertionDER)) {
        // Android Play Integrity attestation
        const androidResponse = parseAndroidIntegrityAttestation(assertion)
        appId = androidResponse.appId
        environment = androidResponse.environment as "development" | "production"
        console.log(`Android Play Integrity attestation: ${JSON.stringify(androidResponse)}`)
        console.log(`App ID from Play Integrity: ${appId}`)
        console.log(`Environment from Play Integrity: ${environment}`)
      } else {
        // iOS App Attest attestation
        // TODO: Implement logic for generating assertion on iOS
        throw new FaceMatchError(`Generating assertion on iOS is not supported`, "FACEMATCH_ERROR")
      }

      if (!appId) {
        throw new FaceMatchError(`Failed to extract appId from attestation`, "FACEMATCH_ERROR")
      }
      if (!environment) {
        throw new FaceMatchError(
          `Failed to extract environment from attestation`,
          "FACEMATCH_ERROR",
        )
      }

      const attestationContainer = new AttestationContainer(
        keyAttestation.attestation,
        clientDataDER,
        dg2HashNormalized,
        appId,
        environment,
        assertionDER,
      )
      return attestationContainer
    } catch (error) {
      throw new FaceMatchError(
        `Failed getting key attestation for keyId ${keyId}: ${msgFromError(error)}`,
        "FACEMATCH_ERROR",
        {
          key_id: keyId,
          error,
        },
      )
    }
  }

  async storeKeyAttestation(
    keyId: string,
    attestation: AttestationContainer,
    mode: FaceMatchMode,
  ): Promise<void> {
    try {
      const data = attestation.toJSON()
      await this.storage.setItem(
        `appattest.key-attestations-by-key-id.${keyId}.${mode}`,
        JSON.stringify(data),
      )
    } catch (error) {
      throw new FaceMatchError(
        `Failed storing key attestation for keyId ${keyId}: ${msgFromError(error)}`,
        "FACEMATCH_ERROR",
        {
          key_id: keyId,
          error,
        },
      )
    }
  }

  /**
   * Factory function to create facematch attestation client data
   */
  static async createAttestationClientData(
    params: CreateAttestationClientDataParams,
  ): Promise<ZKPassportAppAttest> {
    const { appVersion, dg2HashNormalized, faceprint, cosineAvgSimilarity, cosineThreshold, mode } =
      params
    // Hash faceprint of DG2 reference image
    const dg2FaceprintHash = await hashFaceprintPoseidon2(faceprint)
    // Create attestation data
    const faceMatchData = new FaceMatchAttestation({
      mode,
      dg2Hash: new DigestInfo({
        algorithm: new AlgorithmIdentifier({
          // Auto-detect hash algorithm based on length
          algorithm: getHashAlgorithmOID(dg2HashNormalized.byteLength),
        }),
        digest: dg2HashNormalized.buffer as ArrayBuffer,
      }),
      dg2FaceprintHash: dg2FaceprintHash.buffer as ArrayBuffer,
      cosineAvgSimilarity,
      cosineThreshold,
    })
    const attestationData = new AttestationData({
      faceMatch: faceMatchData,
    })
    // Create outer most AppAttest envelope
    return new ZKPassportAppAttest({
      version: 1,
      appVersion,
      attestationType: AttestationType.faceMatch,
      attestationData,
    })
  }
}

// TODO: Add subtype?
export class FaceMatchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>,
  ) {
    super(message)
    this.name = "FaceMatchError"
  }
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    }
  }
}
