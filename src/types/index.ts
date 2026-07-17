import { CriteriaItem } from "@/components/AccessRequest"
import { QRCodeData } from "@zkpassport/utils"

export type SavedPassport = {
  id: string
  name: string
}

export type MySettings = {
  activePassport: string
  passports: SavedPassport[]
  showResetDataButton: boolean
}

export type HistoryItemMetadata = {
  countryCode: string
  idType: string
  timestamp: string
  name: string
  accessItems: CriteriaItem[]
}

export type HistoryItem = {
  id: string
  passportId: string
  metadata: HistoryItemMetadata
  request: QRCodeData
}

export type PassportReaderEvent =
  | "SCAN_STARTED"
  | "PACE_STARTED"
  | "PACE_SUCCEEDED"
  | "PACE_FAILED"
  | "BAC_STARTED"
  | "BAC_SUCCEEDED"
  | "BAC_FAILED"
  | "GET_COM_STARTED"
  | "GET_COM_SUCCEEDED"
  | "GET_COM_FAILED"
  | "GET_SOD_STARTED"
  | "GET_SOD_SUCCEEDED"
  | "GET_DG1_STARTED"
  | "GET_DG1_SUCCEEDED"
  | "GET_DG2_STARTED"
  | "GET_DG2_SUCCEEDED"
  | "GET_DG5_STARTED"
  | "GET_DG5_SUCCEEDED"
  | "GET_DG5_FAILED"
  | "GET_DG7_STARTED"
  | "GET_DG7_SUCCEEDED"
  | "GET_DG7_FAILED"
  | "GET_DG11_STARTED"
  | "GET_DG11_SUCCEEDED"
  | "GET_DG11_FAILED"
  | "GET_DG12_STARTED"
  | "GET_DG12_SUCCEEDED"
  | "GET_DG12_FAILED"
  | "GET_DG13_STARTED"
  | "GET_DG13_SUCCEEDED"
  | "GET_DG13_FAILED"
  | "GET_DG14_STARTED"
  | "GET_DG14_SUCCEEDED"
  | "GET_DG14_FAILED"
  | "GET_DG15_STARTED"
  | "GET_DG15_SUCCEEDED"
  | "GET_DG15_FAILED"
  | "PREP_DATA"
  | "GET_PHOTO_STARTED"
  | "GET_PHOTO_SUCCEEDED"
  | "PASSPORT_READ_FAILED"
  | "SAVING_PASSPORT"
  // Connection loss events (Android)
  | "CONNECTION_LOST"
  | "CONNECTION_LOST_RETAG_1"
  | "CONNECTION_LOST_RETAG_2"
  | "CONNECTION_LOST_RETAG_3"
  | "CONNECTION_LOST_MAX_RETRIES"
  | "TAG_RECONNECTED"
  | "TAG_RECONNECTED_1"
  | "TAG_RECONNECTED_2"
  | "TAG_RECONNECTED_3"
  | "WRONG_TAG_RETAG"

export type OuterCircuitInputs = {
  certificate_registry_root: string
  circuit_registry_root: string
  current_date: string
  service_scope: string
  service_subscope: string
  param_commitments: string[]
  scoped_nullifier: string
  csc_to_dsc_proof: {
    vkey: string[]
    proof: string[]
    public_inputs: string[]
    key_hash: string
    tree_hash_path: string[]
    tree_index: string
  }
  dsc_to_id_data_proof: {
    vkey: string[]
    proof: string[]
    public_inputs: string[]
    key_hash: string
    tree_hash_path: string[]
    tree_index: string
  }
  integrity_check_proof: {
    vkey: string[]
    proof: string[]
    public_inputs: string[]
    key_hash: string
    tree_hash_path: string[]
    tree_index: string
  }
  disclosure_proofs: {
    vkey: string[]
    proof: string[]
    public_inputs: string[]
    key_hash: string
    tree_hash_path: string[]
    tree_index: string
  }[]
}

export type Commitments = {
  vkeys: {
    csc_to_dsc_proof: string
    dsc_to_id_data_proof: string
    integrity_check_proof: string
    disclosure_proofs: string[]
  }
  publicInputs:
    | {
        csc_to_dsc_proof: string[]
        dsc_to_id_data_proof: string[]
        integrity_check_proof: string[]
        disclosure_proofs: string[][]
      }
    | string[]
}
