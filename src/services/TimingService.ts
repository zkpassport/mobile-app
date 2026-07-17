import { OperationTiming, SubOperationTiming } from "@/types/Error"

export type OperationType = OperationTiming["operation_type"]

/**
 * Internal class for tracking sub-operations that can have their own sub-operations
 */
class SubOperationTimer {
  private startTime: number
  private endTime?: number
  private subOperations: Map<string, SubOperationTimer> = new Map()

  constructor() {
    this.startTime = Date.now()
  }

  startSubOperation(name: string): SubOperationTimer {
    const subTimer = new SubOperationTimer()
    this.subOperations.set(name, subTimer)
    return subTimer
  }

  getSubOperation(name: string): SubOperationTimer | undefined {
    return this.subOperations.get(name)
  }

  end(): void {
    this.endTime = Date.now()
  }

  /**
   * Get current elapsed time without ending the operation
   */
  getElapsedTime(): number {
    const endTime = this.endTime || Date.now()
    return endTime - this.startTime
  }

  isRunning(): boolean {
    return !this.endTime
  }

  toJSON(): SubOperationTiming | undefined {
    if (!this.endTime) return undefined

    const subOperationsData: { [key: string]: SubOperationTiming } = {}
    this.subOperations.forEach((subOp, name) => {
      // Only include sub-operations that have been ended
      if (!subOp.isRunning()) {
        const json = subOp.toJSON()
        if (json) {
          subOperationsData[name] = json
        }
      }
    })

    return {
      time_elapsed_ms: this.endTime - this.startTime,
      sub_operations: Object.keys(subOperationsData).length > 0 ? subOperationsData : undefined,
    }
  }
}

/**
 * A modular timer class for tracking operation durations
 * Can track main operations and nested sub-operations with metadata
 */
export class OperationTimer {
  private operationType: OperationType
  private startTime: number
  private endTime?: number
  private subOperations: Map<string, SubOperationTimer> = new Map()
  private metadata: OperationTiming["metadata"] = {}
  private activeSubOperationStack: string[] = []

  constructor(operationType: OperationType) {
    this.operationType = operationType
    this.startTime = Date.now()
  }

  /**
   * Start tracking a sub-operation at the current level
   * This creates a sub-operation at the same level as other sub-operations
   */
  startSubOperation(name: string): void {
    // Always create at the top level
    const subTimer = new SubOperationTimer()
    this.subOperations.set(name, subTimer)
    this.activeSubOperationStack = [name]
  }

  /**
   * Start tracking a nested sub-operation within a specific parent sub-operation
   * @param parentPath - Array of operation names representing the path to the parent operation
   * @param name - Name of the new nested sub-operation
   */
  startNestedSubOperation(parentPath: string | string[], name: string): void {
    // Convert single parent to array for consistency
    const path = Array.isArray(parentPath) ? parentPath : [parentPath]

    // Find the parent timer
    const parentTimer = this.getSubOperationTimer(path)
    if (parentTimer) {
      parentTimer.startSubOperation(name)
    } else {
      // Parent doesn't exist, throw warning or create parent first
      console.warn(`Parent operation not found: ${path.join(" > ")}`)
    }
  }

  /**
   * End tracking a top-level sub-operation
   * @param name - Name of the sub-operation to end
   */
  endSubOperation(name: string): void {
    const topLevelTimer = this.subOperations.get(name)
    if (topLevelTimer && topLevelTimer.isRunning()) {
      topLevelTimer.end()
    }
  }

  /**
   * End tracking a nested sub-operation
   * @param parentPath - Path to the parent operation(s)
   * @param name - Name of the nested sub-operation to end
   */
  endNestedSubOperation(parentPath: string | string[], name: string): void {
    const path = Array.isArray(parentPath) ? [...parentPath, name] : [parentPath, name]
    const timer = this.getSubOperationTimer(path)
    if (timer && timer.isRunning()) {
      timer.end()
    }
  }

  /**
   * Get a sub-operation timer by path
   */
  public getSubOperationTimer(path: string[]): SubOperationTimer | undefined {
    if (path.length === 0) return undefined

    let current = this.subOperations.get(path[0])
    for (let i = 1; i < path.length && current; i++) {
      current = current.getSubOperation(path[i])
    }
    return current
  }

  /**
   * Check if a sub-operation exists
   */
  hasSubOperation(name: string): boolean {
    return this.subOperations.has(name)
  }

  /**
   * Add metadata to the operation
   */
  addMetadata(metadata: Partial<OperationTiming["metadata"]>): void {
    this.metadata = { ...this.metadata, ...metadata }
  }

  /**
   * End the main operation and return timing data
   */
  end(): OperationTiming {
    this.endTime = Date.now()

    // End any still-running top-level sub-operations
    this.subOperations.forEach((subOp) => {
      if (subOp.isRunning()) {
        subOp.end()
      }
    })

    const subOperationsData: OperationTiming["sub_operations"] = {}
    this.subOperations.forEach((subOp, name) => {
      // Only include sub-operations that have been ended
      if (!subOp.isRunning()) {
        const json = subOp.toJSON()
        if (json) {
          subOperationsData[name] = json
        }
      }
    })

    return {
      operation_type: this.operationType,
      time_elapsed_ms: this.endTime - this.startTime,
      sub_operations: Object.keys(subOperationsData).length > 0 ? subOperationsData : undefined,
      metadata: Object.keys(this.metadata || {}).length > 0 ? this.metadata : undefined,
    }
  }

  /**
   * Get current elapsed time without ending the operation
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * Get the elapsed time of a sub-operation by name/path
   * @param path - Array of operation names representing the path to the operation
   * @returns elapsed time in milliseconds, or 0 if operation not found
   */
  getSubOperationElapsedTime(path: string | string[]): number {
    const pathArray = Array.isArray(path) ? path : [path]
    const timer = this.getSubOperationTimer(pathArray)
    return timer ? timer.getElapsedTime() : 0
  }

  /**
   * Check if operation is still running
   */
  isRunning(): boolean {
    return !this.endTime
  }
}

/**
 * Factory function to create a timer for a specific operation
 */
export function createOperationTimer(operationType: OperationType): OperationTimer {
  return new OperationTimer(operationType)
}

/**
 * Hook for React components to track operation timing
 */
// TODO: Not used atm, will be used when the larger files are split into smaller files
export function useOperationTimer(operationType: OperationType) {
  let timer: OperationTimer | null = null

  const startTimer = () => {
    timer = createOperationTimer(operationType)
    return timer
  }

  const getTimer = () => timer

  const endTimer = () => {
    if (timer && timer.isRunning()) {
      return timer.end()
    }
    return null
  }

  return { startTimer, getTimer, endTimer }
}
