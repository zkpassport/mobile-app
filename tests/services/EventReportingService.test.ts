import AsyncStorage from "@react-native-async-storage/async-storage"
import { reportEvent, sendDiagnostics } from "@/services/EventReportingService"
import { ErrorLog } from "@/types/Error"
import { API_URL } from "@/lib/constants"

jest.mock("@zkpassport/utils", () => ({
  withRetry: jest.fn((fn: () => Promise<any>) => fn()),
}))

global.fetch = jest.fn()

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const errorLog: ErrorLog = { message: "Test error" }

describe("EventReportingService", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
  })

  describe("reportEvent", () => {
    it("does not send anything without reporting consent", async () => {
      reportEvent("mrz_scan_succeeded")
      await flush()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("sends the event with device context when consent is enabled", async () => {
      await AsyncStorage.setItem("errorReportingConsent", "enabled")
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      reportEvent("mrz_scan_succeeded", { duration_ms: 1234 })
      await flush()

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/report`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      )
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body).toMatchObject({
        type: "event",
        event: "mrz_scan_succeeded",
        distinct_id: expect.any(String),
        properties: expect.objectContaining({
          duration_ms: 1234,
          $app_version: expect.any(String),
          $os: expect.any(String),
          device_info: expect.objectContaining({ device_model: "iPhone 13" }),
        }),
      })
    })

    it("attaches the timing section without free-text error detail", async () => {
      await AsyncStorage.setItem("errorReportingConsent", "enabled")
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      reportEvent("nfc_scan_failed", {}, null, {
        operationTiming: {
          operation_type: "nfc_scan",
          time_elapsed_ms: 42,
          metadata: { scan_attempts: 2, error_details: "free text" },
        },
      })
      await flush()

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body.properties.operation_timing).toEqual({
        operation_type: "nfc_scan",
        time_elapsed_ms: 42,
        metadata: { scan_attempts: 2 },
      })
    })

    it("uses the request id as distinct id when provided", async () => {
      await AsyncStorage.setItem("errorReportingConsent", "enabled")
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      reportEvent("request_approved", {}, "request-pubkey-123")
      await flush()

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body.distinct_id).toBe("request-pubkey-123")
    })

    it("swallows network failures", async () => {
      await AsyncStorage.setItem("errorReportingConsent", "enabled")
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"))

      expect(() => reportEvent("mrz_scan_succeeded")).not.toThrow()
      await flush()
    })
  })

  describe("sendDiagnostics", () => {
    it("returns true when the API accepts the report", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      await expect(sendDiagnostics(errorLog)).resolves.toBe(true)

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body).toMatchObject({ message: "Test error" })
      // Diagnostics keep the legacy wire shape: no type marker
      expect(body.type).toBeUndefined()
    })

    it("returns false when the API rejects the report", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      await expect(sendDiagnostics(errorLog)).resolves.toBe(false)
    })

    it("returns false when the network request fails", async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"))

      await expect(sendDiagnostics(errorLog)).resolves.toBe(false)
    })
  })
})
