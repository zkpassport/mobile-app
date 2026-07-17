import { OperationTimer } from "@/services/TimingService"
import { OperationTiming } from "@/types/Error"

describe("OperationTimer", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("Basic Timer Functionality", () => {
    it("should create a timer with correct operation type", () => {
      const timer = new OperationTimer("mrz_scan")
      expect(timer).toBeInstanceOf(OperationTimer)
      expect(timer.isRunning()).toBe(true)
    })

    it("should track elapsed time", (done) => {
      const timer = new OperationTimer("nfc_scan")

      jest.advanceTimersByTime(50)

      const elapsed = timer.getElapsedTime()
      expect(elapsed).toBeGreaterThanOrEqual(50)
      done()
    })

    it("should end timer and return timing data", (done) => {
      const timer = new OperationTimer("proof_generation")

      jest.advanceTimersByTime(60)
      const timing = timer.end()

      expect(timing).toMatchObject({
        operation_type: "proof_generation",
        time_elapsed_ms: expect.any(Number),
      })

      expect(timing.time_elapsed_ms).toBeGreaterThanOrEqual(50)

      done()
    })

    it("should not be running after end", () => {
      const timer = new OperationTimer("mrz_scan")
      expect(timer.isRunning()).toBe(true)

      timer.end()
      expect(timer.isRunning()).toBe(false)
    })
  })

  describe("Sub-operations", () => {
    it("should track sub-operations", (done) => {
      const timer = new OperationTimer("onboarding")

      timer.startSubOperation("mrz_scan")
      jest.advanceTimersByTime(20)
      timer.endSubOperation("mrz_scan")

      timer.startSubOperation("nfc_scan")
      jest.advanceTimersByTime(20)
      timer.endSubOperation("nfc_scan")

      const timing = timer.end()

      expect(timing.sub_operations).toBeDefined()
      expect(timing.sub_operations?.mrz_scan).toMatchObject({
        time_elapsed_ms: expect.any(Number),
      })
      expect(timing.sub_operations?.nfc_scan).toMatchObject({
        time_elapsed_ms: expect.any(Number),
      })

      expect(timing.sub_operations?.mrz_scan.time_elapsed_ms).toBeGreaterThanOrEqual(20)
      expect(timing.sub_operations?.nfc_scan.time_elapsed_ms).toBeGreaterThanOrEqual(20)

      done()
    })

    it("should end sub-operations that were not ended when ending main operation", () => {
      const timer = new OperationTimer("onboarding")

      timer.startSubOperation("mrz_scan")
      timer.endSubOperation("mrz_scan")

      timer.startSubOperation("nfc_scan")
      // Don't end nfc_scan - when main operation ends, it will auto-end running operations

      const timing = timer.end()

      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      // Since nfc_scan is auto-ended when main operation ends, it WILL be included
      expect(timing.sub_operations?.nfc_scan).toBeDefined()
      expect(timing.sub_operations?.nfc_scan.time_elapsed_ms).toBeGreaterThanOrEqual(0)
    })

    it("should handle ending non-existent sub-operation gracefully", () => {
      const timer = new OperationTimer("onboarding")

      // Should not throw
      expect(() => {
        timer.endSubOperation("non_existent")
      }).not.toThrow()

      const timing = timer.end()
      expect(timing.sub_operations).toBeUndefined()
    })
  })

  describe("Metadata Handling", () => {
    it("should add metadata to timer", () => {
      const timer = new OperationTimer("mrz_scan")

      timer.addMetadata({
        manual_entry_attempted: true,
        scan_attempts: 2,
      })

      const timing = timer.end()

      expect(timing.metadata).toEqual({
        manual_entry_attempted: true,
        scan_attempts: 2,
      })
    })

    it("should merge metadata when called multiple times", () => {
      const timer = new OperationTimer("nfc_scan")

      timer.addMetadata({ scan_attempts: 1 })
      timer.addMetadata({ user_cancelled: true })
      timer.addMetadata({ scan_attempts: 2 }) // Should overwrite

      const timing = timer.end()

      expect(timing.metadata).toEqual({
        scan_attempts: 2,
        user_cancelled: true,
      })
    })

    it("should not include metadata if none was added", () => {
      const timer = new OperationTimer("proof_generation")
      const timing = timer.end()

      expect(timing.metadata).toBeUndefined()
    })
  })

  describe("Nested Sub-operations", () => {
    it("should support nested sub-operations", (done) => {
      const timer = new OperationTimer("onboarding")

      // Start top-level MRZ scan
      timer.startSubOperation("mrz_scan")
      jest.advanceTimersByTime(20)

      // Within MRZ scan, start camera scan
      timer.startNestedSubOperation("mrz_scan", "camera_scan")

      jest.advanceTimersByTime(20)
      timer.endNestedSubOperation("mrz_scan", "camera_scan")

      // Also within MRZ scan, start manual entry
      timer.startNestedSubOperation("mrz_scan", "manual_entry")
      jest.advanceTimersByTime(20)
      timer.endNestedSubOperation("mrz_scan", "manual_entry")
      timer.endSubOperation("mrz_scan")

      const timing = timer.end()

      // Verify nested structure
      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      expect(timing.sub_operations?.mrz_scan.sub_operations?.camera_scan).toBeDefined()
      expect(timing.sub_operations?.mrz_scan.sub_operations?.manual_entry).toBeDefined()

      // Verify timings
      expect(timing.sub_operations?.mrz_scan.time_elapsed_ms).toBeGreaterThanOrEqual(60)
      expect(
        timing.sub_operations?.mrz_scan.sub_operations?.camera_scan.time_elapsed_ms,
      ).toBeGreaterThanOrEqual(20)
      expect(
        timing.sub_operations?.mrz_scan.sub_operations?.manual_entry.time_elapsed_ms,
      ).toBeGreaterThanOrEqual(20)

      done()
    })

    it("should handle deeply nested operations", () => {
      const timer = new OperationTimer("proof_generation")

      timer.startSubOperation("level1")
      timer.startNestedSubOperation("level1", "level2")
      timer.startNestedSubOperation(["level1", "level2"], "level3")
      timer.endNestedSubOperation(["level1", "level2"], "level3")
      timer.endNestedSubOperation("level1", "level2")
      timer.endSubOperation("level1")

      const timing = timer.end()

      expect(timing.sub_operations?.level1).toBeDefined()
      expect(timing.sub_operations?.level1.sub_operations?.level2).toBeDefined()
      expect(
        timing.sub_operations?.level1.sub_operations?.level2.sub_operations?.level3,
      ).toBeDefined()
    })

    it("should handle multiple sub-operations at same level", () => {
      const timer = new OperationTimer("onboarding")

      // Create multiple top-level sub-operations
      timer.startSubOperation("mrz_scan")
      timer.startSubOperation("nfc_scan")
      timer.startSubOperation("proof_generation")

      // Add nested operations to each
      timer.startNestedSubOperation("mrz_scan", "camera")
      timer.endNestedSubOperation("mrz_scan", "camera")

      timer.startNestedSubOperation("nfc_scan", "attempt1")
      timer.endNestedSubOperation("nfc_scan", "attempt1")

      // End all top-level operations
      timer.endSubOperation("mrz_scan")
      timer.endSubOperation("nfc_scan")
      timer.endSubOperation("proof_generation")

      const timing = timer.end()

      // All three should exist at top level
      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      expect(timing.sub_operations?.nfc_scan).toBeDefined()
      expect(timing.sub_operations?.proof_generation).toBeDefined()

      // Check nested operations
      expect(timing.sub_operations?.mrz_scan.sub_operations?.camera).toBeDefined()
      expect(timing.sub_operations?.nfc_scan.sub_operations?.attempt1).toBeDefined()
    })
  })

  describe("Edge Cases and Real-world Scenarios", () => {
    it("should handle rapid sub-operation switches", () => {
      const timer = new OperationTimer("onboarding")

      // Create multiple operations at the same level
      timer.startSubOperation("mrz_scan")
      timer.startSubOperation("nfc_scan")

      // Add nested operations explicitly
      timer.startNestedSubOperation("mrz_scan", "manual_entry")
      timer.endNestedSubOperation("mrz_scan", "manual_entry")

      timer.endSubOperation("mrz_scan")
      timer.endSubOperation("nfc_scan")

      const timing = timer.end()

      // Both should be at top level
      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      expect(timing.sub_operations?.nfc_scan).toBeDefined()
      expect(timing.sub_operations?.mrz_scan.sub_operations?.manual_entry).toBeDefined()
    })

    it("should handle all operation types", () => {
      const operationTypes: OperationTiming["operation_type"][] = [
        "mrz_scan",
        "nfc_scan",
        "proof_generation",
        "base_subproof_generation",
        "cloud_prover",
        "onboarding",
      ]

      operationTypes.forEach((type) => {
        const timer = new OperationTimer(type)
        const timing = timer.end()
        expect(timing.operation_type).toBe(type)
      })
    })

    it("should simulate complete onboarding flow", async () => {
      const timer = new OperationTimer("onboarding")

      // MRZ scan
      timer.startSubOperation("mrz_scan")
      jest.advanceTimersByTime(20)
      timer.endSubOperation("mrz_scan")

      // Manual entry attempt
      timer.startSubOperation("manual_mrz_entry")
      timer.addMetadata({ manual_entry_attempted: true })
      jest.advanceTimersByTime(30)
      timer.endSubOperation("manual_mrz_entry")

      // NFC scan with retries
      timer.startSubOperation("nfc_scan")
      timer.addMetadata({ scan_attempts: 3 })
      jest.advanceTimersByTime(40)
      timer.endSubOperation("nfc_scan")

      // Complete
      timer.addMetadata({ completed: true })
      const timing = timer.end()

      expect(timing.operation_type).toBe("onboarding")
      expect(timing.time_elapsed_ms).toBeGreaterThanOrEqual(90)
      expect(timing.metadata).toEqual({
        manual_entry_attempted: true,
        scan_attempts: 3,
        completed: true,
      })
      expect(Object.keys(timing.sub_operations || {})).toHaveLength(3)
      expect(timing.sub_operations?.mrz_scan.time_elapsed_ms).toBeGreaterThanOrEqual(18)
      expect(timing.sub_operations?.manual_mrz_entry.time_elapsed_ms).toBeGreaterThanOrEqual(28)
      expect(timing.sub_operations?.nfc_scan.time_elapsed_ms).toBeGreaterThanOrEqual(38)
    })

    it("should handle multiple sub-operations at same level", async () => {
      const sub_proof_timer = new OperationTimer("base_subproof_generation")

      // Create multiple operations at the same level
      sub_proof_timer.startSubOperation("dsc_subproof")
      jest.advanceTimersByTime(40)
      sub_proof_timer.endSubOperation("dsc_subproof")

      sub_proof_timer.startSubOperation("id_check_subproof")
      jest.advanceTimersByTime(40)
      sub_proof_timer.endSubOperation("id_check_subproof")

      sub_proof_timer.startSubOperation("integrity_check_subproof")
      jest.advanceTimersByTime(40)
      sub_proof_timer.endSubOperation("integrity_check_subproof")

      const timing = sub_proof_timer.end()
      expect(timing.sub_operations?.dsc_subproof).toBeDefined()
      expect(timing.sub_operations?.id_check_subproof).toBeDefined()
      expect(timing.sub_operations?.integrity_check_subproof).toBeDefined()
    })

    it("simulates error in sub-operation", async () => {
      const sub_proof_timer = new OperationTimer("base_subproof_generation")

      sub_proof_timer.startSubOperation("dsc_subproof")
      jest.advanceTimersByTime(40)
      sub_proof_timer.endSubOperation("dsc_subproof")

      sub_proof_timer.startSubOperation("id_check_subproof")
      jest.advanceTimersByTime(40)

      // Do not end id_check_subproof, it should be auto-ended when base_subproof_generation is ended

      const timing = sub_proof_timer.end()
      expect(timing.sub_operations?.dsc_subproof).toBeDefined()
      expect(timing.sub_operations?.id_check_subproof).toBeDefined()
      expect(timing.sub_operations?.id_check_subproof.time_elapsed_ms).toBeGreaterThanOrEqual(40)
    })
  })

  it("should handle access request", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(40)
    access_request_timer.endSubOperation("base_subproof_generation")

    access_request_timer.startSubOperation("disclosure_proofs")
    jest.advanceTimersByTime(40)
    access_request_timer.startNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    jest.advanceTimersByTime(40)
    access_request_timer.endNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    access_request_timer.startNestedSubOperation("disclosure_proofs", "disclosure_proof_2")
    jest.advanceTimersByTime(40)
    access_request_timer.endNestedSubOperation("disclosure_proofs", "disclosure_proof_2")
    access_request_timer.endSubOperation("disclosure_proofs")

    const timing = access_request_timer.end()
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
    expect(timing.sub_operations?.disclosure_proofs).toBeDefined()
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.disclosure_proof_1,
    ).toBeDefined()
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.disclosure_proof_2,
    ).toBeDefined()
    expect(timing.sub_operations?.disclosure_proofs.time_elapsed_ms).toBeGreaterThanOrEqual(30)
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.disclosure_proof_1.time_elapsed_ms,
    ).toBeGreaterThanOrEqual(30)
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.disclosure_proof_2.time_elapsed_ms,
    ).toBeGreaterThanOrEqual(30)
  })

  it("should handle cloud prover", async () => {
    const cloud_prover_timer = new OperationTimer("access_request")

    cloud_prover_timer.startSubOperation("disclosure_proofs")
    jest.advanceTimersByTime(40)
    cloud_prover_timer.startNestedSubOperation("disclosure_proofs", "cloud_prover_request")
    jest.advanceTimersByTime(40)
    cloud_prover_timer.endNestedSubOperation("disclosure_proofs", "cloud_prover_request")
    cloud_prover_timer.endSubOperation("disclosure_proofs")

    const timing = cloud_prover_timer.end()
    expect(timing.sub_operations?.disclosure_proofs).toBeDefined()
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.cloud_prover_request,
    ).toBeDefined()
    expect(timing.sub_operations?.disclosure_proofs.time_elapsed_ms).toBeGreaterThanOrEqual(30)
    expect(
      timing.sub_operations?.disclosure_proofs.sub_operations?.cloud_prover_request.time_elapsed_ms,
    ).toBeGreaterThanOrEqual(30)
  })

  it("it adds metadata that access_request that base proofs were cached", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(500)
    access_request_timer.endSubOperation("base_subproof_generation")

    const baseSubproofDuration = access_request_timer.getSubOperationElapsedTime(
      "base_subproof_generation",
    )
    access_request_timer.addMetadata({
      baseproofs_cached: baseSubproofDuration < 1000,
    })

    access_request_timer.startSubOperation("disclosure_proofs")
    jest.advanceTimersByTime(40)
    access_request_timer.startNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    jest.advanceTimersByTime(40)
    access_request_timer.endNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    access_request_timer.endSubOperation("disclosure_proofs")

    const timing = access_request_timer.end()
    console.log(timing)
    expect(timing.metadata?.baseproofs_cached).toBeTruthy()
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
    expect(timing.sub_operations?.disclosure_proofs).toBeDefined()
  })

  it("it adds metadata that access_request that base proofs were not cached", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(1500)
    access_request_timer.endSubOperation("base_subproof_generation")

    // Use the clean pattern: get elapsed time and add metadata based on timing
    const baseSubproofDuration = access_request_timer.getSubOperationElapsedTime(
      "base_subproof_generation",
    )
    access_request_timer.addMetadata({
      baseproofs_cached: baseSubproofDuration < 1000,
    })

    access_request_timer.startSubOperation("disclosure_proofs")
    jest.advanceTimersByTime(40)
    access_request_timer.startNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    jest.advanceTimersByTime(40)
    access_request_timer.endNestedSubOperation("disclosure_proofs", "disclosure_proof_1")
    access_request_timer.endSubOperation("disclosure_proofs")

    const timing = access_request_timer.end()
    console.log(timing)
    expect(timing.metadata?.baseproofs_cached).toBeFalsy()
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
    expect(timing.sub_operations?.disclosure_proofs).toBeDefined()
  })

  it("it adds metadata when identity proof is regenerated", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(500)

    // Simulate integrity check regeneration (identity proof regeneration)
    access_request_timer.startNestedSubOperation(
      "base_subproof_generation",
      "integrity_check_regeneration",
    )
    jest.advanceTimersByTime(200)
    access_request_timer.endNestedSubOperation(
      "base_subproof_generation",
      "integrity_check_regeneration",
    )

    access_request_timer.endSubOperation("base_subproof_generation")

    // Use the clean pattern to detect both caching and identity proof regeneration
    const baseSubproofDuration = access_request_timer.getSubOperationElapsedTime(
      "base_subproof_generation",
    )
    const identityProofRegenerated =
      access_request_timer.getSubOperationElapsedTime([
        "base_subproof_generation",
        "integrity_check_regeneration",
      ]) > 0

    access_request_timer.addMetadata({
      baseproofs_cached: baseSubproofDuration < 1000,
      identity_proof_regenerated: identityProofRegenerated,
    })

    const timing = access_request_timer.end()
    console.log(timing)

    expect(timing.metadata?.baseproofs_cached).toBeTruthy() // 700ms < 1000ms, so cached
    expect(timing.metadata?.identity_proof_regenerated).toBeTruthy() // regeneration occurred
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
    expect(
      timing.sub_operations?.base_subproof_generation.sub_operations?.integrity_check_regeneration,
    ).toBeDefined()
  })

  it("it adds metadata when identity proof is NOT regenerated", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(500)
    // No integrity check regeneration - proof was fresh enough
    access_request_timer.endSubOperation("base_subproof_generation")

    // Use the clean pattern to detect both caching and identity proof regeneration
    const baseSubproofDuration = access_request_timer.getSubOperationElapsedTime(
      "base_subproof_generation",
    )
    const identityProofRegenerated =
      access_request_timer.getSubOperationElapsedTime([
        "base_subproof_generation",
        "integrity_check_regeneration",
      ]) > 0

    access_request_timer.addMetadata({
      baseproofs_cached: baseSubproofDuration < 1000,
      identity_proof_regenerated: identityProofRegenerated,
    })

    const timing = access_request_timer.end()
    console.log(timing)

    expect(timing.metadata?.baseproofs_cached).toBeTruthy() // 500ms < 1000ms, so cached
    expect(timing.metadata?.identity_proof_regenerated).toBeFalsy() // no regeneration occurred
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
    expect(
      timing.sub_operations?.base_subproof_generation.sub_operations?.integrity_check_regeneration,
    ).toBeUndefined()
  })

  it("check for identity proof regeneration when its timer was never called", async () => {
    const access_request_timer = new OperationTimer("access_request")

    access_request_timer.startSubOperation("base_subproof_generation")
    jest.advanceTimersByTime(500)
    access_request_timer.endSubOperation("base_subproof_generation")

    const baseSubproofDuration = access_request_timer.getSubOperationElapsedTime(
      "base_subproof_generation",
    )
    const identityProofRegenerated =
      access_request_timer.getSubOperationElapsedTime([
        "base_subproof_generation",
        "integrity_check_regeneration",
      ]) > 0

    access_request_timer.addMetadata({
      baseproofs_cached: baseSubproofDuration < 1000,
      identity_proof_regenerated: identityProofRegenerated,
    })

    const timing = access_request_timer.end()
    console.log(timing)
    expect(timing.metadata?.baseproofs_cached).toBeTruthy() // 500ms < 1000ms, so cached
    expect(timing.metadata?.identity_proof_regenerated).toBeFalsy() // regeneration occurred
    expect(timing.sub_operations?.base_subproof_generation).toBeDefined()
  })
})
