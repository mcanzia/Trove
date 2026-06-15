import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env.js'

/**
 * AES-256-GCM credential encryption.
 *
 * The user's pasted Reddit cookie is encrypted here (API) and decrypted by the
 * Python worker — they share REDDIT_TOKEN_ENC_KEY (base64 of 32 random bytes)
 * and this wire format: base64( iv[12] | ciphertext | authTag[16] ).
 */

function key(): Buffer {
  if (!env.REDDIT_TOKEN_ENC_KEY) throw new Error('REDDIT_TOKEN_ENC_KEY not configured')
  const k = Buffer.from(env.REDDIT_TOKEN_ENC_KEY, 'base64')
  if (k.length !== 32) throw new Error('REDDIT_TOKEN_ENC_KEY must be base64 of 32 bytes')
  return k
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString('base64')
}

export function decryptToken(b64: string): string {
  const raw = Buffer.from(b64, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(raw.length - 16)
  const ct = raw.subarray(12, raw.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
