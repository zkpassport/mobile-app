import {
  AsnIntegerConverter,
  AsnProp,
  AsnPropTypes,
  AsnType,
  AsnTypeTypes,
} from "@peculiar/asn1-schema"

// Hash digest OIDs
export const OID_SHA1 = "1.3.14.3.2.26"
export const OID_SHA256 = "2.16.840.1.101.3.4.2.1"
export const OID_SHA384 = "2.16.840.1.101.3.4.2.2"
export const OID_SHA512 = "2.16.840.1.101.3.4.2.3"
export const OID_SHA224 = "2.16.840.1.101.3.4.2.4"

// Apple App Attest extension OIDs
export const OID_APPLE_AA_NONCE = "1.2.840.113635.100.8.2"
export const OID_APPLE_AA_KEY_USAGE = "1.2.840.113635.100.8.5"
export const OID_APPLE_AA_OS_INFORMATION = "1.2.840.113635.100.8.7"

/**
 * ```asn
 * AttestationType ::= ENUMERATED {
 *   faceMatch(1),
 *   geoLocation(2),
 * }
 * ```
 */
export enum AttestationType {
  faceMatch = 1,
  geoLocation = 2,
}

/**
 * ```asn
 * FaceMatchMode ::= ENUMERATED {
 *   regular(1),
 *   strict(2)
 * }
 * ```
 */
export enum FaceMatchMode {
  regular = 1,
  strict = 2,
}

/**
 * ```asn
 * CosineScore ::= INTEGER (-100000000..100000000)
 * ```
 * Cosine in [-1, 1] encoded as INTEGER (×10^8)
 * Example: 0.87321021 -> 87321021 ; -0.12345678 -> -12345678
 */
export type CosineScore = number

