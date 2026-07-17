import { intervalToDuration } from "date-fns"
import { Buffer } from "buffer/"
import {
  Binary,
  countryCodeAlpha3ToName,
  ExtendedAlpha2Code,
  IntegrityToDisclosureSalts,
  PackagedCertificate,
  ProofResult,
  withRetry,
} from "@zkpassport/utils"
import { poseidon2Hash } from "@zkpassport/poseidon2"
import { PassportViewModel } from "@zkpassport/utils"
import { Alert, Platform } from "react-native"
import * as Device from "expo-device"
import i18n from "@/i18n/i18n"
import { enGB, fr } from "date-fns/locale"
import { ultraVkToFields } from "@zkpassport/utils"
import { API_URL, COUNTRIES_ALPHA_2_TO_NAME } from "./constants"
import { AuthorityKeyIdentifier, PrivateKeyUsagePeriod } from "@peculiar/asn1-x509"
import { AsnParser } from "@peculiar/asn1-schema"
import { TFunction } from "i18next"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { router } from "expo-router"
import * as FileSystem from "expo-file-system"

export function getMRZDate(date: string, thresholdYear: Date = new Date()): Date {
  if (date.length !== 6) {
    return new Date()
  }

  const year = parseInt(date.slice(0, 2), 10)
  const month = parseInt(date.slice(2, 4), 10) - 1 // JS months are 0-indexed
  const day = parseInt(date.slice(4, 6), 10)

  // Determine the century
  const century = year <= thresholdYear.getFullYear() % 100 ? 2000 : 1900

  const fullYear = century + year
  return new Date(Date.UTC(fullYear, month, day, 0, 0, 0, 0))
}

export function formatMRZDate(date: string, thresholdYear: Date = new Date()): string {
  const mrzDate = getMRZDate(date, thresholdYear)
  return formatDate(mrzDate)
}

export function formatTime(time: Date): string {
  return time.toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(i18n.language, {
    dateStyle: "short",
    timeZone: "UTC",
  })
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(i18n.language, {
    dateStyle: "long",
    timeZone: "UTC",
  })
}

export function capitalizeEveryWord(str: string): string {
  if (!str) return ""
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function getBitSize(number: number | string | bigint): number {
  return number.toString(2).length
}

export function getAge(dateOfBirth: string): number {
  const birthDate = getMRZDate(dateOfBirth)
  const today = new Date()
  const duration = intervalToDuration({
    start: birthDate,
    end: today,
  })
  return duration.years ?? 0
}

export function getOffsetInArray(
  array: any[],
  arrayToFind: any[],
  startPosition: number = 0,
): number {
  for (let i = startPosition; i < array.length; i++) {
    if (array.slice(i, i + arrayToFind.length).every((val, index) => val === arrayToFind[index])) {
      return i
    }
  }
  return -1
}

export function bigintToNumber(value: bigint): number {
  return Number(value)
}

export function bigintToBytes(value: bigint): number[] {
  const hexString = value.toString(16).padStart(2, "0")
  const bytes = []
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.slice(i, i + 2), 16))
  }
  return bytes
}

export function padArrayWithZeros(array: number[], length: number): number[] {
  return array.concat(Array(length - array.length).fill(0))
}

export function textToBytes(text: string) {
  return [...text].map((char) => char.charCodeAt(0))
}

export function hexToBytes(hex: string) {
  const hexWithoutPrefix = hex.startsWith("0x") ? hex.slice(2) : hex
  return hexWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
}

export function bytesToBigInt(bytes: number[]) {
  return BigInt(`0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`)
}

export function padHexToEven(hex: string) {
  return hex.length % 2 === 0 ? hex : `0${hex}`
}

export function hexToBase64(hex: string) {
  return Buffer.from(hexToBytes(hex)).toString("base64")
}

export function base64ToHex(base64: string) {
  return Buffer.from(base64, "base64").toString("hex")
}

export function getCurrentDateYYMMDD() {
  const date = new Date()
  return `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`
}

