import { formatDateDisplay } from "@/lib"
import { getDocumentExpiry, getIDMetadata, runSafely } from "@/lib/errorUtils"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { PassportViewModel } from "@zkpassport/utils"

const documentExpiry = (currentPassport?: PassportViewModel, mrz?: string) =>
  runSafely(() => {
    if (currentPassport) {
      const expiry = currentPassport.passportExpiry
      return formatDateDisplay(expiry)
    } else if (mrz) {
      return getDocumentExpiry(mrz)
    }
    return undefined
  })

describe("DevMode passport MRZ", () => {
  // For the mock ids, they will fail and error if parseMRZ is called, goal is to avoid this from happening

  it("mock_id calling documentExpiry", () => {
    const john = PASSPORTS.john
    const expiry = documentExpiry(john)
    expect(expiry).toBe("01/01/35")
  })

  it("mock_id calling documentExpiry with mrz", () => {
    const mrz = PASSPORTS.john.mrz
    const expiry = documentExpiry(undefined, mrz)
    expect(expiry).toBe("350101")
  })

  it("get id_metadata for mock ids", async () => {
    const john = PASSPORTS.john
    const id_metadata = await getIDMetadata(john)

    expect(id_metadata).toBeDefined()
    expect(id_metadata.id_info.document_expiry).toBe("01/01/35")
    expect(id_metadata.id_info.document_type).toBe("passport")
    expect(id_metadata.id_info.document_type_code).toBe("P<")
    expect(id_metadata.id_info.document_issuer).toBe("ZKR")
    expect(id_metadata.id_info.document_nationality).toBe("ZKR")
    expect(id_metadata.id_info.redacted_sod).toBe(john.sod.getRedactedSOD().toBase64())
    expect(id_metadata.id_info.issuing_date).toBe("2025-11-11")
  })
})
