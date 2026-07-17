import { ID_CARD_CODES, RESIDENCE_PERMIT_CODES } from "@/lib/constants"
import { getDocumentType, getPassportFieldsFromQuery } from "@/lib/credentials"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { Query } from "@zkpassport/utils"

const mockPassports = [
  {
    ...PASSPORTS.john,
    mrz: "P<".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "PO".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "PA".concat(PASSPORTS.john.mrz.slice(2)),
  },
]

const mockIDCards = [
  {
    ...PASSPORTS.john,
    mrz: "ID".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "A<".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "C<".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "CA".concat(PASSPORTS.john.mrz.slice(2)),
  },
]

const mockResidencePermits = [
  {
    ...PASSPORTS.john,
    mrz: "IR".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "AR".concat(PASSPORTS.john.mrz.slice(2)),
  },
  {
    ...PASSPORTS.john,
    mrz: "CR".concat(PASSPORTS.john.mrz.slice(2)),
  },
]

describe("getDocumentType", () => {
  it("should return the correct document type", () => {
    expect(getDocumentType("P<")).toBe("passport")
    expect(getDocumentType("P")).toBe("passport")
    RESIDENCE_PERMIT_CODES.map((code) => {
      expect(getDocumentType(code)).toBe("residence_permit")
    })
    ID_CARD_CODES.map((code) => {
      expect(getDocumentType(code)).toBe("id_card")
    })
  })

  it("should query document type and get passport as document type for passport", () => {
    const query: Query = {
      document_type: {
        eq: "passport",
        disclose: true,
      },
    }
    mockPassports.forEach((passport) => {
      const result = getPassportFieldsFromQuery(query, passport)
      expect(result.document_type?.eq?.expected).toBe("passport")
      expect(result.document_type?.eq?.result).toBe(true)
      expect(result.document_type?.disclose?.result).toBe("passport")
    })
  })

  it("should query document type and get id card as document type for id card", () => {
    const query: Query = {
      document_type: {
        eq: "id_card",
        disclose: true,
      },
    }

    mockIDCards.forEach((idCard) => {
      const result = getPassportFieldsFromQuery(query, idCard)
      expect(result.document_type?.eq?.expected).toBe("id_card")
      expect(result.document_type?.eq?.result).toBe(true)
      expect(result.document_type?.disclose?.result).toBe("id_card")
    })
  })

  it("should query document type and get residence permit as document type for residence permit", () => {
    const query: Query = {
      document_type: {
        eq: "residence_permit",
        disclose: true,
      },
    }

    mockResidencePermits.forEach((residencePermit) => {
      const result = getPassportFieldsFromQuery(query, residencePermit)
      expect(result.document_type?.eq?.expected).toBe("residence_permit")
      expect(result.document_type?.eq?.result).toBe(true)
      expect(result.document_type?.disclose?.result).toBe("residence_permit")
    })
  })
})