export async function sendAnonymousMetadata(
  passport: PassportViewModel,
  csc?: PackagedCertificate,
  isBecauseOfCrash: boolean = false,
  memoryTooLow: boolean = false,
  includeSignerInfo: boolean = false,
) {
  // Get the device uuid
  // TODO: Should this use the getOrCreateUuid function?
  const deviceUuid = await AsyncStorage.getItem("deviceUuid")
  if (!deviceUuid) {
    console.log("Device UUID not found")
  }

  const exportableSOD = passport.sod.getExportableSOD()
  let notBefore: number | undefined
  let notAfter: number | undefined
  try {
    const pkupBuffer = exportableSOD.certificate.tbs.extensions
      .get("privateKeyUsagePeriod")
      ?.value.toBuffer()
    if (pkupBuffer) {
      const pkup = AsnParser.parse(pkupBuffer, PrivateKeyUsagePeriod)
      notBefore = pkup.notBefore?.getTime() ?? 0 / 1000
      notAfter = pkup.notAfter?.getTime() ?? 0 / 1000
    }
  } catch (error) {
    console.error(error)
  }

  let authorityKeyIdentifier: string | undefined
  try {
    const akiBuffer = exportableSOD.certificate.tbs.extensions
      .get("authorityKeyIdentifier")
      ?.value.toBuffer()
    if (akiBuffer) {
      const parsed = AsnParser.parse(akiBuffer, AuthorityKeyIdentifier)
      if (parsed?.keyIdentifier?.buffer) {
        authorityKeyIdentifier = Binary.from(parsed.keyIdentifier.buffer).toHex().replace("0x", "")
      }
    }
  } catch (error) {
    console.error(error)
  }

  const data = {
    deviceUuid: deviceUuid,
    ldsVersion: passport.LDSVersion,
    sod: {
      ...exportableSOD,
      certificate: {
        ...exportableSOD.certificate,
        tbs: {
          ...exportableSOD.certificate.tbs,
          extensions: {
            authorityKeyIdentifier: authorityKeyIdentifier,
            privateKeyUsagePeriod: {
              notBefore: notBefore,
              notAfter: notAfter,
            },
          },
        },
      },
      ...(includeSignerInfo && { signerInfo: passport.sod.signerInfo }),
    },
    csc: csc,
    systemDate: getCurrentDateYYMMDD(),
    phone: Device.modelName,
    modelId: Device.modelId,
    ram: formatRAM(Device.totalMemory ?? 0),
    os: `${Platform.OS} ${Platform.Version}`,
    app: getVersion(),
    hasCrashed: isBecauseOfCrash,
    memoryTooLow: memoryTooLow,
  }
  const response = await fetch(API_URL + "/metadata", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metadata: JSON.stringify(data),
    }),
  })
  return response.json()
}

export function getVersion() {
  try {
    const appJson = require("../../app.json")
    const version = String(appJson.expo.version)
    return version
  } catch {
    return "unknown"
  }
}

export function formatRAM(ram: number) {
  return `${Math.round(ram / 1000 / 1000)} MB`
}

export function getRandomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function getRandomBytesHex(length: number) {
  return Binary.from(getRandomBytes(length)).toString("hex")
}

// Not the correct way to hash the verification key
// TODO: get the fields representation of the verification key
// and hash it
export function hashVerificationKey(verificationKey: string) {
  const vkeyBytes = hexToBytes(verificationKey)
  const fields = ultraVkToFields(new Uint8Array(vkeyBytes))
  return poseidon2Hash(fields.map((field) => BigInt(field))).toString(16)
}

export class TextDecoderPolyfill {
  decode(buffer: Uint8Array | ArrayBuffer): string {
    const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer)
    let result = ""
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i])
    }
    return result
  }
}

export class TextEncoderPolyfill {
  encode(str: string): Uint8Array {
    const arr = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i)
    }
    return arr
  }
}

