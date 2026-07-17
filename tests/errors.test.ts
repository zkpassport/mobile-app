import {
  ZKPassportError,
  WebSocketError,
  ErrorType,
  WebSocketErrorSubType,
  CloudProverError,
  CloudProverErrorSubType,
  CircuitError,
  CircuitErrorSubType,
  NFCScanError,
  NFCScanErrorSubType,
  MRZReadError,
  MRZReadErrorSubType,
} from "@/types/Error"

describe("Error Classes - Throwing and Catching", () => {
  describe("WebSocketError", () => {
    it("should create a WebSocketError with correct properties", () => {
      const message = "WebSocket connection failed"
      const errorSubType = WebSocketErrorSubType.CONNECTION_FAILED
      const context = {
        domain: "example.com",
        error_details: { code: 1006, reason: "Connection closed abnormally" },
      }
      const error = new WebSocketError(message, errorSubType, context)

      expect(error).toBeInstanceOf(WebSocketError)
      expect(error).toBeInstanceOf(ZKPassportError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("WebSocketError")
      expect(error.message).toBe(message)
      expect(error.errorType).toBe(ErrorType.WEBSOCKET_ERROR)
      expect(error.errorSubType).toBe(errorSubType)
      expect(error.context).toEqual(context)

      // Ensure options.showUser defaults to true
      expect(error.options).toEqual({ showUser: true })
      // Ensure options.showUser can be overridden
      const errorWithOptions = new WebSocketError(message, errorSubType, context, {
        showUser: false,
      })
      expect(errorWithOptions.options).toEqual({ showUser: false })
    })

    it("should serialize to JSON with subtype included", () => {
      const error = new WebSocketError("Connection failed", WebSocketErrorSubType.BRIDGE_ERROR, {
        domain: "test.com",
      })

      const json = error.toJSON()
      expect(json).toEqual({
        name: "WebSocketError",
        message: "Connection failed",
        errorType: ErrorType.WEBSOCKET_ERROR,
        errorSubType: WebSocketErrorSubType.BRIDGE_ERROR,
        context: { domain: "test.com" },
        stack: expect.any(String),
      })
    })
  })

  describe("CloudProverError", () => {
    it("should create a CloudProverError with correct properties and subtype", () => {
      const message = "Prover authentication failed"
      const errorSubType = CloudProverErrorSubType.AUTHENTICATION_FAILED
      const context = {
        circuit: "base_proof",
        cloud_prover_url: "https://prover.example.com",
        response_header: "401 Unauthorized",
      }
      const error = new CloudProverError(message, errorSubType, context)

      expect(error).toBeInstanceOf(CloudProverError)
      expect(error).toBeInstanceOf(ZKPassportError)
      expect(error.name).toBe("CloudProverError")
      expect(error.message).toBe(message)
      expect(error.errorType).toBe(ErrorType.CLOUD_PROVER_ERROR)
      expect(error.errorSubType).toBe(errorSubType)
      expect(error.context).toEqual(context)
    })
  })

  describe("CircuitError", () => {
    it("should create a CircuitError with correct properties and subtype", () => {
      const errorSubType = CircuitErrorSubType.ProofGenerationFailed
      const message = "Proof generation failed"
      const context = {
        circuit_name: "disclosure_circuit",
        error_details: "Out of memory",
      }
      const error = new CircuitError(errorSubType, message, context)

      expect(error).toBeInstanceOf(CircuitError)
      expect(error).toBeInstanceOf(ZKPassportError)
      expect(error.name).toBe("CircuitError")
      expect(error.message).toBe(message)
      expect(error.errorType).toBe(ErrorType.CIRCUIT_ERROR)
      expect(error.errorSubType).toBe(errorSubType)
      expect(error.context).toEqual(context)
    })
  })

  describe("NFCScanError", () => {
    it("should create an NFCScanError with correct properties and subtype", () => {
      const message = "NFC scan timed out"
      const errorSubType = NFCScanErrorSubType.TIMEOUT
      const context = {
        scan_attempts: 5,
        document_type: "passport",
        timeout_duration: 30000,
        nfc_enabled: true,
      }
      const error = new NFCScanError(message, errorSubType, context)

      expect(error).toBeInstanceOf(NFCScanError)
      expect(error).toBeInstanceOf(ZKPassportError)
      expect(error.name).toBe("NFCScanError")
      expect(error.message).toBe(message)
      expect(error.errorType).toBe(ErrorType.NFC_SCAN_ERROR)
      expect(error.errorSubType).toBe(errorSubType)
      expect(error.context).toEqual(context)
    })
  })

  describe("MRZReadError", () => {
    it("should create an MRZReadError with correct properties and subtype", () => {
      const message = "MRZ parsing failed"
      const errorSubType = MRZReadErrorSubType.PARSING_ERROR
      const context = {
        input_method: "manual" as const,
        document_type: "passport",
        document_country: "USA",
      }
      const error = new MRZReadError(message, errorSubType, context)

      expect(error).toBeInstanceOf(MRZReadError)
      expect(error).toBeInstanceOf(ZKPassportError)
      expect(error.name).toBe("MRZReadError")
      expect(error.message).toBe(message)
      expect(error.errorType).toBe(ErrorType.MRZ_READ_ERROR)
      expect(error.errorSubType).toBe(errorSubType)
      expect(error.context).toEqual(context)
    })
  })
})
