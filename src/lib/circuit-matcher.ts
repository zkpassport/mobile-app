import {
  getSodSignatureAlgorithmType,
  extractTBS,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getBindCircuitInputs,
  BoundDataIdentifier,
  Binary,
  getTBSMaxLen,
  getChainFromId,
  getNowTimestamp,
  getSanctionsExclusionCheckCircuitInputs,
  getCscaForPassportAsync,
  NullifierType,
  evaluateOPRF,
  OPRF_ZERO_PROOF,
  OPRF_DEFAULT_KEY_ID,
} from "@zkpassport/utils"
import {
  CircuitError,
  CircuitErrorSubType,
  MissingCscaError,
  MissingCscaErrorEnum,
  SanctionsFailedError,
} from "@/types/Error"
import { getRSAInfo, getECDSAInfo, getRSAPSSParams } from "@zkpassport/utils"
import {
  filterDuplicateProofs,
  getBitSize,
  getIntegrityToDisclosureSalts,
  getLatestBlockTimestamp,
  isCompatibleWithCurrentVersion,
} from "."
import {
  getAgeCircuitInputs,
  getBirthdateCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getNationalityExclusionCircuitInputs,
  getNationalityInclusionCircuitInputs,
  getDiscloseCircuitInputs,
  getExpiryDateCircuitInputs,
  isIDSupported,
} from "@zkpassport/utils"
import type {
  PassportViewModel,
  Query,
  IDCredential,
  PackagedCircuit,
  CommittedInputs,
  DisclosureCircuitName,
  ECPublicKey,
  RSAPublicKey,
  CircuitManifest,
  BoundData,
  ProofResult,
  SOD,
  HashAlgorithm,
  FacematchCommittedInputs,
} from "@zkpassport/utils"
import { getCountryFromWeightedSum } from "@zkpassport/utils"
import { hasRequestedAccessToField } from "./credentials"
import { RegistryClient } from "@zkpassport/registry"
// import { MockRegistryClient as RegistryClient } from "@zkpassport/registry/mock"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { CIRCUIT_VERSION, RPC_URL } from "./constants"
import { Platform } from "react-native"
import * as FileSystem from "expo-file-system"
import { MySettings } from "@/context/SettingsContext"
import { AttestationContainer } from "@/services/facematch/facematch"
import {
  generateCircuitInputs as generateFacematchCircuitInputs,
  getCredentialCertificateInfo,
  getIntermediateCertificates,
  getRootCertificate,
} from "@/services/facematch/circuit-input-generator"
import { createUnsupportedPassportError, UnsupportedPassportEnum } from "./errorUtils"
import { TimingEvents } from "@/types/ProofService"
import {
  detectAndVerifySignatureAlgorithm,
  verifyWithDetectedAlgorithm,
  type HashAlgorithmName,
  type DetectedAlgorithm,
} from "./signature-verification"

// Constants for circuit manifest storage
const CIRCUIT_MANIFEST_FILE_PATH = FileSystem.cacheDirectory + "zkpassport_circuits.json"

/**
 * Checks the manifest version and returns the manifest and version
 * @param manifestRef - The manifest to check, if not provided, it will be fetched from the registry
 * @returns The manifest and version
 */
export async function checkManifestVersion(
  manifestRef?: CircuitManifest,
): Promise<{ circuitManifest: CircuitManifest; circuitVersion: `${number}.${number}.${number}` }> {
  let circuitManifest = manifestRef ?? (await getCircuitManifest())
  const circuitVersion = await getCircuitVersion(circuitManifest)
  if (circuitVersion !== circuitManifest.version) {
    console.log("Circuit version mismatch, getting new manifest")
    circuitManifest = await getCircuitManifest(circuitVersion)
  }

  return { circuitManifest, circuitVersion }
}

/**
 * Checks the duplicate proofs and returns the base subproofs
 * @param circuitVersion - The circuit version to check
 * @param storedSettings - The stored settings
 * @param id - The id of the passport
 * @returns The base subproofs, empty if there are any duplicates, or if there is a version mismatch
 */
export async function checkDuplicateProofs(
  circuitVersion: string,
  storedSettings: MySettings,
  id: string,
): Promise<ProofResult[]> {
  let baseSubproofs: ProofResult[] =
    storedSettings.baseSubproofs && storedSettings.baseSubproofs[id]
      ? storedSettings.baseSubproofs[id]
      : []
  // Remove any duplicate proofs and keep only the ones from the same version
  baseSubproofs = filterDuplicateProofs(baseSubproofs).filter((x) => x.version === circuitVersion)

  // Check the names of the proofs, make sure there is only one DSC, one ID, and one integrity proof
  const dscCount = baseSubproofs.filter((x) => x.name?.includes("sig_check_dsc")).length
  const idCount = baseSubproofs.filter((x) => x.name?.includes("sig_check_id")).length
  const integrityCount = baseSubproofs.filter((x) =>
    x.name?.includes("data_check_integrity"),
  ).length
  if (dscCount !== 1 || idCount !== 1 || integrityCount !== 1 || baseSubproofs.length !== 3) {
    return []
  }
  // If there are any duplicates, or the order is wrong, return false, this will trigger a new proof generation.
  return baseSubproofs
}

export async function getCircuitManifest(version?: string): Promise<CircuitManifest> {
  const registry = new RegistryClient({
    chainId: 1,
  })
  return registry.getCircuitManifest(undefined, {
    version: version,
    validate: false,
  })
}

