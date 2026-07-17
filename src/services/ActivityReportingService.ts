import { DASHBOARD_API_URL } from "@/lib/constants"

const ACTIVITY_ENDPOINT = `${DASHBOARD_API_URL}/public/activity`

const ACTIVITY_TIMEOUT_MS = 5000

export type ActivityStatus = "started" | "success" | "failed"

export interface ActivityInput {
  requestId: string
  domain: string
  status: ActivityStatus
  scope?: string
  errorCode?: string
  durationMs?: number
  devMode?: boolean
}

export async function reportActivity(input: ActivityInput): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ACTIVITY_TIMEOUT_MS)
    try {
      await fetch(ACTIVITY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: input.requestId,
          domain: input.domain,
          status: input.status,
          scope: input.scope,
          errorCode: input.errorCode,
          durationMs: input.durationMs,
          devMode: input.devMode,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    console.warn("reportActivity POST failed:", e)
  }
}
