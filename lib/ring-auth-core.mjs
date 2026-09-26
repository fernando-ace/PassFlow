import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const RING_NONCE_WINDOW_MS = 600_000
const TOKEN_AAD = Buffer.from('passflow:ring-token:v1')

function encryptionKey(raw) {
  if (!raw) throw new Error('RING_TOKEN_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(raw, 'base64url')
  if (key.length !== 32) throw new Error('RING_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key')
  return key
}

export function encryptRingToken(value, key) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Cannot encrypt an empty Ring token')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv)
  cipher.setAAD(TOKEN_AAD)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptRingToken(value, key) {
  if (typeof value !== 'string') throw new Error('Stored Ring token is invalid')
  const [version, ivText, tagText, ciphertextText, extra] = value.split('.')
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new Error('Stored Ring token has an unsupported format')
  }
  const iv = Buffer.from(ivText, 'base64url')
  const tag = Buffer.from(tagText, 'base64url')
  const ciphertext = Buffer.from(ciphertextText, 'base64url')
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('Stored Ring token is corrupted')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv)
  decipher.setAAD(TOKEN_AAD)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function computeRingNonce(time, accountId, hmacKey) {
  if (!/^\d{13}$/.test(time) || typeof accountId !== 'string' || !accountId || !hmacKey) {
    throw new Error('Invalid Ring nonce inputs')
  }
  return createHmac('sha256', hmacKey).update(`${time}:${accountId}`, 'utf8').digest('base64url')
}

export function validateRingLink(time, nonce, accountId, hmacKey, now = Date.now()) {
  if (!/^\d{13}$/.test(time) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return false
  const timestamp = Number(time)
  if (!Number.isSafeInteger(timestamp) || timestamp > now || now - timestamp > RING_NONCE_WINDOW_MS) return false
  const expected = Buffer.from(computeRingNonce(time, accountId, hmacKey))
  const supplied = Buffer.from(nonce)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export function verifyRingWebhookSignature(rawBody, signature, hmacKey) {
  const match = typeof signature === 'string' && /^sha256=([a-fA-F0-9]{64})$/.exec(signature)
  if (!match || !hmacKey) return false
  const expected = createHmac('sha256', hmacKey).update(rawBody).digest()
  const supplied = Buffer.from(match[1], 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export function parseRingTokenResponse(data, now = Date.now()) {
  if (!data || typeof data.access_token !== 'string' || !data.access_token ||
      typeof data.refresh_token !== 'string' || !data.refresh_token ||
      !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0) {
    throw new Error('Ring returned an invalid token response')
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now + data.expires_in * 1000 }
}

export async function exchangeRingAuthorizationCode(code, { fetchImpl = fetch, clientId, clientSecret, now = Date.now() }) {
  if (typeof code !== 'string' || code.length === 0 || code.length > 4096) throw new Error('Invalid Ring authorization code')
  if (!clientId || !clientSecret) throw new Error('Ring OAuth client credentials are not configured')
  const response = await fetchImpl('https://oauth.ring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Ring authorization-code exchange failed with status ${response.status}`)
  return parseRingTokenResponse(await response.json(), now)
}

export async function refreshRingAccessToken(refreshToken, { fetchImpl = fetch, clientId, clientSecret, now = Date.now() }) {
  if (typeof refreshToken !== 'string' || !refreshToken) throw new Error('Stored Ring refresh token is invalid')
  if (!clientId || !clientSecret) throw new Error('Ring OAuth client credentials are not configured')
  const response = await fetchImpl('https://oauth.ring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Ring token refresh failed with status ${response.status}`)
  return parseRingTokenResponse(await response.json(), now)
}