// Helper function to get circuit data from storage (AsyncStorage on iOS, file on Android)
async function getCachedCircuitManifest(): Promise<Record<string, PackagedCircuit>> {
  try {
    if (Platform.OS === "ios") {
      const cachedVersionString = await AsyncStorage.getItem("circuit_manifest")
      return cachedVersionString ? JSON.parse(cachedVersionString) : {}
    } else {
      // On Android, use Expo FileSystem to avoid AsyncStorage size limits
      const fileInfo = await FileSystem.getInfoAsync(CIRCUIT_MANIFEST_FILE_PATH)
      if (fileInfo.exists) {
        const cachedVersion = await FileSystem.readAsStringAsync(CIRCUIT_MANIFEST_FILE_PATH)
        return cachedVersion ? JSON.parse(cachedVersion) : {}
      }
      return {}
    }
  } catch (error) {
    console.error("Error loading cached circuit manifest: " + error)
    return {}
  }
}

// Helper function to save circuit data to storage (AsyncStorage on iOS, file on Android)
async function saveCachedCircuitManifest(
  circuitData: Record<string, PackagedCircuit>,
): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await AsyncStorage.setItem("circuit_manifest", JSON.stringify(circuitData))
    } else {
      // On Android, use Expo FileSystem to avoid AsyncStorage size limits
      await FileSystem.writeAsStringAsync(CIRCUIT_MANIFEST_FILE_PATH, JSON.stringify(circuitData))
    }
  } catch (error) {
    console.error("Error saving cached circuit manifest: " + error)
    throw error
  }
}

export function parseObsoleteCircuitName(circuitName: string): string {
  if (circuitName.startsWith("data_check_integrity_sha")) {
    const shaNumber = circuitName.replace("data_check_integrity_sha", "")
    const newCircuitName = `data_check_integrity_sa_sha${shaNumber}_dg_sha${shaNumber}`
    return newCircuitName
  }
  return circuitName
}

export async function getPackagedCircuit(
  circuitName: string,
  circuitManifest: CircuitManifest,
): Promise<PackagedCircuit> {
  const registry = new RegistryClient({
    chainId: 1,
  })
  const cachedVersion = await getCachedCircuitManifest()
  // Get new version if different from cached version
  if (
    !cachedVersion[circuitName] ||
    (cachedVersion[circuitName] &&
      (cachedVersion[circuitName] as PackagedCircuit).vkey_hash !==
        circuitManifest.circuits[circuitName].hash)
  ) {
    console.log("Getting new version of circuit", circuitName)
    const packagedCircuit = await registry.getPackagedCircuit(circuitName, circuitManifest, {
      // TODO: re-enable when the issue with keccak outer proofs vkey hash is fixed
      validate: false,
    })
    if (!packagedCircuit) {
      throw new Error("Failed to fetch packaged circuit: " + circuitName)
    }
    // If the new version can introduce breaking changes, use the cached version
    if (!isCompatibleWithCurrentVersion(CIRCUIT_VERSION, circuitManifest.version)) {
      console.log("Incompatible version of circuit", circuitName)
      if (cachedVersion[circuitName]) {
        console.log("Using cached version of circuit", circuitName)
        return cachedVersion[circuitName]
      } else {
        console.log("No cached version, using current version", CIRCUIT_VERSION)
        // If no cached version, use the current version set in the constants
        const newPackagedCircuit = await registry.getPackagedCircuit(
          circuitName,
          await getCircuitManifest(CIRCUIT_VERSION),
          // TODO: re-enable when the issue with keccak outer proofs vkey hash is fixed
          {
            validate: false,
          },
        )
        // Save to cache
        cachedVersion[circuitName] = newPackagedCircuit
        await saveCachedCircuitManifest(cachedVersion)
        return newPackagedCircuit
      }
    }
    console.log("Compatible version of circuit", circuitName)
    // Save to cache
    cachedVersion[circuitName] = packagedCircuit
    await saveCachedCircuitManifest(cachedVersion)
    return packagedCircuit
  }
  console.log("Using cached version of circuit", circuitName)
  // Use cached version
  return cachedVersion[circuitName]
}

export async function getCircuitVersion(
  circuitManifest: CircuitManifest,
): Promise<`${number}.${number}.${number}`> {
  const cachedVersion = await AsyncStorage.getItem("circuit_version")
  console.log("Cached version: " + cachedVersion)
  console.log("Circuit manifest version: " + circuitManifest.version)
  if (
    cachedVersion !== circuitManifest.version &&
    isCompatibleWithCurrentVersion(
      CIRCUIT_VERSION,
      circuitManifest.version as `${number}.${number}.${number}`,
    )
  ) {
    console.log("New compatible version of circuits, saving to cache")
    await AsyncStorage.setItem(
      "circuit_version",
      circuitManifest.version as `${number}.${number}.${number}`,
    )
    return circuitManifest.version as `${number}.${number}.${number}`
  }
  if (cachedVersion) {
    console.log("Using cached version of circuits")
    return cachedVersion as `${number}.${number}.${number}`
  }
  console.log("Using static version of circuits")
  return CIRCUIT_VERSION
}