export function getDateFNSLocale(language: string) {
  return language === "fr" ? fr : enGB
}

export function negativeBytesToPositiveBytes(bytes: number[]) {
  return bytes.map((byte) => (byte < 0 ? byte + 256 : byte))
}

export function getErrorMessage(error: any) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return JSON.stringify(error)
}

export function getCountryName(alpha3: string) {
  return countryCodeAlpha3ToName(alpha3)
}

export function getGender(gender: string) {
  if (gender === "M") {
    return "Male"
  } else if (gender === "F") {
    return "Female"
  } else {
    return "Other"
  }
}

export function getCountryNameAlpha2(alpha2: ExtendedAlpha2Code) {
  return COUNTRIES_ALPHA_2_TO_NAME[i18n.language as "en" | "fr"][alpha2]
}

export function needsLowMemoryProver(circuitSize: number) {
  const deviceRAM = Device.totalMemory ?? 0
  return (
    circuitSize >= 1048576 ||
    (circuitSize >= 524288 && deviceRAM < 6000000000) ||
    (circuitSize >= 262144 && deviceRAM < 4000000000)
  )
}

export function isAvailableRAMTooLow() {
  const deviceRAM = Device.totalMemory ?? 0
  // If the device has less than 1.5GB of RAM, we should warn the user
  // even with the low memory prover it might not be able to run
  // the circuit
  return deviceRAM < 1500000000
}

export async function checkRAMAndWarnUser(t: TFunction): Promise<{ proceed: boolean }> {
  const needsToWarnUser = isAvailableRAMTooLow()

  if (needsToWarnUser) {
    return new Promise((resolve) => {
      Alert.alert(t("memoryWarningTitle"), t("memoryWarning"), [
        {
          text: t("continue"),
          onPress: () => {
            resolve({
              proceed: true,
            })
          },
        },
        {
          text: t("cancel"),
          onPress: () => {
            resolve({
              proceed: false,
            })
          },
        },
      ])
    })
  }

  return {
    proceed: true,
  }
}

export function isMeetingMinVersion(version: string, minVersion: string) {
  const [major, minor, patch] = version.split(".").map(Number)
  const [minMajor, minMinor, minPatch] = minVersion.split(".").map(Number)
  return (
    major > minMajor ||
    (major === minMajor && minor > minMinor) ||
    (major === minMajor && minor === minMinor && patch >= minPatch)
  )
}

export function isValidBase64Image(image: any) {
  return (
    !!image &&
    typeof image === "string" &&
    /^data:image\/(png|jpeg|jpg);base64,/.test(image) &&
    image.length > 22
  )
}

export type UpdateCheckResult = {
  needToUpdate: boolean
  requiredVersion: string
}

export type SDKVersionCheckResult = {
  sdkVersion: string
  sdkVersionSupported: boolean
  sdkVersionRangeSupported: {
    min: string
    max?: string
  }
}

type VersionCheckResult = {
  appVersion?: UpdateCheckResult
  sdkVersion?: SDKVersionCheckResult
}

export type VersionCheck = {
  appVersion: boolean
  sdkVersion: boolean
}

export async function checkVersions(
  check: VersionCheck,
  scannedIdCount?: number | null,
  sdkVersion?: string | null,
  onMount?: boolean,
): Promise<VersionCheckResult> {
  try {
    const response = await withRetry(() =>
      fetch(API_URL + "/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: Platform.OS,
          appVersion: getVersion(),
          sdkVersion: sdkVersion,
          scannedIdCount,
          check: check,
          onMount: onMount ?? false,
        }),
      }),
    )
    const data = await response.json()
    return {
      appVersion: data.appVersion,
      sdkVersion: data.sdkVersion,
    }
  } catch {
    // If the call to the API fails, we dont want to block the flow.
    // This is purely informational and for UX, just return the input back.
    const defaultErrorSDKResponse: SDKVersionCheckResult = {
      sdkVersion: sdkVersion ?? "",
      sdkVersionSupported: true,
      sdkVersionRangeSupported: {
        min: "",
        max: "",
      },
    }
    const defaultErrorAppVersionResponse = {
      needToUpdate: false,
      requiredVersion: "",
    }

    if (check.sdkVersion && sdkVersion) {
      return {
        sdkVersion: defaultErrorSDKResponse,
      }
    }

    if (check.appVersion) {
      return {
        appVersion: defaultErrorAppVersionResponse,
      }
    }
    return {
      appVersion: defaultErrorAppVersionResponse,
      sdkVersion: defaultErrorSDKResponse,
    }
  }
}

