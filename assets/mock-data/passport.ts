import { Buffer } from "buffer/"
globalThis.Buffer = Buffer as any

import { Binary, DigestAlgorithm, PassportViewModel, SOD } from "@zkpassport/utils"
import photo from "./photo.json"
import { getVersion } from "@/lib"
import johnSODJson from "./john-miller-smith-rsa-2048-sha256.json"
import janeSODJson from "./jane-miller-smith-rsa-3072-sha384.json"
import marySODJson from "./mary-miller-smith-ecdsa-p256-sha256.json"
import paulSODJson from "./paul-miller-smith-ecdsa-p384-sha384.json"
import stephanieSODJson from "./stephanie-miller-smith-ecdsa-p521-sha512.json"
import jackSODJson from "./jack-miller-smith-rsa-4096-sha512.json"
import misterSanctionedSODJson from "./mister-sanctioned-rsa-2048-sha256.json"

const johnSOD = SOD.fromDER(Binary.fromBase64(johnSODJson.encoded))
// John Miller Smith's MRZ
const johnMRZ =
  "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
const johnDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(johnMRZ))

const janeSOD = SOD.fromDER(Binary.fromBase64(janeSODJson.encoded))
// Jane Miller Smith's MRZ
const janeMRZ =
  "P<ZKRSMITH<<JANE<MILLER<<<<<<<<<<<<<<<<<<<<<ZP3333333_ZKR090225_F270101_<<<<<<<<<<<<<<<<"
const janeDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(janeMRZ))

const jackSOD = SOD.fromDER(Binary.fromBase64(jackSODJson.encoded))
// Jack Miller Smith's MRZ
const jackMRZ =
  "P<ZKRSMITH<<JACK<MILLER<<<<<<<<<<<<<<<<<<<<<ZP4444444_ZKR020414_M280101_<<<<<<<<<<<<<<<<"
const jackDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(jackMRZ))

const marySOD = SOD.fromDER(Binary.fromBase64(marySODJson.encoded))
// Mary Miller Smith's MRZ
const maryMRZ =
  "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<"
const maryDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(maryMRZ))

const paulSOD = SOD.fromDER(Binary.fromBase64(paulSODJson.encoded))
// Paul Miller Smith's MRZ
const paulMRZ =
  "P<ZKRSMITH<<PAUL<MILLER<<<<<<<<<<<<<<<<<<<<<ZP6666666_ZKR500717_M310101_<<<<<<<<<<<<<<<<"
const paulDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(paulMRZ))

const stephanieSOD = SOD.fromDER(Binary.fromBase64(stephanieSODJson.encoded))
// Stephanie Miller Smith's MRZ
const stephanieMRZ =
  "P<ZKRSMITH<<STEPHANIE<MILLER<<<<<<<<<<<<<<<<ZP5555555_ZKR150503_F290101_<<<<<<<<<<<<<<<<"
const stephanieDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(stephanieMRZ))

// Mister Sanctioned SOD
const misterSanctionedSOD = SOD.fromDER(Binary.fromBase64(misterSanctionedSODJson.encoded))
// Mister Sanctioned MRZ
const misterSanctionedMRZ =
  "P<ZKRSANCTIONED<<MISTER<<<<<<<<<<<<<<<<<<<<<ZP7777777_ZKR750101_M300201_<<<<<<<<<<<<<<<<"
const misterSanctionedDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(misterSanctionedMRZ))