export async function getOuterCircuit(
  numberOfDisclosureProofs: number,
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  switch (numberOfDisclosureProofs) {
    case 1:
      return getPackagedCircuit(evm ? "outer_evm_count_4" : "outer_count_4", circuitManifest)
    case 2:
      return getPackagedCircuit(evm ? "outer_evm_count_5" : "outer_count_5", circuitManifest)
    case 3:
      return getPackagedCircuit(evm ? "outer_evm_count_6" : "outer_count_6", circuitManifest)
    case 4:
      return getPackagedCircuit(evm ? "outer_evm_count_7" : "outer_count_7", circuitManifest)
    case 5:
      return getPackagedCircuit(evm ? "outer_evm_count_8" : "outer_count_8", circuitManifest)
    case 6:
      return getPackagedCircuit(evm ? "outer_evm_count_9" : "outer_count_9", circuitManifest)
    case 7:
      return getPackagedCircuit(evm ? "outer_evm_count_10" : "outer_count_10", circuitManifest)
    case 8:
      return getPackagedCircuit(evm ? "outer_evm_count_11" : "outer_count_11", circuitManifest)
    case 9:
      return getPackagedCircuit(evm ? "outer_evm_count_12" : "outer_count_12", circuitManifest)
    case 10:
      return getPackagedCircuit(evm ? "outer_evm_count_13" : "outer_count_13", circuitManifest)
    default:
      throw new CircuitError(
        CircuitErrorSubType.UnsupportedNumberOfSubproofs,
        `Unsupported number of subproofs: ${numberOfDisclosureProofs + 3}`,
        {
          circuit_name: "outer_circuit",
          error_details: `Expected 4-13 subproofs, got ${numberOfDisclosureProofs + 3}`,
        },
      )
  }
}

export async function getCommittedInputs(
  inputs: any,
  circuitName: DisclosureCircuitName,
  circuitManifest: CircuitManifest,
): Promise<CommittedInputs | FacematchCommittedInputs> {
  const circuit = await getPackagedCircuit(circuitName, circuitManifest)
  if (!circuit) {
    throw new CircuitError(
      CircuitErrorSubType.CircuitNotFound,
      `Circuit not found: ${circuitName}`,
      {
        circuit_name: circuitName,
        error_details: "Circuit not found in manifest",
      },
    )
  }
  if (circuitName === "disclose_bytes" || circuitName === "disclose_bytes_evm") {
    return {
      disclosedBytes: inputs.salted_dg1.value
        .slice(5)
        .map((x: number, i: number) => x * inputs.disclose_mask[i]),
      discloseMask: inputs.disclose_mask,
    }
  } else if (circuitName === "compare_age" || circuitName === "compare_age_evm") {
    return {
      minAge: inputs.min_age_required,
      maxAge: inputs.max_age_required,
    }
  } else if (
    circuitName === "compare_expiry" ||
    circuitName === "compare_birthdate" ||
    circuitName === "compare_expiry_evm" ||
    circuitName === "compare_birthdate_evm"
  ) {
    return {
      minDateTimestamp: inputs.min_date,
      maxDateTimestamp: inputs.max_date,
    }
  } else if (
    circuitName === "inclusion_check_nationality" ||
    circuitName === "inclusion_check_nationality_evm" ||
    circuitName === "inclusion_check_issuing_country" ||
    circuitName === "inclusion_check_issuing_country_evm"
  ) {
    return {
      countries: inputs.country_list.filter((x: string) => x !== "\0\0\0"),
    }
  } else if (
    circuitName === "exclusion_check_nationality" ||
    circuitName === "exclusion_check_nationality_evm" ||
    circuitName === "exclusion_check_issuing_country" ||
    circuitName === "exclusion_check_issuing_country_evm"
  ) {
    return {
      countries: inputs.country_list
        .map(getCountryFromWeightedSum)
        .filter((x: string) => x !== "\0\0\0"),
    }
  } else if (circuitName === "bind" || circuitName === "bind_evm") {
    const dataBytes = inputs.data
    let offset = 0
    const boundData: BoundData = {}
    while (offset < 500) {
      if (dataBytes[offset] === BoundDataIdentifier.USER_ADDRESS) {
        const addressLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.user_address = Binary.from(
          dataBytes.slice(offset + 3, offset + 3 + addressLength),
        ).toHex()
        offset += 2 + addressLength + 1
      } else if (dataBytes[offset] === BoundDataIdentifier.CHAIN_ID) {
        const chainIdLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.chain = getChainFromId(
          Number(Binary.from(dataBytes.slice(offset + 3, offset + 3 + chainIdLength)).toBigInt()),
        )
        offset += 2 + chainIdLength + 1
      } else if (dataBytes[offset] === BoundDataIdentifier.CUSTOM_DATA) {
        const customDataLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.custom_data = new TextDecoder().decode(
          new Uint8Array(dataBytes.slice(offset + 3, offset + 3 + customDataLength)),
        )
        offset += 2 + customDataLength + 1
      } else {
        break
      }
    }
    return {
      data: boundData,
    }
  } else if (
    circuitName === "exclusion_check_sanctions" ||
    circuitName === "exclusion_check_sanctions_evm"
  ) {
    return {
      rootHash: inputs.root,
      isStrict: !!inputs.is_strict,
    }
  } else if (circuitName.startsWith("facematch")) {
    if (Platform.OS === "android") {
      return {
        // Poseidon2 Hash of the packed Google RSA Root Key + Google Key Identifier (2) or ECDSA Root Key + Google Key Identifier (2)
        rootKeyLeaf:
          inputs.root_key.length === 512
            ? "0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211"
            : "0x0e1889bec6c1d686abcf08360ff404f803ab345881ea8cba6aad33b7f7f7ffe0",
        environment: inputs.environment === 1 ? "production" : "development",
        // Hash of "app.zkpassport.zkpassport"
        appIdHash: "0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d",
        integrityPubkeyHash: "0x12e3dc7cc8fec0205b51ff21825630865028f3be5bc64a6eec9ee5e71221319f",
        mode: inputs.facematch_mode === 1 ? "regular" : "strict",
      } as FacematchCommittedInputs
    } else {
      return {
        // Poseidon2 Hash of the packed Apple Root Key + Apple Key Identifier (1)
        rootKeyLeaf: "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b",
        environment: inputs.environment === 1 ? "production" : "development",
        // Hash of "YL5MS3Z639.app.zkpassport.zkpassport" (i.e. <team_id>.<bundle_id>)
        appIdHash: "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b",
        integrityPubkeyHash: "0x0",
        mode: inputs.facematch_mode === 1 ? "regular" : "strict",
      } as FacematchCommittedInputs
    }
  }
  throw new CircuitError(CircuitErrorSubType.CircuitNotFound, `Circuit not found: ${circuitName}`, {
    circuit_name: circuitName,
    error_details: "Circuit not found in manifest",
  })
}

