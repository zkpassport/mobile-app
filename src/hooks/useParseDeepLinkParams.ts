import { useMemo } from "react"
import * as Linking from "expo-linking"
import type { QRCodeData, Query, Service } from "@zkpassport/utils"
import { NullifierType } from "@zkpassport/utils"

const parseUrl = (url: string): QRCodeData => {
  const { queryParams } = Linking.parse(url)

  const queryBase64 = queryParams?.c as string
  const query: Query | null = queryBase64 ? JSON.parse(atob(queryBase64)) : null
  const topic = (queryParams?.t as string) ?? null
  const pubkey = (queryParams?.p as string) ?? null
  const domain = (queryParams?.d as string) ?? null
  const serviceBase64 = queryParams?.s as string
  const service: Service | null = serviceBase64 ? JSON.parse(atob(serviceBase64)) : null
  const mode = (queryParams?.m as "fast" | "compressed") ?? "fast"
  const sdkVersion = ((queryParams?.v as string) ?? null) as string | null
  const timestamp = queryParams?.dt as string | undefined
  const devMode = !!(queryParams?.dev as string) && (queryParams?.dev as string) === "1"
  const nt = queryParams?.nt as string | undefined
  const uniqueIdentifierType: NullifierType | null =
    nt != null ? (Number(nt) as NullifierType) : null
  const oprfKeyId = (queryParams?.oprf_k as string) ?? null
  const returnDeepLink = (queryParams?.r as string) ?? null

  return {
    query,
    topic,
    pubkey,
    domain,
    service,
    mode,
    sdkVersion,
    timestamp: timestamp ? Number(timestamp) : null,
    devMode,
    uniqueIdentifierType,
    oprfKeyId,
    returnDeepLink,
  }
}

// This is now a simple hook, all the logic for version checking and navigation should be handled by the consuming component.
export function useParseDeepLinkParams(): QRCodeData | null {
  const url = Linking.useLinkingURL()
  return useMemo(() => (url ? parseUrl(url) : null), [url])
}
