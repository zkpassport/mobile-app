import { DASHBOARD_API_URL } from "@/lib/constants"

const DASHBOARD_LOOKUP_TIMEOUT_MS = 8000

type PublicProject = {
  domain: string
  domainVerified: boolean
  allowedOrigins: string[]
}

export function normalizeHostname(value: string | undefined): string {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "") // strip protocol
    .split("/")[0] // strip path / query / hash
    .split(":")[0] // strip port
}

async function fetchPublicProject(domain: string): Promise<PublicProject | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DASHBOARD_LOOKUP_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${DASHBOARD_API_URL}/public/project?domain=${encodeURIComponent(domain)}`,
      { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal },
    )
    if (!response.ok) return null
    const body = await response.json()
    return body?.project ?? null
  } catch (error) {
    console.warn("Trusted origin lookup failed:", error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const LOCALHOST_ORIGINS = new Set(["localhost", "127.0.0.1"])

export async function isOriginTrusted(
  realOrigin: string | undefined,
  constructorDomain: string,
): Promise<boolean> {
  const originHost = normalizeHostname(realOrigin)
  const domainHost = normalizeHostname(constructorDomain)
  if (!originHost) return false

  if (originHost === domainHost) return true

  if (LOCALHOST_ORIGINS.has(originHost)) return true

  const project = await fetchPublicProject(domainHost)
  if (!project) return false

  // Sanity check: the returned project should belong to the domain we queried
  if (normalizeHostname(project.domain) !== domainHost) return false

  // Only honor allowedOrigins when the project has proven ownership of the
  // claimed domain; otherwise anyone could register the domain unverified
  // and whitelist their own origin
  if (!project.domainVerified) return false

  return project.allowedOrigins.some((origin) => normalizeHostname(origin) === originHost)
}