export function getCSCSignatureHashAlgorithm(sod: SOD): HashAlgorithm {
  const DEFAULT_HASH: HashAlgorithm = "SHA-256"
  const dsc = sod.certificate
  if (!dsc || !dsc.signatureAlgorithm || !dsc.signatureAlgorithm.name) {
    return DEFAULT_HASH
  }

  if (dsc.signatureAlgorithm.name.toLowerCase().includes("pss")) {
    if (dsc.signatureAlgorithm.parameters) {
      const params = getRSAPSSParams(dsc.signatureAlgorithm.parameters?.toBuffer() as BufferSource)
      return params.hashAlgorithm.replace("SHA", "SHA-") as HashAlgorithm
    } else {
      return DEFAULT_HASH
    }
  }

  if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha1")) {
    return "SHA-1"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha224")) {
    return "SHA-224"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha256")) {
    return "SHA-256"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha384")) {
    return "SHA-384"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha512")) {
    return "SHA-512"
  }
  return DEFAULT_HASH
}

export async function getDSCCircuit(
  passport: PassportViewModel,
  circuitManifest: CircuitManifest,
  chainId: number = 1,
): Promise<PackagedCircuit> {
  if (!isIDSupported(passport)) {
    throw createUnsupportedPassportError(
      UnsupportedPassportEnum.NOT_SUPPORTED,
      undefined,
      "Getting DSC circuit for unsupported ID",
    )
  }
  let circuitName = ""
  const registryClient = new RegistryClient({
    chainId,
  })
  const { certificates } = await registryClient.getCertificates(undefined, {
    validate: false,
  })
  const csc = await getCscaForPassportAsync(passport.sod.certificate, certificates)
  if (!csc) {
    throw new MissingCscaError(MissingCscaErrorEnum.NOT_FOUND, {
      dsc_certificate: passport.sod.certificate,
    })
  }
  const hashAlgorithm = getCSCSignatureHashAlgorithm(passport.sod).replace("SHA-", "sha")
  const tbs_max_len = getTBSMaxLen(passport)
  if (csc.signature_algorithm.toLowerCase().includes("ecdsa")) {
    const curve = (csc.public_key as ECPublicKey).curve
    const curve_family = curve.includes("brainpool") ? "brainpool" : "nist"
    const curve_name = curve
      .replace("brainpoolP", "")
      .replace("nist", "")
      .replace("-", "")
      .toLowerCase()
    circuitName = `sig_check_dsc_tbs_${tbs_max_len}_ecdsa_${curve_family}_${curve_name}_${hashAlgorithm}`
    console.log("Circuit name:", circuitName)
    if (circuitName.includes("undefined")) {
      throw createUnsupportedPassportError(
        UnsupportedPassportEnum.FAILED_ROOT_CERTIFICATE_CHECK,
        circuitName,
        "Undefined ecdsa curve",
      )
    }
    return getPackagedCircuit(circuitName, circuitManifest)
  } else if (csc.signature_algorithm.toLowerCase().includes("rsa")) {
    const modulusBits = getBitSize(BigInt((csc.public_key as RSAPublicKey).modulus))
    const scheme = csc.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"
    circuitName = `sig_check_dsc_tbs_${tbs_max_len}_rsa_${scheme}_${modulusBits}_${hashAlgorithm}`
    if (circuitName.includes("undefined")) {
      throw createUnsupportedPassportError(
        UnsupportedPassportEnum.FAILED_ROOT_CERTIFICATE_CHECK,
        circuitName,
        "Undefined rsa modulus bits",
      )
    }
    return getPackagedCircuit(circuitName, circuitManifest)
  }
  throw createUnsupportedPassportError(
    UnsupportedPassportEnum.FAILED_ROOT_CERTIFICATE_CHECK,
    circuitName,
    "Undefined signature algorithm",
  )
}

export function getSodSignatureAlgorithmHashAlgorithm(passport: PassportViewModel): string {
  const signatureAlgorithm = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase()
  const saHashAlgorithm = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  if (signatureAlgorithm.includes("sha1")) {
    return "sha1"
  } else if (signatureAlgorithm.includes("sha224")) {
    return "sha224"
  } else if (signatureAlgorithm.includes("sha256")) {
    return "sha256"
  } else if (signatureAlgorithm.includes("sha384")) {
    return "sha384"
  } else if (signatureAlgorithm.includes("sha512")) {
    return "sha512"
  } else {
    return saHashAlgorithm
  }
}

