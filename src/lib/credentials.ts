import type {
  DisclosureCircuitName,
  ExtendedAlpha2Code,
  IDCredential,
  PassportViewModel,
  Query,
  QueryResult,
  QueryResultValue,
  SanctionsConfig,
} from "@zkpassport/utils"
import {
  capitalizeEveryWord,
  formatLongDate,
  getAge,
  getCountryNameAlpha2,
  getMRZDate,
  getPassportExpiryDate,
} from "."
import { getCountryName } from "."
import { isDate } from "date-fns"
import { TFunction } from "i18next"
import { getChainDisplayName, getMrzDisclosedNames } from "@zkpassport/utils"
import {
  CakeIcon,
  CalendarX,
  Earth,
  Fingerprint,
  IdCardIcon,
  LucideIcon,
  SignatureIcon,
  VenusAndMars,
} from "lucide-react-native"
import { RESIDENCE_PERMIT_CODES } from "./constants"
import { DocumentType } from "@/types/DocumentInfo"
import { LocalizedString } from "@/components/AccessRequest/VerificationCriteriaList"

export function hasRequestedAccessToField(credentialsRequest: Query, field: IDCredential): boolean {
  const fieldValue = credentialsRequest[field as keyof Query]
  const isDefined = fieldValue !== undefined && fieldValue !== null
  if (!isDefined) {
    return false
  }
  for (const key in fieldValue) {
    if (
      fieldValue[key as keyof typeof fieldValue] !== undefined &&
      fieldValue[key as keyof typeof fieldValue] !== null
    ) {
      return true
    }
  }
  return false
}

export function hasRequestedAccessToAnyField(credentialsRequest: Query): boolean {
  return Object.keys(credentialsRequest).some((key) =>
    hasRequestedAccessToField(credentialsRequest, key as IDCredential),
  )
}

const credentialDisplayNames: (t: TFunction) => Record<IDCredential, string> = (t) => ({
  firstname: t("credentials.fields.firstname"),
  lastname: t("credentials.fields.lastname"),
  birthdate: t("credentials.fields.birthdate"),
  nationality: t("credentials.fields.nationality"),
  age: t("credentials.fields.age"),
  expiry_date: t("credentials.fields.expiry_date"),
  document_number: t("credentials.fields.document_number"),
  fullname: t("credentials.fields.fullname"),
  document_type: t("credentials.fields.document_type"),
  issuing_country: t("credentials.fields.issuing_country"),
  gender: t("credentials.fields.gender"),
})

const credentialIcons: Record<IDCredential, LucideIcon> = {
  firstname: SignatureIcon,
  lastname: SignatureIcon,
  fullname: SignatureIcon,
  birthdate: CakeIcon,
  expiry_date: CalendarX,
  nationality: Earth,
  age: CakeIcon,
  document_number: IdCardIcon,
  document_type: IdCardIcon,
  issuing_country: Earth,
  gender: VenusAndMars,
}

export function credentialToDisplayName(t: TFunction, credential?: IDCredential): string {
  return credential
    ? credentialDisplayNames(t)[credential] || credential
    : t("accessItemLabel.validId")
}

export function credentialToIcon(credential?: IDCredential): LucideIcon {
  return credential ? credentialIcons[credential] : Fingerprint
}

