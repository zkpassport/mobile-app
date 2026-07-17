import { BRIDGE_REQUEST_STORAGE_MAX_REQUESTS } from "@/lib/constants"
import { StorageService } from "./StorageService"
import { KeyPair, BridgeInterface } from "@obsidion/bridge"
import { hexToUint8Array, uint8ArrayToHex } from "@zkpassport/utils"

const STORAGE_KEY = "@zkpassport:bridge_requests"

// Storage for bridge requests
export interface BridgeRequestData {
  pubkey: string
  keyPair: {
    publicKey: string
    privateKey: string
  }
  domain: string
}

// This class is used to store bridge requests in storage, allowing them to be resumed if a user rescans a QR code.
// Currently, we store the last five bridge requests. This is arbitrary and can be changed.

export class BridgeRequestStorage {
  private maxRequests: number = BRIDGE_REQUEST_STORAGE_MAX_REQUESTS
  private requests: BridgeRequestData[] = []
  private storage: StorageService

  constructor(storage: StorageService) {
    this.storage = storage
  }

  /**
   * Load stored bridge requests from storage
   */
  async load(): Promise<void> {
    try {
      const stored = await this.storage.getItem(STORAGE_KEY)
      if (stored) {
        this.requests = JSON.parse(stored)
        console.log(`Loaded ${this.requests.length} bridge request(s) from storage`)
      }
    } catch (error) {
      console.error("Failed to load bridge requests from storage:", error)
      this.requests = []
    }
  }

  /**
   * Save bridge requests to storage
   */
  private async _save(): Promise<void> {
    try {
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.requests))
      console.log(`Saved ${this.requests.length} bridge request(s) to storage`)
    } catch (error) {
      console.error("Failed to save bridge requests to storage:", error)
    }
  }

  /**
   * Find a key pair by pubkey
   * @param pubkey The public key to search for
   * @param domain The domain to search for
   * @returns The keypair if found, undefined otherwise, as uint8Array KeyPair
   */
  findKeyPairByPubkey(pubkey: string, domain: string): KeyPair | undefined {
    const request = this.requests.find((r) => r.pubkey === pubkey && r.domain === domain)
    if (!request) {
      return undefined
    }
    return {
      publicKey: hexToUint8Array(request.keyPair.publicKey),
      privateKey: hexToUint8Array(request.keyPair.privateKey),
    }
  }

  /**
   * Add a new bridge request. Maintains FIFO queue of maxRequests items.
   * @param pubkey The public key of the bridge creator
   * @param keyPair The keypair used for this bridge connection
   */
  private async _addRequest(
    pubkey: string,
    keyPair: { publicKey: string; privateKey: string },
    domain: string,
  ): Promise<void> {
    // Check if this pubkey already exists
    const existingIndex = this.requests.findIndex((r) => r.pubkey === pubkey && r.domain === domain)

    if (existingIndex !== -1) {
      // Update existing request and move it to the end (most recent)
      this.requests.splice(existingIndex, 1)
    }

    // Add new request
    this.requests.push({ pubkey, keyPair, domain })

    // Maintain max size - remove oldest if we exceed the limit
    if (this.requests.length > this.maxRequests) {
      const removed = this.requests.shift()
      console.log(`Removed oldest bridge request (pubkey: ${removed?.pubkey.substring(0, 10)}...)`)
    }

    await this._save()
  }

  /**
   * Store a bridge's keypair directly from BridgeInterface
   * @param bridge The bridge instance to extract keypair from
   * @param pubkey The public key to use as identifier
   */
  async storeBridgeKeyPair(bridge: BridgeInterface, pubkey: string, domain: string): Promise<void> {
    const bridgeKeyPair = bridge.getKeyPair()
    await this._addRequest(
      pubkey,
      {
        publicKey: uint8ArrayToHex(bridgeKeyPair.publicKey),
        privateKey: uint8ArrayToHex(bridgeKeyPair.privateKey),
      },
      domain,
    )
  }

  async clear(): Promise<void> {
    this.requests = []
    await this.storage.removeItem(STORAGE_KEY)
  }
}