export async function getIDDataCircuit(
  passport: PassportViewModel,
  circuitManifest: CircuitManifest,
): Promise<PackagedCircuit> {
  if (!isIDSupported(passport)) {
    throw createUnsupportedPassportError(
      UnsupportedPassportEnum.NOT_SUPPORTED,
      undefined,
      "Getting ID data circuit for unsupported ID",
    )
  }

  const tbsCertificate = extractTBS(passport)
  if (!tbsCertificate) {
    throw new Error("Failed to extract the certificate that signed your ID")
  }
  const tbs_max_len = getTBSMaxLen(passport)

  // First, try to build circuit name using the originally detected algorithm
  const originalCircuitName = buildCircuitNameFromDetectedAlgorithm(
    passport,
    tbsCertificate,
    tbs_max_len,
  )

  // Try to verify the signature with the detected algorithm
  // If verification succeeds, use the detected algorithm
  // If verification fails, try brute forcing the correct algorithm
  let circuitName = originalCircuitName

  try {
    // Attempt to verify the signature using the originally detected algorithm
    const signatureAlgorithm = getSodSignatureAlgorithmType(passport)
    const hashAlgorithm = getSodSignatureAlgorithmHashAlgorithm(passport)

    let verificationSucceeded = false
    if (signatureAlgorithm === "ECDSA") {
      const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      const curve = ecdsaInfo.curve
      const curveFamily = curve.includes("brainpool") ? "brainpool" : "nist"

      verificationSucceeded = await verifySignatureWithAlgorithm(passport, {
        type: "ECDSA",
        hashAlgorithm: hashAlgorithm as HashAlgorithmName,
        curveFamily,
        curveName: curve,
      })
    } else if (signatureAlgorithm === "RSA") {
      const rsaScheme = passport.sod.signerInfo.signatureAlgorithm.name
        .toLowerCase()
        .includes("pss")
        ? "pss"
        : "pkcs"
      let rsaHashAlg = hashAlgorithm
      if (rsaScheme === "pss" && passport.sod.signerInfo.signatureAlgorithm.parameters) {
        const rsaParams = getRSAPSSParams(
          passport.sod.signerInfo.signatureAlgorithm.parameters?.toBuffer()! as BufferSource,
        )
        rsaHashAlg = rsaParams.hashAlgorithm.toLowerCase().replace("-", "")
      }

      verificationSucceeded = await verifySignatureWithAlgorithm(passport, {
        type: "RSA",
        hashAlgorithm: rsaHashAlg as HashAlgorithmName,
        rsaScheme,
      })
    }

    // If verification failed, try brute forcing the correct algorithm
    if (!verificationSucceeded) {
      console.log(
        "[getIDDataCircuit] Original algorithm verification failed, attempting brute force...",
      )
      const detectedAlgorithm = await detectAndVerifySignatureAlgorithm(passport)

      if (detectedAlgorithm) {
        console.log("[getIDDataCircuit] Brute force found working algorithm:", detectedAlgorithm)
        // Build circuit name from the brute-forced algorithm
        circuitName = buildCircuitNameFromBruteForce(detectedAlgorithm, tbsCertificate, tbs_max_len)
      } else {
        // Brute force failed, fall back to original algorithm
        console.log("[getIDDataCircuit] Brute force failed, falling back to original algorithm")
        circuitName = originalCircuitName
      }
    }
  } catch (error) {
    // If any error occurs during verification/brute force, fall back to original algorithm
    console.log(
      "[getIDDataCircuit] Error during signature verification, using original algorithm:",
      error,
    )
    circuitName = originalCircuitName
  }

  if (!circuitName) {
    throw createUnsupportedPassportError(UnsupportedPassportEnum.NOT_SUPPORTED, circuitName)
  }
  if (circuitName.includes("undefined")) {
    throw createUnsupportedPassportError(UnsupportedPassportEnum.FAILED_ID_SIG_DETAILS, circuitName)
  }

  return getPackagedCircuit(circuitName, circuitManifest)
}

/**
 * Build circuit name from the originally detected algorithm in the passport
 */
function buildCircuitNameFromDetectedAlgorithm(
  passport: PassportViewModel,
  tbsCertificate: any,
  tbs_max_len: number,
): string {
  const signatureAlgorithm = getSodSignatureAlgorithmType(passport)

  if (signatureAlgorithm === "ECDSA") {
    const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const curve = ecdsaInfo.curve
    const curve_family = curve.includes("brainpool") ? "brainpool" : "nist"
    const curve_name = curve
      .replace("brainpoolP", "")
      .replace("nist", "")
      .replace("-", "")
      .toLowerCase()
    const hashAlgorithm = getSodSignatureAlgorithmHashAlgorithm(passport)
    return `sig_check_id_data_tbs_${tbs_max_len}_ecdsa_${curve_family}_${curve_name}_${hashAlgorithm}`
  } else if (signatureAlgorithm === "RSA") {
    const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const modulusBits = getBitSize(rsaInfo.modulus)
    const type = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase().includes("pss")
      ? "pss"
      : "pkcs"
    let hashAlgorithm = ""
    if (type === "pss") {
      const rsaParams = getRSAPSSParams(
        passport.sod.signerInfo.signatureAlgorithm.parameters?.toBuffer()! as BufferSource,
      )
      hashAlgorithm = rsaParams.hashAlgorithm.toLowerCase().replace("-", "")
    } else {
      hashAlgorithm = getSodSignatureAlgorithmHashAlgorithm(passport)
    }
    return `sig_check_id_data_tbs_${tbs_max_len}_rsa_${type}_${modulusBits}_${hashAlgorithm}`
  }

  return ""
}

/**
 * Build circuit name from brute-forced algorithm parameters
 */
function buildCircuitNameFromBruteForce(
  detectedAlgorithm: DetectedAlgorithm,
  tbsCertificate: any,
  tbs_max_len: number,
): string {
  if (detectedAlgorithm.type === "RSA") {
    const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const modulusBits = getBitSize(rsaInfo.modulus)
    return `sig_check_id_data_tbs_${tbs_max_len}_rsa_${detectedAlgorithm.rsaScheme}_${modulusBits}_${detectedAlgorithm.hashAlgorithm}`
  } else {
    // ECDSA
    const curve_family = detectedAlgorithm.curveFamily
    const curve_name = detectedAlgorithm.curveName
    return `sig_check_id_data_tbs_${tbs_max_len}_ecdsa_${curve_family}_${curve_name}_${detectedAlgorithm.hashAlgorithm}`
  }
}

