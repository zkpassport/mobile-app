import { Platform } from "react-native"
import { withRetry, type PassportViewModel } from "@zkpassport/utils"
import { API_URL } from "@/lib/constants"
import { getVersion } from "@/lib"
import { getDeviceMetadata, getIDMetadata } from "@/lib/errorUtils"
import { DiskStorageService } from "@/services/StorageService"
import { BackgroundErrorReporter } from "@/services/BackGroundError"
import { Device_Info, ErrorLog, ID_Info, OperationTiming } from "@/types/Error"

const REPORT_ENDPOINT = `${API_URL}/report`
const REPORT_TIMEOUT_MS = 5000

const storage = new DiskStorageService()

// Single POST used by everything the app reports. Throws on failure so
// callers can decide between retrying and giving up.
async function postReport(body: unknown): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS)
  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`report failed: ${response.status} ${response.statusText}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

const backgroundReporter = new BackgroundErrorReporter(postReport)

const hasReportingConsent = async () =>
  (await storage.getItem("errorReportingConsent")) === "enabled"

// Events with no request to group them (onboarding scans, base proofs) share one id per app launch.
let sessionId: string | undefined
const getSessionId = () => {
  if (!sessionId) sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return sessionId
}

// Rich error diagnostics (the bug_report payload). Fire-and-forget with a retry
// queue.
export function reportDiagnostics(log: ErrorLog): void {
  backgroundReporter.sendInBackground(log)
}

// Awaited variant for sends the user explicitly confirmed in the error UI.
export async function sendDiagnostics(log: ErrorLog): Promise<boolean> {
  try {
    await withRetry(() => postReport(log), 1)
    return true
  } catch (error) {
    console.log("Error sending diagnostics:", error)
    return false
  }
}

export type ReportedEvent =
  | "request_opened"
  | "request_approved"
  | "request_rejected"
  | "mrz_scan_succeeded"
  | "mrz_scan_failed"
  | "manual_mrz_cancelled"
  | "nfc_scan_succeeded"
  | "nfc_scan_failed"
  | "unsupported_id_detected"
  | "onboarding_flow_exit"
  | "base_proof_generation_succeeded"
  | "base_proof_generation_failed"
  | "proof_generation_succeeded"
  | "proof_generation_failed"
  | "proof_generation_cancelled"
  | "face_match_completed"
  | "face_match_cancelled"
  | "attestation_generated"

export type EventSectionInputs = {
  passport?: PassportViewModel | null
  mrz?: string | null
  operationTiming?: OperationTiming
}

let deviceInfoPromise: Promise<Device_Info> | undefined
const getEventDeviceInfo = () => {
  if (!deviceInfoPromise) {
    deviceInfoPromise = getDeviceMetadata().then(({ device_info }) => device_info)
  }
  return deviceInfoPromise
}

const roundDateToMonth = (date: string): string =>
  date.includes("/") ? date.replace(/^\d{2}/, "01") : date.replace(/\d{2}$/, "01")

const toEventIdInfo = ({ redacted_sod: _redacted_sod, ...idInfo }: ID_Info): ID_Info => ({
  ...idInfo,
  issuing_date: idInfo.issuing_date && roundDateToMonth(idInfo.issuing_date),
  issuing_date_dg12: idInfo.issuing_date_dg12 && roundDateToMonth(idInfo.issuing_date_dg12),
  document_expiry: idInfo.document_expiry && roundDateToMonth(idInfo.document_expiry),
})

const toEventTiming = (timing: OperationTiming): OperationTiming => {
  const { error_details: _error_details, ...metadata } = timing.metadata ?? {}
  return {
    ...timing,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

// Returns void so call sites cannot await it: reporting must never block app flow.
export function reportEvent(
  event: ReportedEvent,
  properties?: Record<string, unknown>,
  requestId?: string | null,
  sections?: EventSectionInputs,
): void {
  void send(event, properties, requestId, sections)
}

async function send(
  event: ReportedEvent,
  properties?: Record<string, unknown>,
  requestId?: string | null,
  sections?: EventSectionInputs,
): Promise<void> {
  const operation_timing = sections?.operationTiming
    ? toEventTiming(sections.operationTiming)
    : undefined
  try {
    if (!(await hasReportingConsent())) return
    const platform = Platform.OS === "android" ? "android" : "ios"
    const [device_info, id_info] = await Promise.all([
      getEventDeviceInfo(),
      sections?.passport || sections?.mrz
        ? getIDMetadata(sections.passport ?? undefined, sections.mrz).then(({ id_info }) =>
            toEventIdInfo(id_info),
          )
        : undefined,
    ])
    await postReport({
      type: "event",
      event,
      distinct_id: requestId || getSessionId(),
      properties: {
        $app_version: getVersion(),
        $os: platform,
        $os_name: platform,
        $device_type: "Mobile",
        device_info,
        id_info,
        operation_timing,
        ...properties,
      },
    })
  } catch (e) {
    console.warn(`reportEvent ${event} failed:`, e)
  }
}
