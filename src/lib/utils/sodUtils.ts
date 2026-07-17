import { AuthorityKeyIdentifier } from "@peculiar/asn1-x509"
import { AsnParser } from "@peculiar/asn1-schema"
import { Binary, PassportViewModel } from "@zkpassport/utils"
import { MAX_ECONTENT_LEN, MAX_SIGNEDATTR_LEN, MAX_TBS_LEN } from "@/constants"
import {
  EContentLenExceedsMaxError,
  SignedAttrLenExceedsMaxError,
  TbsLenExceedsMaxError,
} from "@/types/Error"

// TODO: Move to utils package, and add tests

export function getAuthorityKeyIdFromDSC(currentPassport: PassportViewModel) {
  const extensions = currentPassport.sod.certificate.tbs.extensions
  const akiBuffer = extensions.get("authorityKeyIdentifier")?.value.toBuffer()
  if (akiBuffer) {
    const parsed = AsnParser.parse(akiBuffer, AuthorityKeyIdentifier)
    if (parsed?.keyIdentifier?.buffer) {
      const aki = Binary.from(parsed.keyIdentifier.buffer).toHex()
      return aki
    } else {
      console.log("No Authority Key ID found")
    }
  } else {
    console.log("No Authority Key ID found")
  }
}

export async function getRedactedSODFromCurrentPassport(
  currentPassport: PassportViewModel | null,
): Promise<string | null> {
  if (!currentPassport) {
    return null
  }
  try {
    const redactedSOD = currentPassport.sod.getRedactedSOD()
    // Convert the exportable SOD object to a JSON string
    const redactedSODString = JSON.stringify(redactedSOD)
    console.log("Redacted SOD string length:", redactedSODString.length)
    return redactedSODString
  } catch (error) {
    console.log("Error getting redacted SOD from current passport: " + error)
    return null
  }
}

/**
 * Validates passport data
 * @param passportData The passport view model to validate
 * @throws {EContentLenExceedsMaxError} If eContent length exceeds maximum
 * @throws {TbsLenExceedsMaxError} If TBS length exceeds maximum
 * @throws {SignedAttrLenExceedsMaxError} If signed attributes length exceeds maximum
 */
export function validatePassportData(passportData: PassportViewModel) {
  // Validate passport data lengths against maximum limits
  const eContentLength = passportData.sod.encapContentInfo.eContent.bytes.length
  const tbsLength = passportData.sod.certificate.tbs.bytes.length
  const signedAttrLength = passportData.sod.signerInfo.signedAttrs.bytes.length

  if (eContentLength > MAX_ECONTENT_LEN) {
    throw new EContentLenExceedsMaxError(
      `eContent length (${eContentLength}) exceeds max supported length (${MAX_ECONTENT_LEN})`,
      { actualLength: eContentLength, maxLength: MAX_ECONTENT_LEN },
    )
  }
  if (tbsLength > MAX_TBS_LEN) {
    throw new TbsLenExceedsMaxError(
      `TBS length (${tbsLength}) exceeds max supported length (${MAX_TBS_LEN})`,
      { actualLength: tbsLength, maxLength: MAX_TBS_LEN },
    )
  }
  if (signedAttrLength > MAX_SIGNEDATTR_LEN) {
    throw new SignedAttrLenExceedsMaxError(
      `SignedAttr length (${signedAttrLength}) exceeds max supported length (${MAX_SIGNEDATTR_LEN})`,
      { actualLength: signedAttrLength, maxLength: MAX_SIGNEDATTR_LEN },
    )
  }
}
