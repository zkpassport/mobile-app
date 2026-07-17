import { gcm } from "@noble/ciphers/aes.js"
import { utf8ToBytes } from "@noble/ciphers/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"

export async function sha256Truncate(topic: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const data = encoder.encode(topic)
  const hashBuffer = await sha256(data)
  const fullHashArray = new Uint8Array(hashBuffer)
  const truncatedHashArray = fullHashArray.slice(0, 12)
  return truncatedHashArray
}

/**
 * Encrypts a message using AES/GCM with a specified encryption key and nonce
 * @param message - The message to encrypt
 * @param encryptionKey - The encryption key (32 bytes)
 * @param nonce - The nonce (12 bytes)
 * @returns The encrypted message as a base64 string
 */
export async function encrypt(message: string, encryptionKey: Uint8Array, nonce: Uint8Array) {
  const aes = gcm(encryptionKey, nonce)
  const data = utf8ToBytes(message)
  const ciphertext = aes.encrypt(data)
  return ciphertext
}

export async function decrypt(
  ciphertext: Uint8Array,
  encryptionKey: Uint8Array,
  nonce: Uint8Array,
) {
  const aes = gcm(encryptionKey, nonce)
  const data = aes.decrypt(ciphertext)
  const dataString = Buffer.from(data).toString("utf-8")
  return dataString
}

export async function decryptBuffer(
  ciphertext: Uint8Array,
  encryptionKey: Uint8Array,
  nonce: Uint8Array,
) {
  const aes = gcm(encryptionKey, nonce)
  const data = aes.decrypt(ciphertext)
  return data
}
