export enum DocumentType {
  PASSPORT = "passport",
  ID_CARD = "id_card",
  RESIDENCE_PERMIT = "residence_permit",
  OTHER = "other",
}

export enum DisplayDocumentType {
  PASSPORT = "Passport",
  ID_CARD = "National ID",
  RESIDENCE_PERMIT = "Residence Permit",
  OTHER = "Other",
}

export enum Gender {
  MALE = "M",
  FEMALE = "F",
}

export interface DataGroup {
  groupNumber: number
  name: string
  value: any[]
}
