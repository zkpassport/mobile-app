import AsyncStorage from "@react-native-async-storage/async-storage"

// Merge options
export interface MergeOptions {
  deleteKeys?: string[] // Keys to explicitly delete
}

// Storage interface
export interface StorageService {
  // Key-value storage
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  mergeItem(key: string, value: any, options?: MergeOptions): Promise<void>
  _mergeItem(key: string, value: any, options?: MergeOptions): Promise<void>
  clearSettings(): Promise<void>
}

export class DiskStorageService implements StorageService {
  // Simple in-memory locks to prevent concurrent updates
  private locks = new Map<string, Promise<void>>()

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing operation on this key to complete
    const existingLock = this.locks.get(key)
    if (existingLock) {
      await existingLock
    }

    // Create a new lock for this operation
    const newLock = operation()
    this.locks.set(
      key,
      newLock.then(
        () => {},
        () => {},
      ),
    ) // Handle both success and failure

    try {
      const result = await newLock
      return result
    } finally {
      // Clean up the lock when operation completes
      this.locks.delete(key)
    }
  }

  async getItem(key: string): Promise<string | null> {
    let value: string | null
    try {
      value = await AsyncStorage.getItem(key)
      return value
    } catch (error) {
      console.log(`Error getting item for key ${key}:`, error)
      return null
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value)
    } catch (error) {
      console.log(`Error saving item for key ${key}:`, error)
      throw error
    }
  }

  async mergeItem(key: string, value: any, options?: MergeOptions): Promise<void> {
    return this._mergeItem(key, value, options)
  }

  async _mergeItem(key: string, value: any, options?: MergeOptions): Promise<void> {
    return this.withLock(key, async () => {
      try {
        // Get current stored value
        const currentValue = await this.getItem(key)
        let currentObject = {}

        if (currentValue) {
          try {
            currentObject = JSON.parse(currentValue)
          } catch (error) {
            console.warn(`Error parsing current value for key ${key}:`, error)
            currentObject = {}
          }
        }

        // Parse the new value if it's a string
        let newObject = value
        if (typeof value === "string") {
          try {
            newObject = JSON.parse(value)
          } catch (error) {
            console.warn(`Error parsing new value for key ${key}:`, error)
            throw error
          }
        }

        // Deep merge the objects
        const mergedObject = this.deepMerge(currentObject, newObject, options)

        // Handle explicit key deletions
        if (options?.deleteKeys) {
          for (const deleteKey of options.deleteKeys) {
            this.deleteNestedKey(mergedObject, deleteKey)
          }
        }
        this.removeUndefinedKeys(mergedObject)

        // Save the merged result
        await this.setItem(key, JSON.stringify(mergedObject))
      } catch (error) {
        console.log(`Error in enhanced merge for key ${key}:`, error)
        throw error
      }
    })
  }

  private deepMerge(target: any, source: any, options?: MergeOptions): any {
    const result = { ...target }

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key]

        // Handle undefined as deletion
        if (sourceValue === undefined) {
          delete result[key]
          continue
        }

        // Handle objects recursively
        if (
          sourceValue &&
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue) &&
          result[key] &&
          typeof result[key] === "object" &&
          !Array.isArray(result[key])
        ) {
          result[key] = this.deepMerge(result[key], sourceValue, options)
        } else {
          result[key] = sourceValue
        }
      }
    }

    return result
  }

  private deleteNestedKey(obj: any, keyPath: string): void {
    const keys = keyPath.split(".")
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] && typeof current[keys[i]] === "object") {
        current = current[keys[i]]
      } else {
        return // Path doesn't exist
      }
    }

    delete current[keys[keys.length - 1]]
  }

  private removeUndefinedKeys(obj: any): void {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const key in obj) {
        if (obj[key] === undefined) {
          delete obj[key]
        } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
          this.removeUndefinedKeys(obj[key])
        }
      }
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key)
    } catch (error) {
      console.log(`Error removing item for key ${key}:`, error)
      throw error
    }
  }

  async clearSettings(): Promise<void> {
    await AsyncStorage.clear()
  }
}
