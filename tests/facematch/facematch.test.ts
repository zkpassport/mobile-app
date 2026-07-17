import {
  AppAttestModule,
  AttestationContainer,
  FaceMatchMode,
  FaceMatchService,
  hashFaceprintPoseidon2,
  OID_SHA1,
  parseAppleKeyAttestation,
  parseAttestationClientData,
  serializeAttestation,
  type AttestationContainerJson,
  type CosineScore,
} from "../../src/services/facematch"
import { generateCircuitInputs } from "../../src/services/facematch/circuit-input-generator"
import {
  getAppIdFromCertificate,
  getDeviceOSInformationFromCertificate,
  getEnvironmentFromAuthData,
  packAndHashPoseidon2,
} from "../../src/services/facematch/utils"
import { DiskStorageService, type StorageService } from "../../src/services/StorageService"
import attestationContainerJson from "../fixtures/facematch-attestation.json"
import {
  createSampleAttestationClientData,
  DG2_FACEPRINT_FIXTURE,
  DG2_HASH_SHA256,
  MockAppAttestModule,
} from "./helpers"
import { packLeBytesIntoFields } from "@/services/facematch/utils"

jest.mock("@zkpassport/utils", () => ({
  ...jest.requireActual("@zkpassport/utils"),
  getFacematchCircuitInputs: jest.fn().mockResolvedValue({}),
}))