/**
 * ```asn
 * AlgorithmIdentifier ::= SEQUENCE {
 *   algorithm              OBJECT IDENTIFIER,
 *   parameters             ANY DEFINED BY algorithm OPTIONAL
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AlgorithmIdentifier {
  @AsnProp({ type: AsnPropTypes.ObjectIdentifier })
  public algorithm: string = ""

  @AsnProp({ type: AsnPropTypes.Any, optional: true })
  public parameters?: any

  public constructor(params: Partial<AlgorithmIdentifier> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * DigestInfo ::= SEQUENCE {
 *   algorithm              AlgorithmIdentifier,
 *   digest                 OCTET STRING (SIZE(20 | 32 | 48 | 64))
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class DigestInfo {
  @AsnProp({ type: AlgorithmIdentifier })
  public algorithm: AlgorithmIdentifier = new AlgorithmIdentifier()

  @AsnProp({ type: AsnPropTypes.OctetString })
  public digest: ArrayBuffer = new ArrayBuffer(0)

  public constructor(params: Partial<DigestInfo> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * FaceMatchAttestation ::= SEQUENCE {
 *   mode                    FaceMatchMode,
 *   dg2Hash                 DigestInfo,
 *   dg2FaceprintHash        OCTET STRING (SIZE(32)),
 *   cosineAvgSimilarity     CosineScore,
 *   cosineThreshold         CosineScore OPTIONAL
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class FaceMatchAttestation {
  @AsnProp({ type: AsnPropTypes.Enumerated })
  public mode: FaceMatchMode = FaceMatchMode.regular

  @AsnProp({ type: DigestInfo })
  public dg2Hash: DigestInfo = new DigestInfo()

  @AsnProp({ type: AsnPropTypes.OctetString })
  public dg2FaceprintHash: ArrayBuffer = new ArrayBuffer(32)

  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public cosineAvgSimilarity: CosineScore = 0

  @AsnProp({ type: AsnPropTypes.Integer, optional: true, converter: AsnIntegerConverter })
  public cosineThreshold?: CosineScore

  public constructor(params: Partial<FaceMatchAttestation> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * GeoLocationAttestation ::= SEQUENCE {
 *   latMicroDegrees        INTEGER (-90000000..90000000),
 *   lonMicroDegrees        INTEGER (-180000000..180000000),
 *   accuracyMm             INTEGER (0..100000000) OPTIONAL,
 *   timestamp              GeneralizedTime
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class GeoLocationAttestation {
  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public latMicroDegrees: number = 0

  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public lonMicroDegrees: number = 0

  @AsnProp({ type: AsnPropTypes.Integer, optional: true, converter: AsnIntegerConverter })
  public accuracyMm?: number

  @AsnProp({ type: AsnPropTypes.GeneralizedTime })
  public timestamp: Date = new Date()

  public constructor(params: Partial<GeoLocationAttestation> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * AttestationData ::= CHOICE {
 *   faceMatch   [1] EXPLICIT FaceMatchAttestation,
 *   geoLocation [2] EXPLICIT GeoLocationAttestation,
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Choice })
export class AttestationData {
  @AsnProp({ type: FaceMatchAttestation, context: 1, implicit: false })
  public faceMatch?: FaceMatchAttestation

  @AsnProp({ type: GeoLocationAttestation, context: 2, implicit: false })
  public geoLocation?: GeoLocationAttestation

  public constructor(params: Partial<AttestationData> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * ZKPassportAppAttest ::= SEQUENCE {
 *   version               INTEGER (1),
 *   appVersion            UTF8String (SIZE(1..64)),
 *   attestationType       AttestationType,
 *   attestationData       AttestationData
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class ZKPassportAppAttest {
  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public version: number = 1

  @AsnProp({ type: AsnPropTypes.Utf8String })
  public appVersion: string = ""

  @AsnProp({ type: AsnPropTypes.Enumerated })
  public attestationType: AttestationType = AttestationType.faceMatch

  @AsnProp({ type: AttestationData })
  public attestationData: AttestationData = new AttestationData()

  public constructor(params: Partial<ZKPassportAppAttest> = {}) {
    Object.assign(this, params)
  }
}

/**
 * Apple Device Attestation Key Usage Properties (OID: 1.2.840.113635.100.8.5)
 *
 * ```asn
 * AppleDeviceAttestationKeyUsageProperties ::= SEQUENCE {
 *   version              [4]    INTEGER,               -- seen: 10
 *   flag1200             [1200] INTEGER,               -- seen: 1
 *   flag1201             [1201] INTEGER,               -- seen: 0
 *   flag1202             [1202] INTEGER,               -- seen: 1
 *   flag1203             [1203] INTEGER,               -- seen: 1
 *   appIdentifier        [1204] OCTET STRING,          -- "TEAMID.bundle.suffix" (UTF-8)
 *   componentTag         [5]    OCTET STRING,          -- "sks" (marks SKS/SEP block)
 *   sksMajor             [1206] INTEGER,               -- e.g. 5
 *   sksMinor             [1207] INTEGER,               -- e.g. 0
 *   sksPatch             [1209] INTEGER,               -- e.g. 0
 *   sksBuild             [1210] INTEGER,               -- e.g. 0
 *   sksRevision          [1211] INTEGER,               -- e.g. 0
 *   reserved10           [10]   INTEGER,               -- usually 0
 *   sksBuildId           [1212] INTEGER                -- opaque 32-bit ID (e.g. 1936421664)
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AppleDeviceAttestationKeyUsageProperties {
  @AsnProp({ type: AsnPropTypes.Integer, context: 4 })
  public version: number = 10

  @AsnProp({ type: AsnPropTypes.Integer, context: 1200, optional: true })
  public flag1200?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1201, optional: true })
  public flag1201?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1202, optional: true })
  public flag1202?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1203, optional: true })
  public flag1203?: number

  @AsnProp({ type: AsnPropTypes.OctetString, context: 1204, optional: true })
  public appId?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 5, optional: true })
  public componentTag?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.Integer, context: 1206, optional: true })
  public sksMajor?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1207, optional: true })
  public sksMinor?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1209, optional: true })
  public sksPatch?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1210, optional: true })
  public sksBuild?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1211, optional: true })
  public sksRevision?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 10, optional: true })
  public reserved10?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 1212, optional: true })
  public sksBuildId?: number

  public constructor(params: Partial<AppleDeviceAttestationKeyUsageProperties> = {}) {
    Object.assign(this, params)
  }
}

@AsnType({ type: AsnTypeTypes.Sequence })
export class AppleDeviceOSInformation {
  // [1400] "18.6.2"
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1400, optional: true })
  productVersion?: ArrayBuffer

  // [1104] INTEGER 2  (platform: 2 = iPhoneOS)
  @AsnProp({ type: AsnPropTypes.Integer, context: 1104, optional: true })
  platform?: number

  // [1401] "1.0.198" (component/lib version)
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1401, optional: true })
  componentVersion?: ArrayBuffer

  // [1403] "22G100" (ProductBuildVersion)
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1403, optional: true })
  buildNumber?: ArrayBuffer

  // [1404], [1405] extra repeats of productVersion
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1404, optional: true })
  productVersion2?: ArrayBuffer
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1405, optional: true })
  productVersion3?: ArrayBuffer

  // [1406]..[1413] small integers (flags/counters)
  @AsnProp({ type: AsnPropTypes.Integer, context: 1406, optional: true }) f1406?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1407, optional: true }) f1407?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1408, optional: true }) f1408?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1409, optional: true }) f1409?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1410, optional: true }) f1410?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1411, optional: true }) f1411?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1412, optional: true }) f1412?: number
  @AsnProp({ type: AsnPropTypes.Integer, context: 1413, optional: true }) f1413?: number

  // [1418]..[1420] "22.7.100.0.0,0" (SEP/SKS version strings)
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1418, optional: true })
  sepVersion?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 1419, optional: true })
  sepVersion2?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 1420, optional: true })
  sepVersion3?: ArrayBuffer

  // [1026] "iphoneos" (platform name)
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1026, optional: true })
  platformName_?: ArrayBuffer

  // Helpers
  private static toStr(ab?: ArrayBuffer) {
    return ab ? Buffer.from(new Uint8Array(ab)).toString("utf8") : undefined
  }
  get osVersion() {
    return (
      AppleDeviceOSInformation.toStr(this.productVersion) ??
      AppleDeviceOSInformation.toStr(this.productVersion2) ??
      AppleDeviceOSInformation.toStr(this.productVersion3)
    )
  }
  get osBuild() {
    return AppleDeviceOSInformation.toStr(this.buildNumber)
  }
  get sep() {
    return (
      AppleDeviceOSInformation.toStr(this.sepVersion) ??
      AppleDeviceOSInformation.toStr(this.sepVersion2) ??
      AppleDeviceOSInformation.toStr(this.sepVersion3)
    )
  }
  get platformName() {
    return AppleDeviceOSInformation.toStr(this.platformName_)
  }
}

// Android Key Attestation extension OID
export const OID_ANDROID_KEY_ATTESTATION = "1.3.6.1.4.1.11129.2.1.17"

/**
 * Android Key Attestation Security Levels
 */
