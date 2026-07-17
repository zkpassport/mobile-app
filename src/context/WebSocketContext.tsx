import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react"
import { type QueryResult, type ProofResult } from "@zkpassport/utils"
import "react-native-get-random-values"
import { Bridge, BridgeInterface } from "@obsidion/bridge"
import { useError } from "@/context/ErrorContext"
import { createWebSocketError } from "@/lib/errorUtils"
import { WebSocketError, WebSocketErrorSubType } from "@/types/Error"
import { useSettings } from "./SettingsContext"
import { useStorage } from "./StorageContext"
import { BridgeRequestStorage } from "@/services/BridgeRequest"
import { isOriginTrusted } from "@/lib/trustedOrigin"

const DOMAIN_VERIFICATION_TIMEOUT = 60000
const BRIDGE_ORIGIN_REPORT_TIMEOUT = 10000
const BRIDGE_ORIGIN_POLL_INTERVAL = 250

async function waitForBridgeOrigin(bridge: BridgeInterface): Promise<string | undefined> {
  const deadline = Date.now() + BRIDGE_ORIGIN_REPORT_TIMEOUT
  while (!bridge.origin && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, BRIDGE_ORIGIN_POLL_INTERVAL))
  }
  return bridge.origin
}

type WebSocketContextType = {
  notifyReject: () => Promise<boolean>
  notifyAccept: () => Promise<boolean>
  notifyProof: (proof: ProofResult) => Promise<boolean>
  notifyDone: (queryResult: QueryResult) => Promise<boolean>
  notifyError: (error: string) => Promise<boolean>
  closeConnection: () => void
  scan: (
    domain: string,
    topic: string,
    pubkeyHex: string,
    options?: {
      keyPairOverride?: { privateKey: Uint8Array; publicKey: Uint8Array }
      bridgeUrl?: string
    },
    onError?: (error: WebSocketError) => void,
  ) => Promise<void>
  isDomainVerified: boolean
}

// Create context
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

