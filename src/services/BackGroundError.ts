import { ErrorLog } from "@/types/Error"

type SendReport = (log: ErrorLog) => Promise<void>

/**
 * Fire-and-forget delivery for error logs: send in the background, queue
 * failed sends, retry a few times, then drop.
 *
 * The actual POST is injected so the endpoint and fetch logic live in one
 * place (EventReportingService), shared with the other reporting functions.
 */
export class BackgroundErrorReporter {
  private retryQueue: { log: ErrorLog; retryCount: number }[] = []
  private processing = false
  private maxRetries = 3
  private retryDelay = 1000
  private maxQueueSize = 10

  constructor(private send: SendReport) {}

  sendInBackground(log: ErrorLog) {
    // Defer to the next tick so the caller never waits on the network
    setImmediate(async () => {
      try {
        await this.send(log)
      } catch (error) {
        console.log("Background send failed, queuing for retry:", error)
        this.addToRetryQueue(log)
      }
    })
  }

  private addToRetryQueue(log: ErrorLog, retryCount = 0) {
    // Bounded queue: drop the oldest item when full
    if (this.retryQueue.length >= this.maxQueueSize) {
      this.retryQueue.shift()
    }
    this.retryQueue.push({ log, retryCount })
    this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.processing) return
    setTimeout(() => this.processRetryQueue(), this.retryDelay)
  }

  private async processRetryQueue() {
    if (this.processing || this.retryQueue.length === 0) return
    this.processing = true

    const item = this.retryQueue.shift()
    if (item) {
      try {
        await this.send(item.log)
      } catch {
        if (item.retryCount + 1 < this.maxRetries) {
          this.retryQueue.push({ log: item.log, retryCount: item.retryCount + 1 })
        } else {
          console.log("Max retries reached, dropping error log")
        }
      }
    }

    this.processing = false
    if (this.retryQueue.length > 0) {
      this.scheduleRetry()
    }
  }

  clearQueue() {
    this.retryQueue = []
    this.processing = false
  }
}