/**
 * Verify signature using the specified algorithm parameters
 * This is a wrapper around the signature verification utilities
 */
async function verifySignatureWithAlgorithm(
  passport: PassportViewModel,
  algorithm: {
    type: "RSA" | "ECDSA"
    hashAlgorithm: HashAlgorithmName
    rsaScheme?: "pkcs" | "pss"
    curveFamily?: "nist" | "brainpool"
    curveName?: string
  },
): Promise<boolean> {
  try {
    return await verifyWithDetectedAlgorithm(passport, {
      type: algorithm.type,
      hashAlgorithm: algorithm.hashAlgorithm,
      rsaScheme: algorithm.rsaScheme,
      curveFamily: algorithm.curveFamily,
      curveName: algorithm.curveName,
    })
  } catch {
    return false
  }
}

export async function getIntegrityCheckCircuit(
  passport: PassportViewModel,
  circuitManifest: CircuitManifest,
): Promise<PackagedCircuit> {
  let circuitName = ""
  const saHashAlgorithm = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  const dgHashAlgorithm = passport.sod.encapContentInfo.eContent.hashAlgorithm
    .toLowerCase()
    .replace("-", "")
  circuitName = `data_check_integrity_sa_${saHashAlgorithm}_dg_${dgHashAlgorithm}`
  if (circuitName.includes("undefined")) {
    throw createUnsupportedPassportError(
      UnsupportedPassportEnum.FAILED_HASH_ALG_DETAILS,
      circuitName,
    )
  }
  const packagedCircuit = await getPackagedCircuit(circuitName, circuitManifest)
  if (packagedCircuit) {
    return {
      ...packagedCircuit,
      // This is necessary cause the name changed with 0.5.0 but not the vkey
      // so because of cache issue the old name is returned by the server
      // TODO: remove when the vkey of the circuit changes or when the cache is invalidated
      name: parseObsoleteCircuitName(circuitName),
    }
  }
  throw createUnsupportedPassportError(
    UnsupportedPassportEnum.NOT_SUPPORTED,
    circuitName,
    "Getting integrity check circuit for unsupported ID",
  )
}

export async function getDiscloseCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("disclose_bytes_evm", circuitManifest)
    : getPackagedCircuit("disclose_bytes", circuitManifest)
}

export async function getNationalityExclusionCheckCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("exclusion_check_nationality_evm", circuitManifest)
    : getPackagedCircuit("exclusion_check_nationality", circuitManifest)
}

export async function getNationalityInclusionCheckCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("inclusion_check_nationality_evm", circuitManifest)
    : getPackagedCircuit("inclusion_check_nationality", circuitManifest)
}

export async function getIssuingCountryExclusionCheckCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("exclusion_check_issuing_country_evm", circuitManifest)
    : getPackagedCircuit("exclusion_check_issuing_country", circuitManifest)
}

export async function getIssuingCountryInclusionCheckCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("inclusion_check_issuing_country_evm", circuitManifest)
    : getPackagedCircuit("inclusion_check_issuing_country", circuitManifest)
}

export async function getAgeCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("compare_age_evm", circuitManifest)
    : getPackagedCircuit("compare_age", circuitManifest)
}

export async function getExpiryDateCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("compare_expiry_evm", circuitManifest)
    : getPackagedCircuit("compare_expiry", circuitManifest)
}

export async function getBirthDateCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("compare_birthdate_evm", circuitManifest)
    : getPackagedCircuit("compare_birthdate", circuitManifest)
}

export async function getBindCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("bind_evm", circuitManifest)
    : getPackagedCircuit("bind", circuitManifest)
}

export async function getSanctionsCircuit(
  circuitManifest: CircuitManifest,
  evm = false,
): Promise<PackagedCircuit> {
  return evm
    ? getPackagedCircuit("exclusion_check_sanctions_evm", circuitManifest)
    : getPackagedCircuit("exclusion_check_sanctions", circuitManifest)
}

export async function getFaceMatchCircuit(
  circuitManifest: CircuitManifest,
  attestationContainer: AttestationContainer,
  evm = false,
): Promise<PackagedCircuit> {
  if (Platform.OS === "android") {
    const intermediateCertificates = await getIntermediateCertificates(attestationContainer)
    const credentialCertificate = await getCredentialCertificateInfo(attestationContainer)
    const rootCertificate = await getRootCertificate(attestationContainer)
    const ik_count = intermediateCertificates.length
    let intermediate_certificates_str = ""
    for (let i = 0; i < ik_count; i++) {
      const intermediateCertificate = intermediateCertificates[i]
      const type = intermediateCertificate.type
      const key = intermediateCertificate.key
      const keyLength = type === "rsa" ? key.length * 8 : key.length * 4
      // The hash algorithm is retrieved from the sig alg details,
      // so it concerns the details of the parent certificate
      const hashAlgorithm =
        i < ik_count - 1
          ? intermediateCertificates[i + 1].sigHashAlgorithm
          : credentialCertificate.sigHashAlgorithm
      const circuitName = `ik_${type === "rsa" ? "rsa_" : "ecdsa_p"}${keyLength}_${hashAlgorithm}`
      intermediate_certificates_str += `${circuitName}_`
    }
    intermediate_certificates_str = intermediate_certificates_str.slice(0, -1)
    // We want to know how many intermediate certificates we have so that we can modify the circuit name.
    // The new circuit name will be facematch_ik_count_evm if evm is true and facematch_ik_count otherwise.
    const circuitName = `facematch_android_rk_${rootCertificate.type}_ik_count_${ik_count}_${intermediate_certificates_str}${evm ? "_evm" : ""}`
    return getPackagedCircuit(circuitName, circuitManifest)
  } else {
    return evm
      ? getPackagedCircuit("facematch_ios_evm", circuitManifest)
      : getPackagedCircuit("facematch_ios", circuitManifest)
  }
}