describe("FaceMatch", () => {
  let facematch: FaceMatchService
  let storage: StorageService
  let appAttest: AppAttestModule

  beforeEach(() => {
    storage = new DiskStorageService()
    appAttest = new MockAppAttestModule()
    facematch = new FaceMatchService({ storage, appAttest })
  })

  describe("FaceMatchService", () => {
    it("should create FaceMatch attestation client data", async () => {
      const attestation = await FaceMatchService.createAttestationClientData({
        appVersion: "1.2.3",
        dg2HashNormalized: DG2_HASH_SHA256, // DG2 hash (reference image hash)
        faceprint: DG2_FACEPRINT_FIXTURE,
        cosineAvgSimilarity: 87321021 as CosineScore, // 0.87321021 * 1e8
        cosineThreshold: 75000000 as CosineScore, // 0.75 * 1e8
        mode: FaceMatchMode.regular,
      })
      const serialized = serializeAttestation(attestation)
      // displayAttestationClientData(attestation)
      expect(serialized).toBeInstanceOf(Uint8Array)
      expect(serialized.byteLength).toBeGreaterThan(0)
    })

    it("should generate a new key and request a key attestation", async () => {
      // Get existing keyId for a given dg2Hash or generate a new one
      const dg2Hash = DG2_HASH_SHA256
      const keyId = await facematch.getExistingOrGenerateNewKeyId(
        Buffer.from(dg2Hash).toString("hex"),
      )

      // Get existing key attestation or generate a new one
      let attestation = await facematch.getExistingKeyAttestation(keyId, FaceMatchMode.regular)
      if (!attestation) {
        attestation = await facematch.generateKeyAttestationWithClientData(
          keyId,
          "1.2.3",
          dg2Hash, // DG2 hash (reference image hash)
          DG2_FACEPRINT_FIXTURE,
          87321021 as CosineScore, // cosineAvgSimilarity: 0.87321021 * 1e8
          75000000 as CosineScore, // cosineThreshold: 0.75 * 1e8
          FaceMatchMode.regular,
        )
      }
      // console.log("Attestation Container:", attestation.toJSON())
      // displayAttestationClientData(attestation.client_data)

      // Ensure getExistingKeyId() returns the same keyId
      const existingKeyId = await facematch.getExistingKeyId(Buffer.from(dg2Hash).toString("hex"))
      expect(existingKeyId).toEqual(keyId)
      // Ensure getExistingKeyAttestation() returns the same attestation
      const existingAttestation = await facematch.getExistingKeyAttestation(
        keyId,
        FaceMatchMode.regular,
      )
      expect(existingAttestation?.toJSON()).toEqual(attestation.toJSON())
    })

    it("should fail to get a non-existing key attestation", async () => {
      const keyId = "non-existing-key-id"
      const attestation = await facematch.getExistingKeyAttestation(keyId, FaceMatchMode.regular)
      expect(attestation).toBeNull()
    })
  })

  describe("ZKPassportAppAttest ASN.1", () => {
    it("should deserialize ZKPassportAppAttest from ASN.1 into an object", async () => {
      const original = await createSampleAttestationClientData()
      const serialized = serializeAttestation(original)
      const parsed = parseAttestationClientData(serialized)
      // Verify the parsed object matches the original
      expect(parsed.version).toBe(original.version)
      expect(parsed.appVersion).toBe(original.appVersion)
      expect(parsed.attestationType).toBe(original.attestationType)
      expect(parsed.attestationData.faceMatch).toBeDefined()
      // Verify the face match data matches the original
      const originalFM = original.attestationData.faceMatch!
      const parsedFM = parsed.attestationData.faceMatch!
      expect(parsedFM.mode).toBe(originalFM.mode)
      expect(parsedFM.cosineAvgSimilarity).toBe(originalFM.cosineAvgSimilarity)
      expect(parsedFM.cosineThreshold).toBe(originalFM.cosineThreshold!)
      expect(parsedFM.dg2FaceprintHash.byteLength).toBe(originalFM.dg2FaceprintHash.byteLength)
    })

    it("should auto-detect SHA-1 hash type and use correct OID", async () => {
      // Create a 20-byte hash (SHA-1 length)
      const sha1 = new Uint8Array(20).fill(160)
      // Create attestation using factory function (should auto-detect SHA-1)
      const attestation = await FaceMatchService.createAttestationClientData({
        appVersion: "1.2.3",
        dg2HashNormalized: sha1,
        faceprint: DG2_FACEPRINT_FIXTURE,
        cosineAvgSimilarity: 87321021 as CosineScore, // 0.87321021 * 1e8
        cosineThreshold: 75000000 as CosineScore, // 0.75 * 1e8
        mode: FaceMatchMode.regular,
      })
      // Serialize the attestation
      const serialized = serializeAttestation(attestation)
      // Parse the serialized data back
      const parsed = parseAttestationClientData(serialized)
      // Assert that the parsed object has the correct SHA-1 OID
      expect(parsed.attestationData.faceMatch).toBeDefined()
      const parsedFM = parsed.attestationData.faceMatch!
      expect(parsedFM.dg2Hash.algorithm.algorithm).toBe(OID_SHA1)
      expect(parsedFM.dg2Hash.digest.byteLength).toBe(20)
      // Verify the hash data is preserved correctly
      const parsedHashView = new Uint8Array(parsedFM.dg2Hash.digest)
      expect(parsedHashView).toEqual(sha1)
    })

    it("should recreate and verify faceprint hash after parsing serialized attestation", async () => {
      // Create attestation client data
      const clientData = await createSampleAttestationClientData()
      // Serialize and parse the attestation
      const serialized = serializeAttestation(clientData)
      const parsed = parseAttestationClientData(serialized)
      // Verify face match data exists
      expect(parsed.attestationData.faceMatch).toBeDefined()
      // Recreate the expected Poseidon2 hash from the same faceprint
      const expectedPoseidon2Hash = await hashFaceprintPoseidon2(DG2_FACEPRINT_FIXTURE)
      expect(parsed.attestationData.faceMatch!.dg2FaceprintHash).toEqual(expectedPoseidon2Hash)
    })
  })

  describe("AppAttest Parsing", () => {
    it("should get appId from App Attest credential cert key usage ext", async () => {
      const keyAttestationB64 = attestationContainerJson.attestation
      const keyAttestation = new Uint8Array(Buffer.from(keyAttestationB64, "base64"))
      const parsed = parseAppleKeyAttestation(keyAttestation)
      expect(parsed.fmt).toBe("apple-appattest")
      // Extract app ID from OID 1.2.840.113635.100.8.5 extension
      const credCertDer = parsed.attStmt.x5c[0]
      const appId = getAppIdFromCertificate(credCertDer)
      expect(appId).toBe("YL5MS3Z639.app.zkpassport.appattest-prototype")
    })

    it("should get OS from App Attest credential cert OS info ext", async () => {
      const keyAttestationB64 = attestationContainerJson.attestation
      const keyAttestation = new Uint8Array(Buffer.from(keyAttestationB64, "base64"))
      const parsed = parseAppleKeyAttestation(keyAttestation)
      expect(parsed.fmt).toBe("apple-appattest")
      // Extract OS info from OID 1.2.840.113635.100.8.7 extension
      const credCertDer = parsed.attStmt.x5c[0]
      const osInfo = getDeviceOSInformationFromCertificate(credCertDer)
      expect(osInfo?.platformName).toContain("iphoneos")
      expect(osInfo?.osVersion).toContain("18.6.2")
      expect(osInfo?.osBuild).toContain("22G100")
    })
  })

  it("should get environment from App Attest Auth Data", async () => {
    const keyAttestationB64 = attestationContainerJson.attestation
    const keyAttestation = new Uint8Array(Buffer.from(keyAttestationB64, "base64"))
    const parsed = parseAppleKeyAttestation(keyAttestation)
    expect(parsed.fmt).toBe("apple-appattest")
    // Extract environment from Auth Data
    const environment = getEnvironmentFromAuthData(parsed.authData)
    expect(environment).toBe("development")
  })

  describe("Circuit Inputs", () => {
    it("should generate circuit inputs from an attestation container", async () => {
      // Generate circuit inputs from the attestation container
      const attestationContainer = AttestationContainer.fromJSON(
        attestationContainerJson as AttestationContainerJson,
      )
      const circuitInputs = await generateCircuitInputs(
        attestationContainer,
        {} as any,
        {
          facematch: {
            mode: "regular",
          },
        },
        0n,
        0n,
        0n,
      )

      // Check that all required fields are present
      expect(circuitInputs.root_key).toBeInstanceOf(Array)
      expect(circuitInputs.intermediate_sig).toBeInstanceOf(Array)
      expect(circuitInputs.intermediate_tbs).toBeInstanceOf(Array)
      expect(circuitInputs.intermediate_key).toBeInstanceOf(Array)
      expect(circuitInputs.credential_sig).toBeInstanceOf(Array)
      expect(circuitInputs.credential_tbs).toBeInstanceOf(Array)
      expect(circuitInputs.auth_data).toBeInstanceOf(Array)
      expect(circuitInputs.client_data).toBeInstanceOf(Array)
      expect(circuitInputs.client_data_hash).toBeInstanceOf(Array)
      expect(circuitInputs.app_id).toBeInstanceOf(Array)

      // Check specific lengths for ECDSA keys
      expect(circuitInputs.root_key.length).toBe(48 * 2)
      expect(circuitInputs.intermediate_key.length).toBe(48 * 2)
      expect(circuitInputs.intermediate_sig.length).toBe(96)
      expect(circuitInputs.credential_sig.length).toBe(96)

      // Check padded lengths match defaults
      expect(circuitInputs.intermediate_tbs.length).toBe(500)
      expect(circuitInputs.credential_tbs.length).toBe(1000)
      expect(circuitInputs.auth_data.length).toBe(180)
      expect(circuitInputs.client_data.length).toBe(169)
      expect(circuitInputs.app_id.length).toBe(100)

      // Check that client data hash is 32 bytes (Poseidon2 output)
      expect(circuitInputs.client_data_hash.length).toBe(32)

      // Check environment value (should be 0 for development)
      expect(circuitInputs.environment).toBe(0)

      // Check facematch mode (should be 1 for regular mode)
      expect(circuitInputs.facematch_mode).toBe(1)

      // Verify the app ID matches expected value
      const appIdString = new TextDecoder().decode(
        new Uint8Array(circuitInputs.app_id.filter((b) => b !== 0)),
      )
      expect(appIdString).toBe("YL5MS3Z639.app.zkpassport.appattest-prototype")

      // Log some key values for debugging
      // console.log("Generated circuit inputs:")
      // console.log("- Environment:", circuitInputs.environment)
      // console.log("- Facematch mode:", circuitInputs.facematch_mode)
      // console.log("- App ID:", appIdString)
      // console.log("- Root key length:", circuitInputs.root_key.length)
      // console.log("- Client data hash length:", circuitInputs.client_data_hash.length)
    })

    it("should calculate attestation registry leaf from root key", async () => {
      const root_key_type = 1
      const root_key = new Uint8Array([
        // x coordinate
        0x45, 0x31, 0xe1, 0x98, 0xb5, 0xb4, 0xec, 0x04, 0xda, 0x15, 0x02, 0x04, 0x57, 0x04, 0xed,
        0x4f, 0x87, 0x72, 0x72, 0xd7, 0x61, 0x35, 0xb2, 0x61, 0x16, 0xcf, 0xc8, 0x8b, 0x61, 0x5d,
        0x0a, 0x00, 0x07, 0x19, 0xba, 0x69, 0x85, 0x8d, 0xfe, 0x77, 0xca, 0xa3, 0xb8, 0x39, 0xe0,
        0x20, 0xdd, 0xd6,
        // y coordinate
        0x56, 0x14, 0x14, 0x04, 0x70, 0x28, 0x31, 0xe4, 0x3f, 0x70, 0xb8, 0x8f, 0xd6, 0xc3, 0x94,
        0xb6, 0x08, 0xea, 0x2b, 0xd6, 0xae, 0x61, 0xe9, 0xf5, 0x98, 0xc1, 0x2f, 0x46, 0xaf, 0x52,
        0x93, 0x72, 0x66, 0xe5, 0x7f, 0x14, 0xeb, 0x61, 0xfe, 0xc5, 0x30, 0xf7, 0x14, 0x4f, 0x53,
        0x81, 0x2e, 0x35,
      ])
      const leaf = Buffer.from(
        await packAndHashPoseidon2(new Uint8Array([root_key_type, ...root_key])),
      ).toString("hex")
      expect(leaf).toBe("2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b")
    })
  })

  describe("Utils", () => {
    describe("packLeBytesIntoFields", () => {
      it("should hash to the same value after packing zero-padded bytes with different padding", async () => {
        const bytes = new Uint8Array([
          0x11, 0x12, 0x13, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
          0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
          0x11, 0x21, 0x22, 0x23, 0x24, 0x25, 0x00, 0x00, 0x00, 0x00, 0x00,
        ])
        const packed = packLeBytesIntoFields(bytes, 31)
        expect(packed).toEqual([
          "0x11111111111111111111111111111111111111111111111111111111131211",
          "0x2524232221",
        ])
      })
    })
  })
})
