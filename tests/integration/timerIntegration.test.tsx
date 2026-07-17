import { renderHook, act } from "@testing-library/react-native"
import { useOperationTimer, createOperationTimer } from "@/services/TimingService"
import { createMRZReadError, createNFCScanError } from "@/lib/errorUtils"
import { MRZReadErrorSubType, NFCScanErrorSubType } from "@/types/Error"

describe("Timer Integration Tests", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("MRZ Scanning Integration", () => {
    it("should track successful MRZ camera scan", async () => {
      const timer = createOperationTimer("mrz_scan")
      timer.startSubOperation("camera_scan")

      // Simulate camera scan
      jest.advanceTimersByTime(100)

      timer.endSubOperation("camera_scan")

      const timing = timer.end()

      timing.metadata = {
        manual_entry_attempted: false,
        scan_attempts: 1,
        document_type: "passport",
      }

      const successData = {
        operation_timing: timing,
        documentType: "passport",
        country: "USA",
      }

      expect(successData.operation_timing.time_elapsed_ms).toBeGreaterThanOrEqual(100)
      expect(successData.operation_timing.metadata?.manual_entry_attempted).toBe(false)
      expect(successData.operation_timing.sub_operations).toMatchObject({
        camera_scan: {
          time_elapsed_ms: expect.any(Number),
        },
      })
    })

    it("should track failed MRZ scan with timing", () => {
      const timer = createOperationTimer("mrz_scan")

      // Simulate failed scan
      const timing = timer.end()
      timing.metadata = {
        manual_entry_attempted: false,
        user_cancelled: false,
        scan_attempts: 1,
      }

      // Create error with timing
      const error = createMRZReadError(null, false, false, "passport", undefined, timing)

      expect(error.context.operation_timing).toBe(timing)
      expect(error.errorSubType).toBe(MRZReadErrorSubType.SCAN_FAILED)
    })

    it("should track manual MRZ entry", async () => {
      const timer = createOperationTimer("mrz_scan")

      // Camera scan takes 100ms
      timer.startSubOperation("camera_scan")
      jest.advanceTimersByTime(100)
      timer.endSubOperation("camera_scan")

      timer.addMetadata({ manual_entry_attempted: true })

      // Simulate user typing
      timer.startSubOperation("manual_mrz_entry")
      jest.advanceTimersByTime(200)
      timer.endSubOperation("manual_mrz_entry")

      const timing = timer.end()

      expect(timing.time_elapsed_ms).toBeGreaterThanOrEqual(190)
      expect(timing.metadata?.manual_entry_attempted).toBe(true)
      expect(timing.sub_operations).toMatchObject({
        camera_scan: {
          time_elapsed_ms: expect.any(Number),
        },
        manual_mrz_entry: {
          time_elapsed_ms: expect.any(Number),
        },
      })
    })
  })

  describe("NFC Scanning Integration", () => {
    it("should track NFC scan with retries", async () => {
      let nfcTimer = createOperationTimer("nfc_scan")
      nfcTimer.addMetadata({
        scan_attempts: 1,
        document_type: "passport",
      })

      // First attempt fails
      jest.advanceTimersByTime(100)
      let timing = nfcTimer.end()
      nfcTimer.addMetadata({
        error_details: "Connection lost",
        retry_count: 0,
      })

      // Second attempt
      nfcTimer = createOperationTimer("nfc_scan")
      nfcTimer.addMetadata({
        scan_attempts: 2,
        document_type: "passport",
      })

      jest.advanceTimersByTime(100)
      timing = nfcTimer.end()

      expect(timing.time_elapsed_ms).toBeGreaterThanOrEqual(90)
      expect(timing.metadata?.scan_attempts).toBe(2)
    })

    it("should track NFC cancellation", () => {
      const timer = createOperationTimer("nfc_scan")
      timer.addMetadata({
        scan_attempts: 1,
        document_type: "id_card",
      })

      // User cancels
      const timing = timer.end()
      timing.metadata = {
        ...timing.metadata,
        user_cancelled: true,
      }

      expect(timing.metadata?.user_cancelled).toBe(true)
    })

    it("should create NFC error with timing after max attempts", () => {
      const timer = createOperationTimer("nfc_scan")
      timer.addMetadata({
        scan_attempts: 3,
        document_type: "passport",
      })

      const timing = timer.end()
      timing.metadata = {
        ...timing.metadata,
        error_details: "Timeout",
        retry_count: 2,
      }

      const error = createNFCScanError("Timeout", "passport", "USA", true, timing)

      expect(error.context.operation_timing).toBe(timing)
      expect(error.errorSubType).toBe(NFCScanErrorSubType.TIMEOUT)
    })
  })

  describe("Complete Onboarding Flow", () => {
    it("should track entire onboarding flow with sub-operations", async () => {
      const onboardingTimer = createOperationTimer("onboarding")

      // Step 1: MRZ Scan
      onboardingTimer.startSubOperation("mrz_scan")
      jest.advanceTimersByTime(200)
      onboardingTimer.startNestedSubOperation("mrz_scan", "camera_scan")
      jest.advanceTimersByTime(100)
      onboardingTimer.endNestedSubOperation("mrz_scan", "camera_scan")

      onboardingTimer.startNestedSubOperation("mrz_scan", "manual_mrz_entry")
      jest.advanceTimersByTime(300)
      onboardingTimer.endNestedSubOperation("mrz_scan", "manual_mrz_entry")

      onboardingTimer.endSubOperation("mrz_scan")

      // Step 2: NFC Scan (with one retry)
      onboardingTimer.startSubOperation("nfc_scan")
      jest.advanceTimersByTime(500)
      onboardingTimer.endSubOperation("nfc_scan")

      // Complete flow
      onboardingTimer.addMetadata({
        completed: true,
        document_type: "passport",
      })

      const timing = onboardingTimer.end()

      // What would be reported for PASSPORT_SCAN_SUCCESS
      const successData = {
        operation_timing: timing,
        mrz_scan_time: timing.sub_operations?.mrz_scan?.time_elapsed_ms,
        nfc_scan_time: timing.sub_operations?.nfc_scan?.time_elapsed_ms,
        total_time: timing.time_elapsed_ms,
      }

      expect(successData.total_time).toBeGreaterThanOrEqual(700)
      expect(successData.mrz_scan_time).toBeGreaterThanOrEqual(200)
      expect(successData.nfc_scan_time).toBeGreaterThanOrEqual(500)
      expect(timing.metadata?.completed).toBe(true)
    })

    it("should track flow exit when user cancels", () => {
      const onboardingTimer = createOperationTimer("onboarding")

      // User starts MRZ scan
      onboardingTimer.startSubOperation("mrz_scan")

      // User exits the flow - timer will auto-end running sub-operations
      onboardingTimer.addMetadata({
        user_cancelled: true,
        completed: false,
        last_step: "STEP1",
      })
      const timing = onboardingTimer.end()

      expect(timing.metadata?.user_cancelled).toBe(true)
      expect(timing.metadata?.completed).toBe(false)
      // Sub-operation will be auto-ended and included
      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      expect(timing.sub_operations?.mrz_scan.time_elapsed_ms).toBeGreaterThanOrEqual(0)
    })

    it("should track manual entry within onboarding", async () => {
      const onboardingTimer = createOperationTimer("onboarding")

      // Failed MRZ scan
      onboardingTimer.startSubOperation("mrz_scan")
      jest.advanceTimersByTime(100)
      onboardingTimer.endSubOperation("mrz_scan")

      // Manual entry
      onboardingTimer.startSubOperation("manual_mrz_entry")
      jest.advanceTimersByTime(300)
      onboardingTimer.endSubOperation("manual_mrz_entry")

      // NFC scan
      onboardingTimer.startSubOperation("nfc_scan")
      jest.advanceTimersByTime(200)
      onboardingTimer.endSubOperation("nfc_scan")

      const timing = onboardingTimer.end()

      expect(timing.sub_operations?.mrz_scan).toBeDefined()
      expect(timing.sub_operations?.manual_mrz_entry).toBeDefined()
      expect(timing.sub_operations?.nfc_scan).toBeDefined()
      expect(timing.sub_operations?.manual_mrz_entry.time_elapsed_ms).toBeGreaterThanOrEqual(300)
    })
  })

  describe("React Hook Integration", () => {
    it("should work with React components", () => {
      const { result } = renderHook(() => useOperationTimer("mrz_scan"))

      act(() => {
        const timer = result.current.startTimer()
        timer.addMetadata({ scan_attempts: 1 })
      })

      // Simulate some work
      act(() => {
        const timer = result.current.getTimer()
        timer?.startSubOperation("camera_init")
      })

      act(() => {
        const timer = result.current.getTimer()
        timer?.endSubOperation("camera_init")
      })

      let timing: any
      act(() => {
        timing = result.current.endTimer()
      })

      expect(timing).toBeDefined()
      expect(timing.operation_type).toBe("mrz_scan")
      expect(timing.metadata?.scan_attempts).toBe(1)
      expect(timing.sub_operations?.camera_init).toBeDefined()
    })

    it("should handle component unmount gracefully", () => {
      const { result, unmount } = renderHook(() => useOperationTimer("onboarding"))

      act(() => {
        result.current.startTimer()
      })

      // Unmount without ending timer
      unmount()

      // Should not throw
      expect(() => {
        result.current.endTimer()
      }).not.toThrow()
    })
  })
})
