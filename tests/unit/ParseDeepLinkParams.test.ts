import { renderHook } from "@testing-library/react-native"
import * as Linking from "expo-linking"
import { useParseDeepLinkParams } from "@/hooks/useParseDeepLinkParams"

// Mock dependencies
jest.mock("expo-linking", () => ({
  useLinkingURL: jest.fn(),
  parse: jest.fn(),
}))

describe("useParseDeepLinkParams", () => {
  const mockUseLinkingURL = Linking.useLinkingURL as jest.Mock
  const mockLinkingParse = Linking.parse as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("when there is no URL", () => {
    it("should return null", () => {
      mockUseLinkingURL.mockReturnValue(null)

      const { result } = renderHook(() => useParseDeepLinkParams())

      expect(result.current).toBeNull()
    })
  })

  describe("parse URL", () => {
    it("should parse URL with all parameters", () => {
      // Real fixture from https://zkpassport.id/r?d=demo.zkpassport.id&t=033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242&c=eyJhZ2UiOnsiZ3RlIjoxOH0sIm5hdGlvbmFsaXR5Ijp7ImVxIjpbIkFGRyJdfSwiZmlyc3RuYW1lIjp7ImRpc2Nsb3NlIjp0cnVlfSwiZmFjZW1hdGNoIjp7Im1vZGUiOiJyZWd1bGFyIn19&s=eyJuYW1lIjoiVGVzdCBQcm9qZWN0IiwibG9nbyI6Imh0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS8xNTAiLCJwdXJwb3NlIjoic3R1ZmYiLCJzY29wZSI6Im1vcmUgc3R1ZmYifQ==&p=033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242&m=fast&v=0.11.0&dt=1762183034&dev=0
      const queryBase64 =
        "eyJhZ2UiOnsiZ3RlIjoxOH0sIm5hdGlvbmFsaXR5Ijp7ImVxIjpbIkFGRyJdfSwiZmlyc3RuYW1lIjp7ImRpc2Nsb3NlIjp0cnVlfSwiZmFjZW1hdGNoIjp7Im1vZGUiOiJyZWd1bGFyIn19"
      const serviceBase64 =
        "eyJuYW1lIjoiVGVzdCBQcm9qZWN0IiwibG9nbyI6Imh0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS8xNTAiLCJwdXJwb3NlIjoic3R1ZmYiLCJzY29wZSI6Im1vcmUgc3R1ZmYifQ=="
      const topic = "033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242"
      const pubkey = "033864f3c561f0dd651a7a622bc7a4b2706332f8385a5808fff5f91f1f06492242"

      // Expected decoded values
      const expectedQuery = {
        age: { gte: 18 },
        nationality: { eq: ["AFG"] },
        firstname: { disclose: true },
        facematch: { mode: "regular" },
      }
      const expectedService = {
        name: "Test Project",
        purpose: "stuff",
        scope: "more stuff",
      }

      const mockUrl = `zkpassport://app?d=demo.zkpassport.id&t=${topic}&c=${queryBase64}&s=${serviceBase64}&p=${pubkey}&m=fast&v=0.11.0&dt=1762183034&dev=0`
      const mockQueryParams = {
        d: "demo.zkpassport.id",
        t: topic,
        c: queryBase64,
        s: serviceBase64,
        p: pubkey,
        m: "fast",
        v: "0.11.0",
        dt: "1762183034",
        dev: "0",
      }

      mockUseLinkingURL.mockReturnValue(mockUrl)
      mockLinkingParse.mockReturnValue({ queryParams: mockQueryParams })

      const { result } = renderHook(() => useParseDeepLinkParams())

      // Verify all parameters were parsed correctly
      expect(result.current).toMatchObject({
        domain: "demo.zkpassport.id",
        topic: topic,
        query: expectedQuery,
        service: expectedService,
        pubkey: pubkey,
        mode: "fast",
        sdkVersion: "0.11.0",
        timestamp: 1762183034,
        devMode: false,
      })

      // Verify SDK version is explicitly defined
      expect(result.current?.sdkVersion).toBe("0.11.0")
      expect(result.current?.sdkVersion).toBeDefined()
      expect(result.current?.sdkVersion).not.toBeNull()
    })

    it("should parse URL without SDK version", () => {
      const mockUrl = "zkpassport://app?t=test-topic&d=test-domain"
      const mockQueryParams = {
        t: "test-topic",
        d: "test-domain",
      }

      mockUseLinkingURL.mockReturnValue(mockUrl)
      mockLinkingParse.mockReturnValue({ queryParams: mockQueryParams })

      const { result } = renderHook(() => useParseDeepLinkParams())

      expect(result.current).toMatchObject({
        topic: "test-topic",
        domain: "test-domain",
        sdkVersion: null,
      })
    })
  })

  describe("hook lifecycle", () => {
    it("should update when URL changes", () => {
      const mockUrl1 = "zkpassport://app?t=topic1"
      const mockUrl2 = "zkpassport://app?t=topic2"

      mockLinkingParse.mockImplementation((url: string) => {
        if (url === mockUrl1) {
          return { queryParams: { t: "topic1" } }
        }
        return { queryParams: { t: "topic2" } }
      })

      mockUseLinkingURL.mockReturnValue(mockUrl1)

      const { result, rerender } = renderHook(() => useParseDeepLinkParams())

      expect(result.current).toMatchObject({
        topic: "topic1",
      })

      // Change URL
      mockUseLinkingURL.mockReturnValue(mockUrl2)
      rerender({ url: mockUrl2 })

      expect(result.current).toMatchObject({
        topic: "topic2",
      })
    })
  })
})
