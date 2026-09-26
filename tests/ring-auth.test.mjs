import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  computeRingNonce,
  decryptRingToken,
  encryptRingToken,
  exchangeRingAuthorizationCode,
  parseRingTokenResponse,
  refreshRingAccessToken,
  validateRingLink,
  verifyRingWebhookSignature,
} from '../lib/ring-auth-core.mjs'

const KEY = Buffer.alloc(32, 7).toString('base64url')
const HMAC = 'test-ring-hmac-key'

test('Ring link nonce uses timestamp:account id and unpadded Base64URL', () => {
  const time = '1780000000000'
  const accountId = 'ava1.ring.account.example'
  const expected = createHmac('sha256', HMAC).update(`${time}:${accountId}`).digest('base64url')
  assert.equal(computeRingNonce(time, accountId, HMAC), expected)
  assert.match(expected, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(validateRingLink(time, expected, accountId, HMAC, Number(time) + 30_000), true)
})

test('Ring link verification rejects expired, future, and invalid HMAC values', () => {
  const time = '1780000000000'
  const accountId = 'ava1.ring.account.example'
  const nonce = computeRingNonce(time, accountId, HMAC)
  assert.equal(validateRingLink(time, nonce, accountId, HMAC, Number(time) + 600_001), false)
  assert.equal(validateRingLink(time, nonce, accountId, HMAC, Number(time) - 1), false)
  assert.equal(validateRingLink(time, `${nonce.slice(0, -1)}A`, accountId, HMAC, Number(time) + 1), false)
})

test('Ring webhook signature validates the exact raw bytes and sha256 hex encoding', () => {
  const raw = Buffer.from('{ "data" : {"id":"evt-1"} }')
  const digest = createHmac('sha256', HMAC).update(raw).digest('hex')
  assert.equal(verifyRingWebhookSignature(raw, `sha256=${digest}`, HMAC), true)
  assert.equal(verifyRingWebhookSignature(Buffer.from(raw.toString().replaceAll(' ', '')), `sha256=${digest}`, HMAC), false)
  assert.equal(verifyRingWebhookSignature(raw, `sha256=${digest.slice(0, -1)}0`, HMAC), false)
})

test('Ring tokens encrypt and decrypt with AES-256-GCM and reject corrupt values', () => {
  const encrypted = encryptRingToken('ring-access-token', KEY)
  assert.notEqual(encrypted, 'ring-access-token')
  assert.equal(decryptRingToken(encrypted, KEY), 'ring-access-token')
  assert.throws(() => decryptRingToken(encrypted, Buffer.alloc(32, 8).toString('base64url')))
  assert.throws(() => decryptRingToken('broken', KEY))
  assert.throws(() => encryptRingToken('', KEY))
})

test('Ring token responses require both refreshable credentials and expiration metadata', () => {
  assert.deepEqual(parseRingTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 60 }, 1000), {
    accessToken: 'a', refreshToken: 'r', expiresAt: 61_000,
  })
  assert.throws(() => parseRingTokenResponse({ access_token: 'a', expires_in: 60 }))
})

test('authorization code exchange posts documented form fields and returns token metadata', async () => {
  let request
  const result = await exchangeRingAuthorizationCode('one-time-code', {
    clientId: 'client-id', clientSecret: 'private-secret', now: 2000,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 14400 })
    },
  })
  assert.equal(request.url, 'https://oauth.ring.com/oauth/token')
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.options.body)), {
    grant_type: 'authorization_code', client_id: 'client-id', client_secret: 'private-secret', code: 'one-time-code',
  })
  assert.deepEqual(result, { accessToken: 'access', refreshToken: 'refresh', expiresAt: 14_402_000 })
})

test('refresh uses the current refresh token and returns rotated access and refresh credentials', async () => {
  let request
  const result = await refreshRingAccessToken('current-refresh', {
    clientId: 'client-id', clientSecret: 'private-secret', now: 3000,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 14400 })
    },
  })
  assert.equal(request.url, 'https://oauth.ring.com/oauth/token')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.options.body)), {
    grant_type: 'refresh_token', refresh_token: 'current-refresh', client_id: 'client-id', client_secret: 'private-secret',
  })
  assert.deepEqual(result, { accessToken: 'rotated-access', refreshToken: 'rotated-refresh', expiresAt: 14_403_000 })
})

test('Ring token exchange errors expose status only and never upstream token material', async () => {
  await assert.rejects(
    exchangeRingAuthorizationCode('code', {
      clientId: 'client-id', clientSecret: 'secret',
      fetchImpl: async () => new Response('access_token=do-not-leak', { status: 401 }),
    }),
    (error) => error.message === 'Ring authorization-code exchange failed with status 401' && !error.message.includes('do-not-leak'),
  )
})