export enum AndroidSecurityLevel {
  Software = 0,
  TrustedEnvironment = 1,
  StrongBox = 2,
}

/**
 * Android Key Attestation Purposes (from KeyProperties)
 */
export enum AndroidKeyPurpose {
  ENCRYPT = 0,
  DECRYPT = 1,
  SIGN = 2,
  VERIFY = 3,
  DERIVE_KEY = 4,
  WRAP_KEY = 5,
  AGREE_KEY = 6,
  ATTEST_KEY = 7,
}

/**
 * Android Key Attestation Algorithms
 */
export enum AndroidKeyAlgorithm {
  RSA = 1,
  EC = 3,
  AES = 32,
  TRIPLE_DES = 33,
  HMAC = 128,
}

/**
 * Android Key Attestation Digests
 */
export enum AndroidKeyDigest {
  NONE = 0,
  MD5 = 1,
  SHA1 = 2,
  SHA224 = 3,
  SHA256 = 4,
  SHA384 = 5,
  SHA512 = 6,
}

/**
 * Android Key Attestation Padding Modes
 */
export enum AndroidKeyPadding {
  NONE = 1,
  RSA_OAEP = 2,
  RSA_PSS = 3,
  RSA_PKCS1_1_5_ENCRYPT = 4,
  RSA_PKCS1_1_5_SIGN = 5,
}