export const handleIncorrectSDKVersion = (sdkInfo: SDKVersionCheckResult) => {
  if (sdkInfo.sdkVersionRangeSupported.max) {
    console.warn(
      `SDK version not supported. The website you are trying to connect to is using version ${sdkInfo.sdkVersion} while the currently installed ZKPassport app requires version ${sdkInfo.sdkVersionRangeSupported.min} up to ${sdkInfo.sdkVersionRangeSupported.max}. Please update your app to the latest version.`,
    )
  } else {
    console.warn(
      `SDK version not supported. The website you are trying to connect to is using version ${sdkInfo.sdkVersion} while the currently installed ZKPassport app requires version ${sdkInfo.sdkVersionRangeSupported.min} or higher. The website is not up to date, you can contact their support to ask them to make the update.`,
    )
  }

  // TODO: Send an event to the website about incompatible version
  // TODO: will have to clean up state here
  router.push({
    pathname: "/",
    params: {
      sdkVersionCheckResult: JSON.stringify(sdkInfo),
    },
  })
}

export function isCompatibleWithCurrentVersion(version: string, newVersion: string) {
  const [major, minor] = version.split(".").map(Number)
  const [newMajor, newMinor] = newVersion.split(".").map(Number)
  if (newMajor === 0 && major === 0) {
    return minor === newMinor
  }
  return major === newMajor
}

export function filterDuplicateProofs(proofs: ProofResult[]): ProofResult[] {
  return proofs.filter(
    (x, index, self) =>
      index === self.findIndex((t) => t.name === x.name && t.version === x.version),
  )
}

export function getEstimatedTimeToGenerateProof(circuitSize: number) {
  let expectedRawTime = 0
  // Android is generally slower than iOS
  if (circuitSize > 524288) {
    // Subgroup 2^20
    expectedRawTime = Platform.OS === "android" ? 40000 : 20000
  } else if (circuitSize > 262144) {
    // Subgroup 2^19
    expectedRawTime = Platform.OS === "android" ? 20000 : 10000
  } else if (circuitSize > 131072) {
    // Subgroup 2^18
    expectedRawTime = Platform.OS === "android" ? 10000 : 5000
  } else if (circuitSize > 65536) {
    // Subgroup 2^17
    expectedRawTime = Platform.OS === "android" ? 5000 : 2500
  } else {
    // Smaller subgroups
    expectedRawTime = Platform.OS === "android" ? 2500 : 1000
  }
  return expectedRawTime * 2
}

// Format date for display (YYMMDD -> DD/MM/YY)
export const formatDateDisplay = (dateStr: string) => {
  if (dateStr.length === 6) {
    const year = dateStr.slice(0, 2)
    const month = dateStr.slice(2, 4)
    const day = dateStr.slice(4, 6)
    return `${day}/${month}/${year}`
  }
  return ""
}

export function getPassportExpiryDate(passportExpiry: string) {
  return getMRZDate(
    passportExpiry,
    new Date(new Date().getFullYear() + 30, new Date().getMonth(), new Date().getDate()),
  )
}

export function formatExpiryDate(passportExpiry: string) {
  return formatMRZDate(
    passportExpiry,
    new Date(new Date().getFullYear() + 30, new Date().getMonth(), new Date().getDate()),
  )
}