// Provider component
export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { reportError } = useError()
  const { currentPassport } = useSettings()
  const storage = useStorage()
  const [domain, setDomain] = useState<string | undefined>(undefined)
  const [bridge, setBridge] = useState<BridgeInterface | undefined>(undefined)
  const [onBridgeConnectCallbacks, setOnBridgeConnectCallbacks] = useState<(() => void)[]>([])
  const [isDomainVerified, setIsDomainVerified] = useState<boolean>(false)

  // Store unsubscribe functions for event listeners
  const unsubscribeFunctions = useRef<(() => void)[]>([])
  const domainVerificationTimeoutRef = useRef<NodeJS.Timeout | number | null>(null)

  // Initialize bridge request storage
  const bridgeStorageRef = useRef<BridgeRequestStorage>(new BridgeRequestStorage(storage))

  useEffect(() => {
    bridgeStorageRef.current.load().catch((error) => {
      console.error("Failed to load bridge requests on mount:", error)
    })
  }, [bridge, domain])

  // Load stored bridge requests and cleanup on unmount
  useEffect(() => {
    console.log("WebSocketProvider mounted")

    return () => {
      console.log("WebSocketProvider unmounted")
      // Clean up any remaining event listeners
      unsubscribeFunctions.current.forEach((unsubscribe) => {
        try {
          unsubscribe()
        } catch (error) {
          console.warn("WebSocket: Error during event listener cleanup:", error)
        }
      })
      unsubscribeFunctions.current = []
      // Clear any pending timeout
      if (domainVerificationTimeoutRef.current) {
        clearTimeout(domainVerificationTimeoutRef.current)
        domainVerificationTimeoutRef.current = null
      }
    }
  }, [])

  const sendMessage = async (
    messageType: "accept" | "reject" | "proof" | "done" | "error",
    data?: any,
    shouldCloseAfter = false,
  ) => {
    const result = await bridge!.sendMessage(messageType, data)
    if (shouldCloseAfter) closeConnection()
    return result
  }

  const closeConnection = useCallback(() => {
    // Clean up event listeners
    unsubscribeFunctions.current.forEach((unsubscribe) => {
      try {
        unsubscribe()
      } catch (error) {
        console.warn("WebSocket: Error during event listener cleanup:", error)
      }
    })
    unsubscribeFunctions.current = []

    // Clear any pending timeout
    if (domainVerificationTimeoutRef.current) {
      clearTimeout(domainVerificationTimeoutRef.current)
      domainVerificationTimeoutRef.current = null
    }

    setBridge(undefined)
    setDomain(undefined)

    try {
      bridge?.close()
    } catch (error) {
      const wsError = createWebSocketError(
        "Failed to close WebSocket connection",
        WebSocketErrorSubType.CONNECTION_CLOSE_FAILED,
        domain,
        error,
      )
      reportError(wsError, null, currentPassport)
    }
  }, [bridge, domain, currentPassport, reportError])

  const notifyReject = () => sendMessage("reject", undefined, true)
  const notifyAccept = () => sendMessage("accept")
  const notifyProof = (result: ProofResult) => sendMessage("proof", result)
  const notifyDone = (result: QueryResult) => sendMessage("done", result, true)
  const notifyError = (error: string) => sendMessage("error", { error })

  const scan = async (
    domain: string,
    _topic: string,
    pubkeyHex: string,
    options?: { bridgeUrl?: string },
  ) => {
    setIsDomainVerified(false)
    setDomain(domain)
    setOnBridgeConnectCallbacks([])

    const isOriginLocal = /localhost|192\.168\.|127\.0/.test(domain)
    const claimedOrigin = isOriginLocal ? `http://${domain}` : `https://${domain}`
    const connectionString = `obsidion:${pubkeyHex}?d=${claimedOrigin}`

    // Check if we have a previous connection with this pubkey
    const storedKeyPair = bridgeStorageRef.current.findKeyPairByPubkey(pubkeyHex, domain)
    const isResumingSession = !!storedKeyPair

    let _bridge: BridgeInterface
    try {
      // Join bridge and resume existing session if we have a stored keypair
      // Handshake is not sent because session is assumed to be already established
      if (isResumingSession) {
        _bridge = await Bridge.join(connectionString, {
          resume: true,
          keyPair: storedKeyPair,
          bridgeUrl: options?.bridgeUrl,
          originOnConnect: true,
          pinOrigin: false,
        })
        console.info("Successfully resumed bridge session")
      } else {
        // Join bridge and create a new session
        // Persist the session keypair in onSecureChannelEstablished
        _bridge = await Bridge.join(connectionString, {
          bridgeUrl: options?.bridgeUrl,
          originOnConnect: true,
          pinOrigin: false,
        })
      }
    } catch (error) {
      console.warn("Error joining WebSocket bridge:", error)
      const wsError = createWebSocketError(
        "Failed to connect to bridge",
        WebSocketErrorSubType.CONNECTION_FAILED,
        domain,
        // TODO: This error needs to be fixed in @obsidion/bridge
        error,
      )
      await reportError(wsError, null, currentPassport)
      closeConnection()
      throw wsError
    }
    setBridge(_bridge)

    // Clear any existing event listeners before setting up new ones
    unsubscribeFunctions.current.forEach((unsubscribe) => {
      try {
        unsubscribe()
      } catch (error) {
        console.warn("Error cleaning up event listeners:", error)
      }
    })
    unsubscribeFunctions.current = []

    // Set up event listeners and store unsubscribe functions
    unsubscribeFunctions.current.push(
      _bridge.onConnect(async () => {
        console.info("WebSocket: Bridge connected")
        await Promise.all(onBridgeConnectCallbacks.map((callback) => callback()))
      }),
    )

    // Domain verification timeout handling
    if (domainVerificationTimeoutRef.current) {
      clearTimeout(domainVerificationTimeoutRef.current)
      domainVerificationTimeoutRef.current = null
    }
    domainVerificationTimeoutRef.current = setTimeout(async () => {
      if (!_bridge.isSecureChannelEstablished()) {
        console.error(
          "There was an issue verifying the connection to the website. Please try again.",
        )
        const wsError = createWebSocketError(
          "Domain verification timed out",
          WebSocketErrorSubType.DOMAIN_VERIFICATION_TIMEOUT,
          domain,
          { showUser: false },
        )
        await reportError(wsError, null, currentPassport)
        closeConnection()
      }
    }, DOMAIN_VERIFICATION_TIMEOUT)

    unsubscribeFunctions.current.push(
      _bridge.onSecureChannelEstablished(async () => {
        if (domainVerificationTimeoutRef.current) {
          clearTimeout(domainVerificationTimeoutRef.current)
          domainVerificationTimeoutRef.current = null
        }
        console.info("WebSocket: Secure channel established")

        if (isResumingSession) {
          setIsDomainVerified(true)
          return
        }

        // Trust the bridge-reported real origin (server-observed Origin header)
        const realOrigin = await waitForBridgeOrigin(_bridge)
        const trusted = await isOriginTrusted(realOrigin, domain)
        setIsDomainVerified(trusted)

        if (trusted) {
          await bridgeStorageRef.current.storeBridgeKeyPair(_bridge, pubkeyHex, domain)
          console.info("Stored bridge keypair for future resume")
        } else {
          console.error(`Origin ${realOrigin} is not trusted for domain ${domain}`)
          const wsError = createWebSocketError(
            "Domain verification failed: the website's origin does not match the requested domain and is not an allowed origin",
            WebSocketErrorSubType.DOMAIN_VERIFICATION_FAILED,
            domain,
            { realOrigin },
          )
          await reportError(wsError, null, currentPassport)
          closeConnection()
        }
      }),
    )
    unsubscribeFunctions.current.push(
      _bridge.onDisconnect(() => {
        // TODO: If the websocket is disconnected, it will automatically attempt to reconnect,
        // but maybe we should also let the user know?
        console.info("WebSocket disconnected")
      }),
    )
    unsubscribeFunctions.current.push(
      _bridge.onError(async (error: any) => {
        // Ignore this error: it's caused by the user pressing cancel before a secure channel is established,
        // resulting in a cancel event message being sent before it's possible to send messages
        if (error.message.includes("Secure channel not established")) return

        // NOTE: Initial connection errors (i.e. unable to connect to the bridge) are also caught here
        console.error(`A website connection error occured: ${error?.message ?? error}`)
        const wsError = createWebSocketError(
          "WebSocket bridge error",
          WebSocketErrorSubType.BRIDGE_ERROR,
          domain,
          error,
        )
        await reportError(wsError, null, currentPassport)
        closeConnection()
      }),
    )
  }

  return (
    <WebSocketContext.Provider
      value={{
        scan,
        isDomainVerified,
        notifyAccept,
        notifyReject,
        notifyError,
        notifyProof,
        notifyDone,
        closeConnection,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

// Custom hook to use the WebSocket context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider")
  }
  return context
}
