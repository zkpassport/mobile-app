import { createCloudProverError, getCloudProverErrorSubType } from "@/lib/errorUtils"
import { CloudProverErrorSubType, ErrorType } from "@/types/Error"
import { CLOUD_PROVER_URL } from "@/lib/constants"

describe("Cloud Prover Error Handling", () => {
  describe("getCloudProverErrorSubType", () => {
    const testCases = [
      {
        error: new Error("Empty request"),
        expectedSubType: CloudProverErrorSubType.EMPTY_REQUEST,
      },
      {
        error: new Error("Missing bb_version"),
        expectedSubType: CloudProverErrorSubType.MISSING_BB_VERSION,
      },
      {
        error: new Error("Either witness or inputs field required"),
        expectedSubType: CloudProverErrorSubType.MISSING_INPUTS,
      },
      {
        error: new Error("Missing circuit field in request body"),
        expectedSubType: CloudProverErrorSubType.MISSING_INPUTS,
      },
      {
        error: new Error("bb binary path not set"),
        expectedSubType: CloudProverErrorSubType.MISSING_BB_BINARY_PATH,
      },
      {
        error: new Error("Unsupported bb version: 0.1.0"),
        expectedSubType: CloudProverErrorSubType.UNSUPPORTED_BB_VERSION,
      },
      {
        error: new Error("Failed to execute bb prove"),
        expectedSubType: CloudProverErrorSubType.SERVER_ERROR,
      },
      {
        error: new Error("Unknown error"),
        expectedSubType: CloudProverErrorSubType.SERVER_ERROR,
      },
      {
        error: new Error("Empty request"),
        expectedSubType: CloudProverErrorSubType.EMPTY_REQUEST,
      },
      {
        error: new Error("Missing bb_version in request body"),
        expectedSubType: CloudProverErrorSubType.MISSING_BB_VERSION,
      },
    ]

    testCases.forEach(({ error, expectedSubType }) => {
      it(`should detect ${expectedSubType} for error: "${
        error instanceof Error ? error.message : JSON.stringify(error)
      }"`, () => {
        const subType = getCloudProverErrorSubType(error)
        expect(subType).toBe(expectedSubType)
      })
    })
  })

  describe("createCloudProverError", () => {
    it("should create error with all required fields", () => {
      const error = createCloudProverError("outer_3x2", CloudProverErrorSubType.EMPTY_REQUEST, {
        proverUrl: CLOUD_PROVER_URL,
        responseHeader: "400 Bad Request",
        responseBody: JSON.stringify({ error: "Empty request" }),
      })

      expect(error.name).toBe("CloudProverError")
      expect(error.errorType).toBe(ErrorType.CLOUD_PROVER_ERROR)
      expect(error.errorSubType).toBe(CloudProverErrorSubType.EMPTY_REQUEST)
      expect(error.message).toBe("Cloud prover error for circuit: outer_3x2")
      expect(error.context).toEqual({
        circuit: "outer_3x2",
        cloud_prover_url: CLOUD_PROVER_URL,
        response_header: "400 Bad Request",
        response_body: JSON.stringify({ error: "Empty request" }),
        vkeys: undefined,
        public_inputs: undefined,
        error_details: undefined,
        operation_timing: undefined,
      })
    })

    it("should include vkeys and public inputs when provided", () => {
      const vkeys = ["0xabcd1234", "0xefgh5678", "0xijkl9012", "0xmnop3456", "0xqrst7890"]
      const publicInputs = {
        csc_to_dsc_proof: ["0x1", "0x2"],
        dsc_to_id_data_proof: ["0x3", "0x4"],
        integrity_check_proof: ["0x5", "0x6"],
        disclosure_proofs: [
          ["0x7", "0x8"],
          ["0x9", "0xa"],
        ],
      }

      const error = createCloudProverError("outer_5x2", CloudProverErrorSubType.SERVER_ERROR, {
        proverUrl: "https://prover.example.com",
        responseHeader: "503 Service Unavailable",
        responseBody: JSON.stringify({ error: "Service temporarily unavailable" }),
        vkeys,
        publicInputs,
      })

      expect(error.context.vkeys).toEqual(vkeys)
      expect(error.context.public_inputs).toEqual(publicInputs)
    })

    it("should handle network error scenarios", () => {
      const error = createCloudProverError("outer_3x2", CloudProverErrorSubType.SERVER_ERROR, {
        proverUrl: "https://custom-prover.com",
        responseBody: JSON.stringify(new Error("ECONNREFUSED")),
      })

      expect(error.message).toBe("Cloud prover error for circuit: outer_3x2")
      expect(error.context.cloud_prover_url).toBe("https://custom-prover.com")
      expect(error.context.response_header).toBeUndefined()
    })

    it("should create error for all cloud prover response types", () => {
      const testCases = [
        {
          errorResponse: new Error("Empty request"),
          expectedSubType: CloudProverErrorSubType.EMPTY_REQUEST,
          status: 400,
        },
        {
          errorResponse: new Error("Missing bb_version in request body"),
          expectedSubType: CloudProverErrorSubType.MISSING_BB_VERSION,
          status: 400,
        },
        {
          errorResponse: new Error("Either witness or inputs field required"),
          expectedSubType: CloudProverErrorSubType.MISSING_INPUTS,
          status: 400,
        },
        {
          errorResponse: new Error("Missing circuit field in request body"),
          expectedSubType: CloudProverErrorSubType.MISSING_INPUTS,
          status: 400,
        },
        {
          errorResponse: new Error("Unsupported bb version: v0.9.0"),
          expectedSubType: CloudProverErrorSubType.UNSUPPORTED_BB_VERSION,
          status: 400,
        },
        {
          errorResponse: new Error(
            "bb binary path not set. Please provide bb_version in request body or set BB_BINARY_PATH environment variable",
          ),
          expectedSubType: CloudProverErrorSubType.MISSING_BB_BINARY_PATH,
          status: 400,
        },
        {
          errorResponse: new Error("Failed to execute bb prove"),
          expectedSubType: CloudProverErrorSubType.SERVER_ERROR,
          status: 500,
        },
      ]

      testCases.forEach(({ errorResponse, expectedSubType, status }) => {
        const subType = getCloudProverErrorSubType(errorResponse)
        expect(subType).toBe(expectedSubType)

        const error = createCloudProverError("test_circuit", subType, {
          proverUrl: CLOUD_PROVER_URL,
          responseHeader: `${status} ${status === 400 ? "Bad Request" : "Internal Server Error"}`,
          responseBody: JSON.stringify(errorResponse),
        })

        expect(error.errorSubType).toBe(expectedSubType)
        expect(error.context.response_body).toBe(JSON.stringify(errorResponse))
      })
    })
  })

  describe("Error Context for AccessRequestView", () => {
    it("should create error with commitments data from outer circuit inputs", () => {
      // Simulating the getVkeysAndPublicInputs extraction
      const outerCircuitInputs = {
        csc_to_dsc_proof: { key_hash: "0xhash1", public_inputs: ["0x11", "0x22"] },
        dsc_to_id_data_proof: { key_hash: "0xhash2", public_inputs: ["0x33", "0x44"] },
        integrity_check_proof: { key_hash: "0xhash3", public_inputs: ["0x55", "0x66"] },
        disclosure_proofs: [{ key_hash: "0xhash4", public_inputs: ["0x77", "0x88"] }],
      }

      const vkeys = [
        outerCircuitInputs.csc_to_dsc_proof.key_hash,
        outerCircuitInputs.dsc_to_id_data_proof.key_hash,
        outerCircuitInputs.integrity_check_proof.key_hash,
        ...outerCircuitInputs.disclosure_proofs.map((p) => p.key_hash),
      ]

      const publicInputs = {
        csc_to_dsc_proof: outerCircuitInputs.csc_to_dsc_proof.public_inputs,
        dsc_to_id_data_proof: outerCircuitInputs.dsc_to_id_data_proof.public_inputs,
        integrity_check_proof: outerCircuitInputs.integrity_check_proof.public_inputs,
        disclosure_proofs: outerCircuitInputs.disclosure_proofs.map((p) => p.public_inputs),
      }

      const error = createCloudProverError("outer_3x2", CloudProverErrorSubType.SERVER_ERROR, {
        proverUrl: "https://custom-prover.com",
        responseHeader: "500 Internal Server Error",
        responseBody: JSON.stringify({ error: "Failed to execute bb prove" }),
        vkeys,
        publicInputs,
      })

      expect(error.context.vkeys).toEqual(["0xhash1", "0xhash2", "0xhash3", "0xhash4"])
      expect(error.context.public_inputs).toEqual({
        csc_to_dsc_proof: ["0x11", "0x22"],
        dsc_to_id_data_proof: ["0x33", "0x44"],
        integrity_check_proof: ["0x55", "0x66"],
        disclosure_proofs: [["0x77", "0x88"]],
      })
    })
  })
})
