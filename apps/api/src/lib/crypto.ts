import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

/**
 * AES-256-GCM token encryption + HMAC-signed OAuth state.
 *
 * The Reddit refresh token is encrypted here (API) and decrypted by the Python
 * worker — they share REDDIT_TOKEN_ENC_KEY (base64 of 32 random bytes) and this
 * wire format: base64( iv[12] | ciphertext | authTag[16] ).
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

// ---- Signed OAuth state (stateless CSRF) ----
const b64url = (b: Buffer) => b.toString('base64url')

function sign(data: string): string {
  return b64url(createHmac('sha256', key()).update(data).digest())
}

/** Sign a state payload bound to the user, with a nonce + expiry. */
export function signState(userId: string, ttlSeconds = 600): string {
  const payload = b64url(Buffer.from(JSON.stringify({
    uid: userId, n: randomBytes(8).toString('hex'), exp: Date.now() + ttlSeconds * 1000,
  })))
  return `${payload}.${sign(payload)}`
}

/** Verify a state token; returns the userId or throws. */
export function verifyState(state: string): string {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) throw new Error('malformed state')
  const expected = sign(payload)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad state signature')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid: string; exp: number }
  if (!data.uid || typeof data.exp !== 'number' || Date.now() > data.exp) throw new Error('expired state')
  return data.uid
}