export async function getDisclosureCircuits(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  circuitManifest: CircuitManifest,
  domainName?: string,
  scope?: string,
  evm = false,
  facematchAttestation?: AttestationContainer,
  nullifierType?: NullifierType | null,
  oprfAuthProofs?: ProofResult[],
  oprfBeta?: bigint,
  oprfPrivateNullifier?: bigint,
  oprfKeyId?: string | null,
  onProgress?: (stage: string) => void,
): Promise<{ label: string; circuit: PackagedCircuit; inputs: any }[]> {
  const fields = Object.keys(query).filter((key) =>
    hasRequestedAccessToField(query, key as IDCredential),
  )
  const serviceScope = getServiceScopeHash(domainName!)
  const serviceSubScope = getServiceSubscopeHash(scope!)
  const circuits: { label: string; circuit: PackagedCircuit; inputs: any }[] = []
  let timestamp = getNowTimestamp()
  if (evm) {
    try {
      timestamp = await getLatestBlockTimestamp(RPC_URL)
      console.log("Latest block timestamp", timestamp)
    } catch (error: any) {
      console.log("Error getting latest block timestamp", error)
      timestamp = getNowTimestamp()
    }
  }
  const integrityToDisclosureSalts = getIntegrityToDisclosureSalts(salt)

  // Determine nullifier secret and OPRF proof based on nullifier type
  const isSalted = nullifierType === NullifierType.SALTED
  let nullifierSecret = BigInt(0)

  let oprfProof = OPRF_ZERO_PROOF
  if (isSalted) {
    // The OPRF server round-trip is network time, timed separately from the on-device steps.
    onProgress?.(TimingEvents.OprfServerRequestStart)
    const oprfResult = await evaluateOPRF(oprfPrivateNullifier!, oprfBeta!, {
      proofs: oprfAuthProofs!,
      oprf_key_id: oprfKeyId ?? OPRF_DEFAULT_KEY_ID,
    })
    onProgress?.(TimingEvents.OprfServerRequestComplete)
    oprfProof = oprfResult.oprfProof
    nullifierSecret = oprfResult.oprfOutput
  }
  for (const field of fields) {
    for (const key in query[field as IDCredential]) {
      switch (key) {
        case "eq":
        case "disclose":
          if (
            field !== "age" &&
            (field !== "expiry_date" || key === "disclose") &&
            (field !== "birthdate" || key === "disclose") &&
            !circuits.some((c) => c.label === "disclose_bytes" || c.label === "disclose_bytes_evm")
          ) {
            circuits.push({
              label: evm ? "disclose_bytes_evm" : "disclose_bytes",
              circuit: await getDiscloseCircuit(circuitManifest, evm),
              inputs: await getDiscloseCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "age" &&
            !circuits.some((c) => c.label === "compare_age" || c.label === "compare_age_evm")
          ) {
            circuits.push({
              label: evm ? "compare_age_evm" : "compare_age",
              circuit: await getAgeCircuit(circuitManifest, evm),
              inputs: await getAgeCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "expiry_date" &&
            key === "eq" &&
            !circuits.some((c) => c.label === "compare_expiry" || c.label === "compare_expiry_evm")
          ) {
            circuits.push({
              label: evm ? "compare_expiry_evm" : "compare_expiry",
              circuit: await getExpiryDateCircuit(circuitManifest, evm),
              inputs: await getExpiryDateCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "birthdate" &&
            key === "eq" &&
            !circuits.some(
              (c) => c.label === "compare_birthdate" || c.label === "compare_birthdate_evm",
            )
          ) {
            circuits.push({
              label: evm ? "compare_birthdate_evm" : "compare_birthdate",
              circuit: await getBirthDateCircuit(circuitManifest, evm),
              inputs: await getBirthdateCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          }
          break
        case "gte":
        case "gt":
        case "lte":
        case "lt":
        case "range":
          if (
            field === "age" &&
            !circuits.some((c) => c.label === "compare_age" || c.label === "compare_age_evm")
          ) {
            circuits.push({
              label: evm ? "compare_age_evm" : "compare_age",
              circuit: await getAgeCircuit(circuitManifest, evm),
              inputs: await getAgeCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "expiry_date" &&
            !circuits.some((c) => c.label === "compare_expiry" || c.label === "compare_expiry_evm")
          ) {
            circuits.push({
              label: evm ? "compare_expiry_evm" : "compare_expiry",
              circuit: await getExpiryDateCircuit(circuitManifest, evm),
              inputs: await getExpiryDateCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "birthdate" &&
            !circuits.some(
              (c) => c.label === "compare_birthdate" || c.label === "compare_birthdate_evm",
            )
          ) {
            circuits.push({
              label: evm ? "compare_birthdate_evm" : "compare_birthdate",
              circuit: await getBirthDateCircuit(circuitManifest, evm),
              inputs: await getBirthdateCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          }
          break
        case "in":
          if (
            field === "nationality" &&
            !circuits.some(
              (c) =>
                c.label === "inclusion_check_nationality" ||
                c.label === "inclusion_check_nationality_evm",
            )
          ) {
            const inputs = await getNationalityInclusionCircuitInputs(
              passport,
              query,
              integrityToDisclosureSalts,
              nullifierSecret,
              serviceScope,
              serviceSubScope,
              timestamp,
              oprfProof,
            )
            circuits.push({
              label: evm ? "inclusion_check_nationality_evm" : "inclusion_check_nationality",
              circuit: await getNationalityInclusionCheckCircuit(circuitManifest, evm),
              inputs: inputs,
            })
          } else if (
            field === "issuing_country" &&
            !circuits.some(
              (c) =>
                c.label === "inclusion_check_issuing_country" ||
                c.label === "inclusion_check_issuing_country_evm",
            )
          ) {
            circuits.push({
              label: evm
                ? "inclusion_check_issuing_country_evm"
                : "inclusion_check_issuing_country",
              circuit: await getIssuingCountryInclusionCheckCircuit(circuitManifest, evm),
              inputs: await getIssuingCountryInclusionCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          }
          break
        case "out":
          if (
            field === "nationality" &&
            !circuits.some(
              (c) =>
                c.label === "exclusion_check_nationality" ||
                c.label === "exclusion_check_nationality_evm",
            )
          ) {
            circuits.push({
              label: evm ? "exclusion_check_nationality_evm" : "exclusion_check_nationality",
              circuit: await getNationalityExclusionCheckCircuit(circuitManifest, evm),
              inputs: await getNationalityExclusionCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          } else if (
            field === "issuing_country" &&
            !circuits.some(
              (c) =>
                c.label === "exclusion_check_issuing_country" ||
                c.label === "exclusion_check_issuing_country_evm",
            )
          ) {
            circuits.push({
              label: evm
                ? "exclusion_check_issuing_country_evm"
                : "exclusion_check_issuing_country",
              circuit: await getIssuingCountryExclusionCheckCircuit(circuitManifest, evm),
              inputs: await getIssuingCountryExclusionCircuitInputs(
                passport,
                query,
                integrityToDisclosureSalts,
                nullifierSecret,
                serviceScope,
                serviceSubScope,
                timestamp,
                oprfProof,
              ),
            })
          }
          break
      }
    }
  }
  if (query.bind) {
    circuits.push({
      label: evm ? "bind_evm" : "bind",
      circuit: await getBindCircuit(circuitManifest, evm),
      inputs: await getBindCircuitInputs(
        passport,
        query,
        integrityToDisclosureSalts,
        nullifierSecret,
        serviceScope,
        serviceSubScope,
        timestamp,
        oprfProof,
      ),
    })
  }
  if (query.sanctions) {
    try {
      circuits.push({
        label: evm ? "exclusion_check_sanctions_evm" : "exclusion_check_sanctions",
        circuit: await getSanctionsCircuit(circuitManifest, evm),
        inputs: await getSanctionsExclusionCheckCircuitInputs(
          passport,
          query.sanctions.strict ?? false,
          integrityToDisclosureSalts,
          nullifierSecret,
          serviceScope,
          serviceSubScope,
          timestamp,
          oprfProof,
        ),
      })
    } catch (error: any) {
      if (error && error.message && error.message.includes("Target exists; use membership proof")) {
        // Throw a special error when the person is on the sanctions list
        // so the error can be forwarded more clearly to the user and the SDK
        throw new SanctionsFailedError()
      } else {
        throw error
      }
    }
  }
  if (query.facematch) {
    if (!facematchAttestation) {
      throw new CircuitError(
        CircuitErrorSubType.MissingAttestation,
        "Facematch attestation is required",
        {
          circuit_name: "facematch",
        },
      )
    }
    const attestationInputs = await generateFacematchCircuitInputs(
      facematchAttestation,
      passport,
      query,
      integrityToDisclosureSalts,
      serviceScope,
      serviceSubScope,
      timestamp,
    )
    // console.log(`✓ Got attestation inputs: ${JSON.stringify(attestationInputs)}`)
    const circuit = await getFaceMatchCircuit(circuitManifest, facematchAttestation, evm)
    if (Platform.OS === "ios") {
      // TODO: fix a cache issue with the circuit name
      // remove it when the circuit bytecode is changed and the assets are updated
      circuit.name = evm ? "facematch_ios_evm" : "facematch_ios"
    }
    circuits.push({
      label: evm ? "facematch_evm" : "facematch",
      circuit: circuit,
      inputs: attestationInputs,
    })
  }
  if (circuits.length === 0 || (circuits.length === 1 && circuits[0].label.includes("facematch"))) {
    // If no circuits are found, add a disclose circuit
    // This means we are just generating a proof of valid ID
    // and none of the data will be disclosed
    // Alternatively, if we are generating a proof for a facematch circuit, we need to add a disclose circuit
    // as the facematch circuit may be delegated and therefore have a nullifier set to 0 and we need
    // at least one circuit to be generated with a non-zero nullifier.
    circuits.push({
      label: evm ? "disclose_bytes_evm" : "disclose_bytes",
      circuit: await getDiscloseCircuit(circuitManifest, evm),
      inputs: await getDiscloseCircuitInputs(
        passport as any,
        query,
        integrityToDisclosureSalts,
        nullifierSecret,
        serviceScope,
        serviceSubScope,
        timestamp,
        oprfProof,
      ),
    })
  }
  return circuits
}

// Helper function to clear circuit cache
export async function clearCachedCircuitManifest(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await AsyncStorage.removeItem("circuit_manifest")
    } else {
      // On Android, use Expo FileSystem to avoid AsyncStorage size limits
      const fileInfo = await FileSystem.getInfoAsync(CIRCUIT_MANIFEST_FILE_PATH)
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(CIRCUIT_MANIFEST_FILE_PATH)
      }
    }
    await AsyncStorage.removeItem("circuit_version")
  } catch (error) {
    console.error("Error clearing circuit cache: " + error)
  }
}