export function increaseVersionPatch(version: string, increment = 1): string {
  const [major, minor, patch] = version.split(".").map(Number)
  return `${major}.${minor}.${patch + increment}`
}

export function increaseVersionMinor(version: string, increment = 1): string {
  const [major, minor, patch] = version.split(".").map(Number)
  if (major === 0) {
    // Follow the semver rules for 0.x.x versions
    // where the patch version is actually the minor
    return `${major}.${minor}.${patch + increment}`
  }
  return `${major}.${minor + increment}.${patch}`
}

export function increaseVersionMajor(version: string, increment = 1): string {
  const [major, minor, patch] = version.split(".").map(Number)
  if (major === 0) {
    // Follow the semver rules for 0.x.x versions
    // where the minor version is actually the major
    return `${major}.${minor + increment}.${patch}`
  }
  return `${major + increment}.${minor}.${patch}`
}

export function getPassportUniqueId(passport: PassportViewModel) {
  return bytesToHex(sha256(passport.sod.signerInfo.signature.toUInt8Array()))
}

export function trimZeroPadding(bytes: number[]) {
  let i = bytes.length - 1
  while (i >= 0 && bytes[i] === 0) {
    i--
  }
  return bytes.slice(0, i + 1)
}

/**
 * Derive a new salt from the private salt by hashing it
 * This salt can then be used as a public salt for proof delegation
 * of some disclosure proofs such as FaceMatch
 */
export function getPublicSalt(salt: bigint) {
  const publicSalt = Binary.from(sha256(Buffer.from(salt.toString(16), "hex"))).toBigInt()
  return publicSalt
}

/** Use the public salt for all disclosure proofs so the commitments match
 * But in practice only the FaceMatch disclosure proof will hide the inputs
 * using the private salt
 */
export function getIntegrityToDisclosureSalts(salt: bigint): IntegrityToDisclosureSalts {
  const publicSalt = getPublicSalt(salt)
  return {
    dg1Salt: BigInt(salt),
    dg2HashSalt: BigInt(publicSalt),
    expiryDateSalt: BigInt(publicSalt),
    privateNullifierSalt: BigInt(salt),
  }
}

export async function rpcRequest(
  rpcUrl: string,
  to: string,
  data: any,
  retryCount: number = 2,
): Promise<Response> {
  return withRetry(
    () =>
      fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Math.floor(Math.random() * 1000000),
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
      }),
    retryCount,
  )
}

export async function getLatestBlockTimestamp(rpcUrl: string): Promise<number> {
  const response = await rpcRequest(
    rpcUrl,
    // Multicall contract address
    "0xcA11bde05977b3631167028862bE2a173976CA11",
    // getCurrentBlockTimestamp function selector
    "0x0f28c97d",
  )
  const data = await response.json()
  return parseInt(data.result, 16)
}

export async function clearTempFiles() {
  const tempDir = FileSystem.cacheDirectory

  if (!tempDir) return

  try {
    const entries = await FileSystem.readDirectoryAsync(tempDir)

    await Promise.all(
      entries.map(async (name) => {
        const path = tempDir + name
        await FileSystem.deleteAsync(path, { idempotent: true })
      }),
    )
  } catch (e) {
    console.warn("Error clearing temp files", e)
  }
}

/**
 * Derive a secret from the master key using the derivation id
 * @param masterKey - The master key to derive the secret from
 * @param derivationId - The derivation id to use
 * @param length - The length in bytes of the secret to derive
 * @returns The derived secret as a hex string
 */
export async function deriveSecretFromMasterKey(
  masterKey: string,
  derivationId: string,
  length: number,
) {
  if (length > 32) {
    throw new Error("Length must be less than or equal to 32")
  }
  const masterKeyBuffer = Buffer.from(masterKey, "hex")
  const derivationIdBuffer = Buffer.from(derivationId, "hex")
  const derivedSecret = sha256(Buffer.concat([masterKeyBuffer, derivationIdBuffer]))
  return Binary.from(derivedSecret).slice(0, length).toString("hex")
}
