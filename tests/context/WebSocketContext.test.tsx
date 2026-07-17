import React from "react"
import { render, act, waitFor } from "@testing-library/react-native"
import { WebSocketProvider, useWebSocket } from "@/context/WebSocketContext"
import { ErrorProvider, useError } from "@/context/ErrorContext"
import { StorageProvider } from "@/context/StorageContext"
import { SettingsProvider } from "@/context/SettingsContext"

const storage = global.__TEST_STORAGE__

// Test fixtures
const FIXTURES = {
  DOMAIN: "example.com",
  TOPIC: "test-topic",
  PUBKEY_HEX: "02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4",
}

global.fetch = jest.fn()

const renderWebSocketProvider = async () => {
  let webSocketContext: any
  let errorContext: any

  const TestComponent = () => {
    webSocketContext = useWebSocket()
    errorContext = useError()
    return null
  }

  render(
    <StorageProvider implementation={storage}>
      <ErrorProvider>
        <SettingsProvider>
          <WebSocketProvider>
            <TestComponent />
          </WebSocketProvider>
        </SettingsProvider>
      </ErrorProvider>
    </StorageProvider>,
  )

  await waitFor(() => {
    expect(webSocketContext).toBeDefined()
    expect(errorContext).toBeDefined()
  })

  return { webSocketContext, errorContext }
}

const getAPICallBody = () => {
  const calls = (global.fetch as jest.Mock).mock.calls
  if (calls.length === 0) return null
  return JSON.parse(calls[calls.length - 1][1].body)
}

describe("WebSocketContext", () => {
  let webSocketContext: any
  let errorContext: any

  beforeEach(async () => {
    const { webSocketContext: _webSocketContext, errorContext: _errorContext } =
      await renderWebSocketProvider()
    webSocketContext = _webSocketContext
    errorContext = _errorContext

    // Enable error reporting consent
    await act(async () => errorContext.setErrorReportingConsent(true))
  })

  it("should not report errors if consent is not enabled", async () => {
    await act(async () => errorContext.setErrorReportingConsent(false))
    await waitFor(() => {
      expect(errorContext.hasErrorReportingConsent).toBe(false)
    })

    await act(async () => {
      try {
        await webSocketContext.scan(FIXTURES.DOMAIN, FIXTURES.TOPIC, "0x123")
        // Expected to throw
      } catch {}
    })

    expect(getAPICallBody()).toBeNull()

    await act(async () => errorContext.setErrorReportingConsent(true))
  })

  it("should handle Error error objects", async () => {
    // Let Bridge.join fail naturally with the "Point invalid: not on curve" error
    // This happens because the pubkey is not a valid secp256k1 curve point
    await act(async () => {
      try {
        await webSocketContext.scan(FIXTURES.DOMAIN, FIXTURES.TOPIC, "0x123")
        // Expected to throw
      } catch {}
    })

    // Verify the WebSocket error structure
    const reportedError = getAPICallBody()
    expect(reportedError.message).toBe("Failed to connect to bridge")
    expect(reportedError.error_type).toBe("WEBSOCKET_ERROR")
    expect(reportedError.error_subtype).toBe("CONNECTION_FAILED")
    expect(reportedError.context.domain).toBe(FIXTURES.DOMAIN)

    expect(reportedError.context.error_details?.name).toBe("Error")
    expect(reportedError.context.error_details?.message).toContain("bad point: not on curve")
  })

  it("should handle SyntaxError error objects", async () => {
    // Let Bridge.join fail naturally with an invalid bridge URL
    await act(async () => {
      try {
        await webSocketContext.scan(
          FIXTURES.DOMAIN,
          FIXTURES.TOPIC,
          "02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4",
          {
            bridgeUrl: "x://invalid",
          },
        )
        // Expected to throw
      } catch {}
    })

    // Verify the WebSocket error structure
    const reportedError = getAPICallBody()
    expect(reportedError.message).toBe("Failed to connect to bridge")
    expect(reportedError.error_type).toBe("WEBSOCKET_ERROR")
    expect(reportedError.error_subtype).toBe("CONNECTION_FAILED")
    expect(reportedError.context.domain).toBe(FIXTURES.DOMAIN)

    expect(reportedError.context.error_details?.name).toBe("SyntaxError")
    expect(reportedError.context.error_details?.message).toContain("scheme must be either")
  })
})
