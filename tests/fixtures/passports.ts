import { PassportViewModel, SOD } from "@zkpassport/utils"
import { Binary } from "@zkpassport/utils"
import johnSODJson from "./john-miller-smith-rsa-2048-sha256.json"
import { sha256 } from "@noble/hashes/sha2.js"

const johnSOD = SOD.fromDER(Binary.fromBase64(johnSODJson.encoded))
// John Miller Smith's MRZ
const johnMRZ =
  "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
const johnDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(johnMRZ))

// Jane Doe's ID Card MRZ (3 lines of 30 characters each)
const janeDoeIDMRZ = [
  "I<ZKRZID222222<<<<<<<<<<<<<<<<",
  "9801157F3001018ZKR<<<<<<<<<<<2",
  "DOE<<JANE<<<<<<<<<<<<<<<<<<<<<",
].join("")

// Portuguese ID Card MRZ Specimen
export const extendedDocumentNumberMRZ = [
  "I<PRT007666667<ZZ00<<<<<<<<<<<",
  "8303143M3405293PRT<<<<<<<<<<<4",
  "CACADOR<DE<ARAUJO<<ANDRE<ESTEV",
].join("")

// Norwegian ID Card Specimen MRZ
export const mrzSpecimen = [
  "CANORGDC0001273230456<12345<<<",
  "5604230M2606118NOR<<<<<<<<<<<9",
  "OESTENBYEN<<AASAMUND<SPECIMEN<",
].join("")

export const ID_CARDS = {
  janeDoe: {
    documentNumber: "ZID222222",
    dateOfBirth: "980115",
    dateOfExpiry: "300101",
    nationality: "ZKR",
    gender: "F",
    fullName: "Jane Doe",
    firstName: "Jane",
    lastName: "Doe",
    mrz: janeDoeIDMRZ,
  },
}

export const PASSPORTS: {
  [key: string]: PassportViewModel
} = {
  john: {
    appVersion: "",
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
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    dateOfIssue: "",
    LDSVersion: "",
    dataGroups: [
      {
        groupNumber: 1,
        name: "DG1",
        hash: Binary.from(sha256(johnDG1.toUInt8Array())).toNumberArray(),
        value: johnDG1.toNumberArray(),
      },
      {
        groupNumber: 2,
        name: "DG2",
        hash: [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
          26, 27, 28, 29, 30, 31, 32,
        ],
        value: [],
      },
    ],
    dataGroupsHashAlgorithm: "SHA256",
    sod: johnSOD,
  },
}