/**
 * Android Key Attestation EC Curves
 */
export enum AndroidEcCurve {
  P224 = 0,
  P256 = 1,
  P384 = 2,
  P521 = 3,
  CURVE_25519 = 4,
}

/**
 * Android Key Attestation Origin
 */
export enum AndroidKeyOrigin {
  GENERATED = 0,
  DERIVED = 1,
  IMPORTED = 2,
  UNKNOWN = 3,
  SECURELY_IMPORTED = 4,
}

@AsnType({ type: AsnTypeTypes.Sequence })
export class AttestationPackageInfo {
  // [1] OCTET STRING
  @AsnProp({ type: AsnPropTypes.OctetString, context: 1 })
  public package_name?: ArrayBuffer

  // [2] INTEGER
  @AsnProp({ type: AsnPropTypes.Integer, context: 2, converter: AsnIntegerConverter })
  public version?: number
}

/**
 * Android Key Attestation Application ID
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AttestationApplicationId {
  // [1] SET OF AttestationPackageInfo
  @AsnProp({ type: AttestationPackageInfo, context: 1, repeated: "set" })
  public packageInfos?: AttestationPackageInfo[]
}

/**
 * ```asn
 * AuthorizationList ::= SEQUENCE {
 *   purpose                    [1] EXPLICIT SET OF INTEGER OPTIONAL,
 *   algorithm                  [2] EXPLICIT INTEGER OPTIONAL,
 *   keySize                    [3] EXPLICIT INTEGER OPTIONAL,
 *   digest                     [5] EXPLICIT SET OF INTEGER OPTIONAL,
 *   padding                    [6] EXPLICIT SET OF INTEGER OPTIONAL,
 *   ecCurve                    [10] EXPLICIT INTEGER OPTIONAL,
 *   rsaPublicExponent          [200] EXPLICIT INTEGER OPTIONAL,
 *   mgfDigest                  [203] EXPLICIT SET OF INTEGER OPTIONAL,
 *   rollbackResistance         [303] EXPLICIT NULL OPTIONAL,
 *   earlyBootOnly              [305] EXPLICIT NULL OPTIONAL,
 *   activeDateTime             [400] EXPLICIT INTEGER OPTIONAL,
 *   originationExpireDateTime  [401] EXPLICIT INTEGER OPTIONAL,
 *   usageExpireDateTime        [402] EXPLICIT INTEGER OPTIONAL,
 *   usageCountLimit            [405] EXPLICIT INTEGER OPTIONAL,
 *   noAuthRequired             [503] EXPLICIT NULL OPTIONAL,
 *   userAuthType               [504] EXPLICIT INTEGER OPTIONAL,
 *   authTimeout                [505] EXPLICIT INTEGER OPTIONAL,
 *   allowWhileOnBody           [506] EXPLICIT NULL OPTIONAL,
 *   trustedUserPresenceRequired [507] EXPLICIT NULL OPTIONAL,
 *   trustedConfirmationRequired [508] EXPLICIT NULL OPTIONAL,
 *   unlockedDeviceRequired     [509] EXPLICIT NULL OPTIONAL,
 *   allApplications            [600] EXPLICIT NULL OPTIONAL,
 *   applicationId              [601] EXPLICIT OCTET STRING OPTIONAL,
 *   creationDateTime           [701] EXPLICIT INTEGER OPTIONAL,
 *   origin                     [702] EXPLICIT INTEGER OPTIONAL,
 *   rollbackResistant          [703] EXPLICIT NULL OPTIONAL,
 *   rootOfTrust                [704] EXPLICIT RootOfTrust OPTIONAL,
 *   osVersion                  [705] EXPLICIT INTEGER OPTIONAL,
 *   osPatchLevel               [706] EXPLICIT INTEGER OPTIONAL,
 *   attestationApplicationId   [709] EXPLICIT AttestationApplicationId OPTIONAL,
 *   attestationIdBrand         [710] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdDevice        [711] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdProduct       [712] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdSerial        [713] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdImei          [714] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdMeid          [715] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdManufacturer  [716] EXPLICIT OCTET STRING OPTIONAL,
 *   attestationIdModel         [717] EXPLICIT OCTET STRING OPTIONAL,
 *   vendorPatchLevel           [718] EXPLICIT INTEGER OPTIONAL,
 *   bootPatchLevel             [719] EXPLICIT INTEGER OPTIONAL,
 *   deviceUniqueAttestation    [720] EXPLICIT NULL OPTIONAL,
 *   attestationIdSecondImei    [723] EXPLICIT OCTET STRING OPTIONAL
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AndroidAuthorizationList {
  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 1,
    implicit: false,
    repeated: "set",
    optional: true,
  })
  public purpose?: number[]

  @AsnProp({ type: AsnPropTypes.Integer, context: 2, implicit: false, optional: true })
  public algorithm?: AndroidKeyAlgorithm

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 3,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public keySize?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 5,
    implicit: false,
    repeated: "set",
    optional: true,
  })
  public digest?: number[]

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 6,
    implicit: false,
    repeated: "set",
    optional: true,
  })
  public padding?: number[]

  @AsnProp({ type: AsnPropTypes.Integer, context: 10, implicit: false, optional: true })
  public ecCurve?: AndroidEcCurve

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 200,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public rsaPublicExponent?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 203,
    implicit: false,
    repeated: "set",
    optional: true,
  })
  public mgfDigest?: number[]

  @AsnProp({ type: AsnPropTypes.Null, context: 303, implicit: false, optional: true })
  public rollbackResistance?: null

  @AsnProp({ type: AsnPropTypes.Null, context: 305, implicit: false, optional: true })
  public earlyBootOnly?: null

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 400,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public activeDateTime?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 401,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public originationExpireDateTime?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 402,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public usageExpireDateTime?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 405,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public usageCountLimit?: number

  @AsnProp({ type: AsnPropTypes.Null, context: 503, implicit: false, optional: true })
  public noAuthRequired?: null

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 504,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public userAuthType?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 505,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public authTimeout?: number

  @AsnProp({ type: AsnPropTypes.Null, context: 506, implicit: false, optional: true })
  public allowWhileOnBody?: null

  @AsnProp({ type: AsnPropTypes.Null, context: 507, implicit: false, optional: true })
  public trustedUserPresenceRequired?: null

  @AsnProp({ type: AsnPropTypes.Null, context: 508, implicit: false, optional: true })
  public trustedConfirmationRequired?: null

  @AsnProp({ type: AsnPropTypes.Null, context: 509, implicit: false, optional: true })
  public unlockedDeviceRequired?: null

  @AsnProp({ type: AsnPropTypes.Null, context: 600, implicit: false, optional: true })
  public allApplications?: null

  @AsnProp({ type: AsnPropTypes.OctetString, context: 601, implicit: false, optional: true })
  public applicationId?: ArrayBuffer

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 701,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public creationDateTime?: number

  @AsnProp({ type: AsnPropTypes.Integer, context: 702, implicit: false, optional: true })
  public origin?: AndroidKeyOrigin

  @AsnProp({ type: AsnPropTypes.Null, context: 703, implicit: false, optional: true })
  public rollbackResistant?: null

  @AsnProp({ type: AsnPropTypes.OctetString, context: 704, implicit: false, optional: true })
  public rootOfTrust?: ArrayBuffer // Will be parsed as RootOfTrust when needed

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 705,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public osVersion?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 706,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public osPatchLevel?: number

  @AsnProp({ type: AsnPropTypes.OctetString, context: 709, implicit: false, optional: true })
  public attestationApplicationId?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 710, implicit: false, optional: true })
  public attestationIdBrand?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 711, implicit: false, optional: true })
  public attestationIdDevice?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 712, implicit: false, optional: true })
  public attestationIdProduct?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 713, implicit: false, optional: true })
  public attestationIdSerial?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 714, implicit: false, optional: true })
  public attestationIdImei?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 715, implicit: false, optional: true })
  public attestationIdMeid?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 716, implicit: false, optional: true })
  public attestationIdManufacturer?: ArrayBuffer

  @AsnProp({ type: AsnPropTypes.OctetString, context: 717, implicit: false, optional: true })
  public attestationIdModel?: ArrayBuffer

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 718,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public vendorPatchLevel?: number

  @AsnProp({
    type: AsnPropTypes.Integer,
    context: 719,
    implicit: false,
    optional: true,
    converter: AsnIntegerConverter,
  })
  public bootPatchLevel?: number

  @AsnProp({ type: AsnPropTypes.Null, context: 720, implicit: false, optional: true })
  public deviceUniqueAttestation?: null

  @AsnProp({ type: AsnPropTypes.OctetString, context: 723, implicit: false, optional: true })
  public attestationIdSecondImei?: ArrayBuffer

  public constructor(params: Partial<AndroidAuthorizationList> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * RootOfTrust ::= SEQUENCE {
 *   verifiedBootKey            OCTET STRING,
 *   deviceLocked               BOOLEAN,
 *   verifiedBootState          VerifiedBootState,
 *   verifiedBootHash           OCTET STRING
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AndroidRootOfTrust {
  @AsnProp({ type: AsnPropTypes.OctetString })
  public verifiedBootKey: ArrayBuffer = new ArrayBuffer(0)

  @AsnProp({ type: AsnPropTypes.Boolean })
  public deviceLocked: boolean = false

  @AsnProp({ type: AsnPropTypes.Enumerated })
  public verifiedBootState: number = 0 // VerifiedBootState enum

  @AsnProp({ type: AsnPropTypes.OctetString })
  public verifiedBootHash: ArrayBuffer = new ArrayBuffer(0)

  public constructor(params: Partial<AndroidRootOfTrust> = {}) {
    Object.assign(this, params)
  }
}

/**
 * ```asn
 * KeyDescription ::= SEQUENCE {
 *   attestationVersion         INTEGER,
 *   attestationSecurityLevel   SecurityLevel,
 *   keymasterVersion           INTEGER,
 *   keymasterSecurityLevel     SecurityLevel,
 *   attestationChallenge       OCTET STRING,
 *   uniqueId                   OCTET STRING,
 *   softwareEnforced           AuthorizationList,
 *   teeEnforced                AuthorizationList
 * }
 * ```
 */
@AsnType({ type: AsnTypeTypes.Sequence })
export class AndroidKeyDescription {
  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public attestationVersion: number = 0

  @AsnProp({ type: AsnPropTypes.Enumerated })
  public attestationSecurityLevel: AndroidSecurityLevel = AndroidSecurityLevel.Software

  @AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
  public keymasterVersion: number = 0

  @AsnProp({ type: AsnPropTypes.Enumerated })
  public keymasterSecurityLevel: AndroidSecurityLevel = AndroidSecurityLevel.Software

  @AsnProp({ type: AsnPropTypes.OctetString })
  public attestationChallenge: ArrayBuffer = new ArrayBuffer(0)

  @AsnProp({ type: AsnPropTypes.OctetString })
  public uniqueId: ArrayBuffer = new ArrayBuffer(0)

  @AsnProp({ type: AndroidAuthorizationList, implicit: true })
  public softwareEnforced: AndroidAuthorizationList = new AndroidAuthorizationList()

  @AsnProp({ type: AndroidAuthorizationList, implicit: true })
  public teeEnforced: AndroidAuthorizationList = new AndroidAuthorizationList()

  public constructor(params: Partial<AndroidKeyDescription> = {}) {
    Object.assign(this, params)
  }
}