export function getAccessItemLabelAndDescription(
  field: IDCredential,
  value: QueryResultValue<IDCredential>,
  t: TFunction,
  passport?: PassportViewModel,
): { label: string; description: string | LocalizedString; result?: string | LocalizedString }[] {
  const issuingCountry = passport ? getIssuingCountryCode(passport) : undefined
  const nationality = passport ? passport.nationality : undefined
  const labels: {
    label: string
    description: string | LocalizedString
    result?: string | LocalizedString
  }[] = []
  if (field === "age") {
    if (value.eq) {
      labels.push({
        label: t("accessItemLabel.age.eq", { age: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.age.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value.disclose) {
      labels.push({
        label: t("accessItemLabel.age.disclose"),
        description: { i18nKey: "accessItemDescription.age.disclose" },
        result: String(value.disclose.result),
      })
    }
    if (value.range) {
      labels.push({
        label: t("accessItemLabel.age.range", {
          min: value.range.expected[0],
          max: value.range.expected[1],
        }),
        description: { i18nKey: "accessItemDescription.age.range" },
        result: value.range.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value.gt) {
      labels.push({
        label: t("accessItemLabel.age.gt", { age: value.gt.expected }),
        description: { i18nKey: "accessItemDescription.age.gt" },
        result: value.gt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value.gte) {
      labels.push({
        label: t("accessItemLabel.age.gte", { age: value.gte.expected }),
        description: { i18nKey: "accessItemDescription.age.gte" },
        result: value.gte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value.lt) {
      labels.push({
        label: t("accessItemLabel.age.lt", { age: value.lt.expected }),
        description: { i18nKey: "accessItemDescription.age.lt" },
        result: value.lt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value.lte) {
      labels.push({
        label: t("accessItemLabel.age.lte", { age: value.lte.expected }),
        description: { i18nKey: "accessItemDescription.age.lte" },
        result: value.lte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  } else if (field === "expiry_date") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.expiry_date.eq", {
          date: formatLongDate(new Date(value.eq.expected)),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.expiry_date.disclose"),
        description: { i18nKey: "accessItemDescription.expiry_date.disclose" },
        result: formatLongDate(new Date(value.disclose.result as string)),
      })
    }
    if (value?.range) {
      labels.push({
        label: t("accessItemLabel.expiry_date.range", {
          min: formatLongDate(new Date(value.range.expected[0])),
          max: formatLongDate(new Date(value.range.expected[1])),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.range" },
        result: value.range.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.gt) {
      labels.push({
        label: t("accessItemLabel.expiry_date.gt", {
          date: formatLongDate(new Date(value.gt.expected)),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.gt" },
        result: value.gt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.gte) {
      labels.push({
        label: t("accessItemLabel.expiry_date.gte", {
          date: formatLongDate(new Date(value.gte.expected)),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.gte" },
        result: value.gte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.lt) {
      labels.push({
        label: t("accessItemLabel.expiry_date.lt", {
          date: formatLongDate(new Date(value.lt.expected)),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.lt" },
        result: value.lt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.lte) {
      labels.push({
        label: t("accessItemLabel.expiry_date.lte", {
          date: formatLongDate(new Date(value.lte.expected)),
        }),
        description: { i18nKey: "accessItemDescription.expiry_date.lte" },
        result: value.lte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  } else if (field === "nationality") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.nationality.eq", {
          country: getCountryName(value.eq.expected as string),
        }),
        description: { i18nKey: "accessItemDescription.nationality.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.nationality.disclose"),
        description: { i18nKey: "accessItemDescription.nationality.disclose" },
        result: getCountryName(value.disclose.result as string),
      })
    }
    if (value?.in) {
      labels.push({
        label: t("accessItemLabel.nationality.in", { countries: value.in.expected.length }),
        description: {
          i18nKey: "accessItemDescription.nationality.in",
          values: {
            countries: value.in.expected.map((country) => getCountryName(country)).join(", "),
          },
        },
        result: value.in.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.out) {
      labels.push({
        label: t("accessItemLabel.nationality.out", {
          countries: value.out.expected.length,
        }),
        description: {
          i18nKey: "accessItemDescription.nationality.out",
          values: {
            countries: value.out.expected.map((country) => getCountryName(country)).join(", "),
          },
        },
        result: value.out.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  } else if (field === "gender") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.gender.eq", { gender: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.gender.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.gender.disclose"),
        description: { i18nKey: "accessItemDescription.gender.disclose" },
        result: capitalizeEveryWord(value.disclose.result as string),
      })
    }
  } else if (field === "document_number") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.document_number.eq", { number: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.document_number.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.document_number.disclose"),
        description: { i18nKey: "accessItemDescription.document_number.disclose" },
        result: value.disclose.result as string,
      })
    }
  } else if (field === "document_type") {
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.document_type.disclose"),
        description: { i18nKey: "accessItemDescription.document_type.disclose" },
        result: getDisplayDocumentType(
          value.disclose?.result as string,
          issuingCountry,
          nationality,
          t,
        ),
      })
    }
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.document_type.eq", {
          type: getDisplayDocumentType(value.eq.expected as string, undefined, undefined, t),
        }),
        description: { i18nKey: "accessItemDescription.document_type.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  } else if (field === "issuing_country") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.issuing_country.eq", {
          country: getCountryName(value.eq.expected as string),
        }),
        description: { i18nKey: "accessItemDescription.issuing_country.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.issuing_country.disclose"),
        description: { i18nKey: "accessItemDescription.issuing_country.disclose" },
        result: getCountryName(value.disclose.result as string),
      })
    }
    if (value?.in) {
      labels.push({
        label: t("accessItemLabel.issuing_country.in", { countries: value.in.expected.length }),
        description: {
          i18nKey: "accessItemDescription.issuing_country.in",
          values: {
            countries: value.in.expected.map((country) => getCountryName(country)).join(", "),
          },
        },
        result: value.in.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.out) {
      labels.push({
        label: t("accessItemLabel.issuing_country.out", { countries: value.out.expected.length }),
        description: {
          i18nKey: "accessItemDescription.issuing_country.out",
          values: {
            countries: value.out.expected.map((country) => getCountryName(country)).join(", "),
          },
        },
        result: value.out.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  } else if (field === "fullname") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.fullname.eq", { name: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.fullname.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.fullname.disclose"),
        description: { i18nKey: "accessItemDescription.fullname.disclose" },
        result: capitalizeEveryWord(value.disclose.result as string),
      })
    }
  } else if (field === "firstname") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.firstname.eq", { name: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.firstname.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.firstname.disclose"),
        description: { i18nKey: "accessItemDescription.firstname.disclose" },
        result: capitalizeEveryWord(value.disclose.result as string),
      })
    }
  } else if (field === "lastname") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.lastname.eq", { name: value.eq.expected }),
        description: { i18nKey: "accessItemDescription.lastname.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.lastname.disclose"),
        description: { i18nKey: "accessItemDescription.lastname.disclose" },
        result: capitalizeEveryWord(value.disclose.result as string),
      })
    }
  } else if (field === "birthdate") {
    if (value?.eq) {
      labels.push({
        label: t("accessItemLabel.birthdate.eq", {
          date: formatLongDate(new Date(value.eq.expected)),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.eq" },
        result: value.eq.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.disclose) {
      labels.push({
        label: t("accessItemLabel.birthdate.disclose"),
        description: { i18nKey: "accessItemDescription.birthdate.disclose" },
        result: formatLongDate(new Date(value.disclose.result as string)),
      })
    }
    if (value?.range) {
      labels.push({
        label: t("accessItemLabel.birthdate.range", {
          min: formatLongDate(new Date(value.range.expected[0])),
          max: formatLongDate(new Date(value.range.expected[1])),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.range" },
        result: value.range.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.gt) {
      labels.push({
        label: t("accessItemLabel.birthdate.gt", {
          date: formatLongDate(new Date(value.gt.expected)),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.gt" },
        result: value.gt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.gte) {
      labels.push({
        label: t("accessItemLabel.birthdate.gte", {
          date: formatLongDate(new Date(value.gte.expected)),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.gte" },
        result: value.gte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.lt) {
      labels.push({
        label: t("accessItemLabel.birthdate.lt", {
          date: formatLongDate(new Date(value.lt.expected)),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.lt" },
        result: value.lt.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
    if (value?.lte) {
      labels.push({
        label: t("accessItemLabel.birthdate.lte", {
          date: formatLongDate(new Date(value.lte.expected)),
        }),
        description: { i18nKey: "accessItemDescription.birthdate.lte" },
        result: value.lte.result
          ? {
              i18nKey: "accessItemLabel.yes",
            }
          : {
              i18nKey: "accessItemLabel.no",
            },
      })
    }
  }
  if (labels.length === 0) {
    labels.push({
      label: credentialToDisplayName(t, field),
      description: { i18nKey: "accessItemDescription.validId" },
    })
  }
  return labels
}

export function getSanctionsDescription(sanctions: SanctionsConfig) {
  // We ignore the lists as for the end user it's not as relevant as the countries
  if (sanctions.countries === "all") {
    return { i18nKey: "accessItemDescription.sanctions.all" }
  } else if (Array.isArray(sanctions.countries)) {
    return {
      i18nKey: "accessItemDescription.sanctions.countries",
      values: {
        countries: sanctions.countries
          .map((country) => {
            return getCountryNameAlpha2(country as ExtendedAlpha2Code)
          })
          .join(", "),
      },
    }
  }
  return { i18nKey: "accessItemDescription.sanctions.all" }
}

export function getAccessItems(
  query: Query,
  queryResult: QueryResult,
  t: TFunction,
  passport?: PassportViewModel,
) {
  const items: {
    credential: IDCredential | "bind" | "sanctions" | "facematch"
    displayName: string
    description: string | LocalizedString
    info?: string
    moreInfo?: string
    result?: string | LocalizedString
  }[] = []
  for (const field in query) {
    if (field === "bind") {
      if (query.bind?.user_address) {
        items.push({
          credential: "bind",
          displayName: t("accessItemLabel.bind.user_address"),
          description: { i18nKey: "accessItemDescription.bind.user_address" },
          result: query.bind.user_address,
        })
      }
      if (query.bind?.chain) {
        items.push({
          credential: "bind",
          displayName: t("accessItemLabel.bind.chain"),
          description: { i18nKey: "accessItemDescription.bind.chain" },
          result: getChainDisplayName(query.bind.chain),
        })
      }
      if (query.bind?.custom_data) {
        items.push({
          credential: "bind",
          displayName: t("accessItemLabel.bind.custom_data"),
          description: {
            i18nKey: "accessItemDescription.bind.custom_data",
            values: {
              data: query.bind.custom_data,
            },
          },
          result: query.bind.custom_data,
        })
      }
    } else if (field === "sanctions") {
      items.push({
        credential: "sanctions",
        displayName: t("accessItemLabel.sanctions.question"),
        description: getSanctionsDescription(query.sanctions!),
        result: {
          i18nKey: "accessItemLabel.no",
        },
      })
    } else if (field === "facematch") {
      items.push({
        credential: "facematch",
        displayName: t("accessItemLabel.facematch"),
        description: { i18nKey: "accessItemDescription.facematch" },
        result: {
          i18nKey: "accessItemLabel.yes",
        },
      })
    } else if (hasRequestedAccessToField(query, field as IDCredential)) {
      const labels = getAccessItemLabelAndDescription(
        field as IDCredential,
        queryResult[field as IDCredential]!,
        t,
        passport,
      )
      for (const { label, description, result } of labels) {
        items.push({
          credential: field as IDCredential,
          displayName: label,
          description: description as string,
          result,
        })
      }
    }
  }
  return items
}

export function getDocumentType(
  value: string,
  issuingCountry?: string,
  nationality?: string,
): DocumentType {
  if (!value) {
    return DocumentType.OTHER
  }

  if (value.startsWith("P")) {
    return DocumentType.PASSPORT
  } else if (RESIDENCE_PERMIT_CODES.includes(value)) {
    return DocumentType.RESIDENCE_PERMIT
  } else if (value.startsWith("I") || value.startsWith("C") || value.startsWith("A")) {
    // Anything that starts with I, C or A and that is not a residence permit
    // is an ID card
    // National ID must have the same issuing country as the nationality
    // since they are issued to citizens
    if (issuingCountry && nationality && issuingCountry !== nationality) {
      return DocumentType.RESIDENCE_PERMIT
    } else {
      return DocumentType.ID_CARD
    }
  } else {
    return DocumentType.OTHER
  }
}

export function getDisplayDocumentType(
  value: string,
  issuingCountry?: string,
  nationality?: string,
  t?: TFunction,
) {
  let documentType =
    value === "id_card" || value === "passport" || value === "residence_permit"
      ? value
      : getDocumentType(value, issuingCountry, nationality)
  if (issuingCountry && nationality && documentType === DocumentType.RESIDENCE_PERMIT) {
    if (issuingCountry === nationality) {
      documentType = DocumentType.ID_CARD
    }
  }
  if (issuingCountry && nationality && documentType === DocumentType.ID_CARD) {
    if (issuingCountry !== nationality) {
      documentType = DocumentType.RESIDENCE_PERMIT
    }
  }
  switch (documentType) {
    case DocumentType.PASSPORT:
      return t ? t("passportView.documentType.passport") : "Passport"
    case DocumentType.RESIDENCE_PERMIT:
      return t ? t("passportView.documentType.residencePermit") : "Residence Permit"
    case DocumentType.ID_CARD:
      return t ? t("passportView.documentType.idCard") : "National ID"
    default:
      return t ? t("passportView.documentType.other") : "Other"
  }
}

export function getIssuingCountry(passport: PassportViewModel) {
  if (passport && passport.mrz) {
    const country = passport.mrz.slice(2, 5)
    return getCountryName(country)
  }
  return ""
}

export function processCountryCode(countryCode: string) {
  if (countryCode === "D<<") {
    return "DEU"
  }
  return countryCode
}

export function getIssuingCountryCode(passport: PassportViewModel) {
  if (passport && passport.mrz) {
    const alpha3Code = passport.mrz.slice(2, 5)
    if (alpha3Code === "D<<") {
      return "DEU"
    }
    return alpha3Code
  }
  return ""
}

function formatDiscloseValue(
  field: IDCredential,
  value: string | number | Date,
  passport?: PassportViewModel,
) {
  if (field === "document_type") {
    if (typeof value === "string") {
      return getDocumentType(
        value,
        passport ? getIssuingCountryCode(passport) : undefined,
        passport ? passport.nationality : undefined,
      )
    }
  }
  if (field === "firstname" || field === "lastname" || field === "fullname") {
    return capitalizeEveryWord(value as string)
  }
  if (field === "expiry_date") {
    if (typeof value === "string") {
      return getPassportExpiryDate(value).toISOString()
    } else if (value instanceof Date) {
      return value.toISOString()
    } else if (typeof value === "object" && Object.hasOwn(value, "getTime")) {
      return new Date((value as any).getTime()).toISOString()
    }
    return value
  }
  if (field === "birthdate") {
    if (typeof value === "string") {
      return getMRZDate(value).toISOString()
    } else if (value instanceof Date) {
      return value.toISOString()
    } else if (typeof value === "object" && Object.hasOwn(value, "getTime")) {
      return new Date((value as any).getTime()).toISOString()
    }
    return value
  }
  return value
}

export function getQueryResultValue(
  query: Query,
  field: IDCredential,
  value: string | number | string[] | Date,
  passport?: PassportViewModel,
): QueryResultValue<IDCredential> | undefined {
  const queryField = query[field]
  const isValueDate = value instanceof Date || isDate(value)
  const result: QueryResultValue<IDCredential> = {
    eq:
      queryField && queryField.eq
        ? {
            expected: queryField.eq,
            result: (() => {
              if (field === "document_type") {
                return (
                  queryField.eq ===
                  getDocumentType(
                    value as string,
                    passport ? getIssuingCountryCode(passport) : undefined,
                    passport ? passport.nationality : undefined,
                  )
                )
              } else if (isValueDate) {
                const queryDate = new Date(queryField.eq)
                // Only compare the year, month and day
                return (
                  value.getFullYear() === queryDate.getFullYear() &&
                  value.getMonth() === queryDate.getMonth() &&
                  value.getDate() === queryDate.getDate()
                )
              } else if (typeof value === "string") {
                return value.toLowerCase().trim() === queryField.eq.toLowerCase().trim()
              } else if (typeof value === "number") {
                return value === queryField.eq
              } else if (Array.isArray(value)) {
                return (
                  value.sort().join(",").toLowerCase().trim() ===
                  queryField.eq.sort().join(",").toLowerCase().trim()
                )
              }
              return false
            })(),
          }
        : undefined,
    gt:
      queryField && queryField.gt
        ? {
            expected: queryField.gt,
            result: isValueDate ? value > new Date(queryField.gt) : value > queryField.gt,
          }
        : undefined,
    gte:
      queryField && queryField.gte
        ? {
            expected: queryField.gte,
            result: isValueDate ? value >= new Date(queryField.gte) : value >= queryField.gte,
          }
        : undefined,
    lte:
      queryField && queryField.lte
        ? {
            expected: queryField.lte,
            result: isValueDate ? value <= new Date(queryField.lte) : value <= queryField.lte,
          }
        : undefined,
    lt:
      queryField && queryField.lt
        ? {
            expected: queryField.lt,
            result: isValueDate ? value < new Date(queryField.lt) : value < queryField.lt,
          }
        : undefined,
    range:
      queryField && queryField.range
        ? {
            expected: queryField.range,
            result: isValueDate
              ? value >= new Date(queryField.range[0]) && value <= new Date(queryField.range[1])
              : value >= queryField.range[0] && value <= queryField.range[1],
          }
        : undefined,
    disclose: queryField?.disclose
      ? { result: formatDiscloseValue(field, value as string | number | Date, passport) }
      : undefined,
    in:
      queryField && queryField.in
        ? {
            expected: queryField.in,
            result: queryField.in.includes(value),
          }
        : undefined,
    out:
      queryField && queryField.out
        ? {
            expected: queryField.out,
            result: !queryField.out.includes(value),
          }
        : undefined,
  }
  for (const key in result) {
    if (!result[key as keyof QueryResultValue<IDCredential>]) {
      delete result[key as keyof QueryResultValue<IDCredential>]
    }
  }
  return result
}

export function hasQueryResultFalseValue(
  queryResult: QueryResult,
  field: IDCredential,
  keys?: (keyof QueryResultValue<IDCredential>)[],
) {
  const value = queryResult[field as keyof QueryResult] as QueryResultValue<IDCredential>
  if (!value) {
    return false
  }
  if (keys) {
    for (const key of keys) {
      if (value[key] && value[key]?.result === false) {
        return true
      }
    }
  } else {
    for (const key in value) {
      if (
        value[key as keyof QueryResultValue<IDCredential>] &&
        value[key as keyof QueryResultValue<IDCredential>]?.result === false
      ) {
        return true
      }
    }
  }
  return false
}

export function canGenerateProofForCircuit(
  circuitName: DisclosureCircuitName,
  queryResult: QueryResult,
) {
  if (circuitName === "compare_age" || circuitName === "compare_age_evm") {
    return !hasQueryResultFalseValue(queryResult, "age", ["gte", "lt", "eq", "range"])
  }
  if (circuitName === "compare_birthdate" || circuitName === "compare_birthdate_evm") {
    return !hasQueryResultFalseValue(queryResult, "birthdate", ["gte", "gt", "lt", "lte", "range"])
  }
  if (circuitName === "compare_expiry" || circuitName === "compare_expiry_evm") {
    return !hasQueryResultFalseValue(queryResult, "expiry_date", [
      "gte",
      "gt",
      "lt",
      "lte",
      "range",
    ])
  }
  if (circuitName === "disclose_bytes" || circuitName === "disclose_bytes_evm") {
    return (
      !hasQueryResultFalseValue(queryResult, "birthdate", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "expiry_date", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "document_type", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "nationality", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "document_number", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "issuing_country", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "gender", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "firstname", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "lastname", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "fullname", ["eq"])
    )
  }
  if (
    circuitName === "exclusion_check_issuing_country" ||
    circuitName === "exclusion_check_issuing_country_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "issuing_country", ["out"])
  }
  if (
    circuitName === "exclusion_check_nationality" ||
    circuitName === "exclusion_check_nationality_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "nationality", ["out"])
  }
  if (
    circuitName === "inclusion_check_issuing_country" ||
    circuitName === "inclusion_check_issuing_country_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "issuing_country", ["in"])
  }
  if (
    circuitName === "inclusion_check_nationality" ||
    circuitName === "inclusion_check_nationality_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "nationality", ["in"])
  }
  return true
}

export function getPassportFieldsFromQuery(
  query: Query,
  passport: PassportViewModel,
  sanctionPassed: boolean = false,
  facematchPassed: boolean = false,
) {
  const fields = Object.keys(query).filter((key) =>
    hasRequestedAccessToField(query, key as IDCredential),
  )
  // Source the disclosed name from the MRZ (the bytes the proof commits to), not the DG11 display
  // name, so the disclosed value always matches what the verifier attests.
  const names = getMrzDisclosedNames(passport, query)
  const results: QueryResult = {}
  for (const field of fields) {
    switch (field) {
      case "firstname":
        results.firstname = getQueryResultValue(query, "firstname", names.firstName)
        break
      case "lastname":
        results.lastname = getQueryResultValue(query, "lastname", names.lastName)
        break
      case "fullname":
        results.fullname = getQueryResultValue(query, "fullname", names.fullName)
        break
      case "birthdate":
        results.birthdate = getQueryResultValue(
          query,
          "birthdate",
          getMRZDate(passport.dateOfBirth),
        )
        break
      case "expiry_date":
        results.expiry_date = getQueryResultValue(
          query,
          "expiry_date",
          getPassportExpiryDate(passport.passportExpiry),
        )
        break
      case "nationality":
        results.nationality = getQueryResultValue(
          query,
          "nationality",
          processCountryCode(passport.nationality),
        )
        break
      case "age":
        results.age = getQueryResultValue(query, "age", getAge(passport.dateOfBirth))
        break
      case "document_number":
        results.document_number = getQueryResultValue(
          query,
          "document_number",
          passport.passportNumber,
        )
        break
      case "document_type":
        results.document_type = getQueryResultValue(
          query,
          "document_type",
          passport.mrz.slice(0, 2),
        )
        break
      case "issuing_country":
        results.issuing_country = getQueryResultValue(
          query,
          "issuing_country",
          processCountryCode(passport.mrz.slice(2, 5)),
        )
        break
      case "gender":
        results.gender = getQueryResultValue(query, "gender", passport.gender)
        break
    }
  }
  if (query.bind) {
    results.bind = {}
    if (query.bind.user_address) {
      results.bind.user_address = query.bind.user_address
    }
    if (query.bind.chain) {
      results.bind.chain = query.bind.chain
    }
    if (query.bind.custom_data) {
      results.bind.custom_data = query.bind.custom_data
    }
  }
  if (query.facematch) {
    results.facematch = {
      mode: query.facematch.mode,
      passed: facematchPassed,
    }
  }
  if (query.sanctions) {
    results.sanctions = {
      passed: sanctionPassed,
      countries: {
        US: { passed: sanctionPassed },
        GB: { passed: sanctionPassed },
        EU: { passed: sanctionPassed },
        CH: { passed: sanctionPassed },
      } as Record<ExtendedAlpha2Code, { passed: boolean }>,
      lists: {
        US_OFAC_SDN: { passed: sanctionPassed },
        CH_SECO_SANCTIONS: { passed: sanctionPassed },
        EU_FSF_SANCTIONS: { passed: sanctionPassed },
        GB_FCDO_SANCTIONS: { passed: sanctionPassed },
      },
      isStrict: query.sanctions.strict ?? false,
    }
  }
  return results
}