export const PASSPORTS: {
  [key: string]: PassportViewModel
} = {
  john: {
    appVersion: getVersion(),
    mrz: johnMRZ,
    name: "John Smith",
    dateOfBirth: "951112",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    photo: photo.male,
    originalPhoto: photo.male,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(johnSOD.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? (johnDG1?.toNumberArray() ?? []) : [],
      }),
    ),
    dataGroupsHashAlgorithm: johnSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: johnSOD,
  },
  mary: {
    appVersion: getVersion(),
    mrz: maryMRZ,
    name: "Mary Smith",
    dateOfBirth: "750302",
    nationality: "ZKR",
    gender: "F",
    passportNumber: "ZP2222222",
    passportExpiry: "300101",
    firstName: "Mary",
    lastName: "Smith",
    fullName: "Mary Miller Smith",
    photo: photo.female,
    originalPhoto: photo.female,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(marySOD.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? (maryDG1?.toNumberArray() ?? []) : [],
      }),
    ),
    dataGroupsHashAlgorithm: marySOD.encapContentInfo.eContent.hashAlgorithm,
    sod: marySOD,
  },
  jane: {
    appVersion: getVersion(),
    mrz: janeMRZ,
    name: "Jane Smith",
    dateOfBirth: "090225",
    nationality: "ZKR",
    gender: "F",
    passportNumber: "ZP3333333",
    passportExpiry: "270101",
    firstName: "Jane",
    lastName: "Smith",
    fullName: "Jane Miller Smith",
    photo: photo.female,
    originalPhoto: photo.female,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(janeSOD.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? (janeDG1?.toNumberArray() ?? []) : [],
      }),
    ),
    dataGroupsHashAlgorithm: janeSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: janeSOD,
  },
  jack: {
    appVersion: getVersion(),
    mrz: jackMRZ,
    name: "Jack Smith",
    dateOfBirth: "020414",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP4444444",
    passportExpiry: "280101",
    firstName: "Jack",
    lastName: "Smith",
    fullName: "Jack Miller Smith",
    photo: photo.male,
    originalPhoto: photo.male,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(jackSOD.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? (jackDG1?.toNumberArray() ?? []) : [],
      }),
    ),
    dataGroupsHashAlgorithm: jackSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: jackSOD,
  },
  paul: {
    appVersion: getVersion(),
    mrz: paulMRZ,
    name: "Paul Smith",
    dateOfBirth: "500717",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP6666666",
    passportExpiry: "310101",
    firstName: "Paul",
    lastName: "Smith",
    fullName: "Paul Miller Smith",
    photo: photo.male,
    originalPhoto: photo.male,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(paulSOD.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? (paulDG1?.toNumberArray() ?? []) : [],
      }),
    ),
    dataGroupsHashAlgorithm: paulSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: paulSOD,
  },
  stephanie: {
    appVersion: getVersion(),
    mrz: stephanieMRZ,
    name: "Stephanie Smith",
    dateOfBirth: "150503",
    nationality: "ZKR",
    gender: "F",
    passportNumber: "ZP5555555",
    passportExpiry: "290101",
    firstName: "Stephanie",
    lastName: "Smith",
    fullName: "Stephanie Miller Smith",
    photo: photo.female,
    originalPhoto: photo.female,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(
      stephanieSOD.encapContentInfo.eContent.dataGroupHashValues.values,
    ).map(([key, value]) => ({
      groupNumber: Number(key),
      name: "DG" + key,
      hash: value.toNumberArray(),
      value: key === "1" ? (stephanieDG1?.toNumberArray() ?? []) : [],
    })),
    dataGroupsHashAlgorithm: stephanieSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: stephanieSOD,
  },
  misterSanctioned: {
    appVersion: getVersion(),
    mrz: misterSanctionedMRZ,
    name: "Mister Sanctioned",
    dateOfBirth: "750101",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP7777777",
    passportExpiry: "300201",
    firstName: "Mister",
    lastName: "Sanctioned",
    fullName: "Mister Sanctioned",
    photo: photo.male,
    originalPhoto: photo.male,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(
      misterSanctionedSOD.encapContentInfo.eContent.dataGroupHashValues.values,
    ).map(([key, value]) => ({
      groupNumber: Number(key),
      name: "DG" + key,
      hash: value.toNumberArray(),
      value: key === "1" ? (misterSanctionedDG1?.toNumberArray() ?? []) : [],
    })),
    dataGroupsHashAlgorithm: misterSanctionedSOD.encapContentInfo.eContent.hashAlgorithm,
    sod: misterSanctionedSOD,
  },
}
