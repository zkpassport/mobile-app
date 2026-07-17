import { BackgroundErrorReporter } from "@/services/BackGroundError"
import { ErrorLog } from "@/types/Error"

describe("BackgroundErrorReporter", () => {
  let reporter: BackgroundErrorReporter
  let mockSend: jest.Mock
  let mockErrorLog: ErrorLog

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    mockSend = jest.fn()
    reporter = new BackgroundErrorReporter(mockSend)
    mockErrorLog = {
      message: "Test error message",
      error_type: "TEST_ERROR" as any,
      device_uuid: "test-device-123",
    }
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("sendInBackground", () => {
    it("should send error log successfully without blocking", async () => {
      mockSend.mockResolvedValue(undefined)

      reporter.sendInBackground(mockErrorLog)

      // Should not block - verify send hasn't been called yet
      expect(mockSend).not.toHaveBeenCalled()

      // Run setImmediate callbacks
      await jest.runAllTimersAsync()

      expect(mockSend).toHaveBeenCalledWith(mockErrorLog)
    })

    it("should queue for retry if initial send fails", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)

      // Wait for setImmediate and async operations to complete
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(mockSend).toHaveBeenCalled()
      expect(reporter["retryQueue"].length).toBe(1)
    })

    it("should handle multiple concurrent sendInBackground calls", async () => {
      mockSend.mockResolvedValue(undefined)

      reporter.sendInBackground(mockErrorLog)
      reporter.sendInBackground({ ...mockErrorLog, message: "Second error" })
      reporter.sendInBackground({ ...mockErrorLog, message: "Third error" })

      await jest.runAllTimersAsync()

      expect(mockSend).toHaveBeenCalledTimes(3)
    })
  })

  describe("retry queue management", () => {
    it("should add failed requests to retry queue", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(reporter["retryQueue"].length).toBe(1)
      expect(reporter["retryQueue"][0].log).toMatchObject(mockErrorLog)
    })

    it("should drop oldest item when queue is full", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      // Fill queue past max (10 items)
      for (let i = 0; i < 11; i++) {
        reporter.sendInBackground({ ...mockErrorLog, message: `Error ${i}` })
      }

      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      // Queue should be capped at 10
      expect(reporter["retryQueue"].length).toBe(10)
      // First item should be dropped, so queue should start with "Error 1"
      expect(reporter["retryQueue"][0].log.message).toBe("Error 1")
    })
  })

  describe("retry processing", () => {
    it("should retry failed requests successfully", async () => {
      // First attempt fails, retry succeeds
      mockSend.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(undefined)

      reporter.sendInBackground(mockErrorLog)
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      // Should have queued for retry
      expect(reporter["retryQueue"].length).toBe(1)

      // Advance timer to trigger retry (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()

      // Queue should be empty after successful retry
      expect(reporter["retryQueue"].length).toBe(0)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it("should re-queue items that fail retry", async () => {
      // All attempts fail
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(reporter["retryQueue"].length).toBe(1)

      // First retry attempt (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(reporter["retryQueue"].length).toBe(1)
      expect(reporter["retryQueue"][0].retryCount).toBe(1)

      // Second retry attempt (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(reporter["retryQueue"].length).toBe(1)
      expect(reporter["retryQueue"][0].retryCount).toBe(2)
    })

    it("should drop items after max retries", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      // Initial queue
      expect(reporter["retryQueue"].length).toBe(1)

      // Retry 1 (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(reporter["retryQueue"].length).toBe(1)

      // Retry 2 (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(reporter["retryQueue"].length).toBe(1)

      // Retry 3 - should drop after this (1000ms delay)
      await jest.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(reporter["retryQueue"].length).toBe(0)

      // Total attempts: 1 initial + 3 retries = 4
      expect(mockSend).toHaveBeenCalledTimes(4)
    })

    it("should not process retry queue if already processing", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      // Manually set processing flag
      reporter["processing"] = true

      reporter["addToRetryQueue"](mockErrorLog)

      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      // Should still be in queue since processing flag blocked it
      expect(reporter["retryQueue"].length).toBe(1)
    })

    it("should not schedule retry if queue is empty", async () => {
      const scheduleRetrySpy = jest.spyOn(reporter as any, "scheduleRetry")

      reporter["scheduleRetry"]()

      // Should return early without scheduling
      expect(scheduleRetrySpy).toHaveBeenCalled()
      expect(reporter["processing"]).toBe(false)
    })
  })

  describe("clearQueue", () => {
    it("should clear retry queue and reset processing state", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)
      reporter.sendInBackground({ ...mockErrorLog, message: "Second error" })

      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(reporter["retryQueue"].length).toBe(2)

      reporter.clearQueue()

      expect(reporter["retryQueue"].length).toBe(0)
      expect(reporter["processing"]).toBe(false)
    })

    it("should allow new items after clearing queue", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      reporter.sendInBackground(mockErrorLog)
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      reporter.clearQueue()

      reporter.sendInBackground({ ...mockErrorLog, message: "New error" })
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(reporter["retryQueue"].length).toBe(1)
      expect(reporter["retryQueue"][0].log.message).toBe("New error")
    })
  })

  describe("edge cases and integration", () => {
    it("should maintain queue order (FIFO)", async () => {
      mockSend.mockRejectedValue(new Error("Network error"))

      for (let i = 0; i < 5; i++) {
        reporter.sendInBackground({ ...mockErrorLog, message: `Error ${i}` })
      }

      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()

      expect(reporter["retryQueue"][0].log.message).toBe("Error 0")
      expect(reporter["retryQueue"][4].log.message).toBe("Error 4")
    })
  })
})
