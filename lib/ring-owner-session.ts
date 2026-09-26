import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export const RING_OWNER_COOKIE = 'passflow_ring_owner'
export const RING_LINK_RESULT_COOKIE = 'passflow_ring_link_result'
const SESSION_SECONDS = 30 * 60
const RESULT_SECONDS = 2 * 60
const RESULT_STATUSES = new Set([
  'success', 'sign-in-failed', 'sign-in-required', 'unavailable', 'invalid-request',
  'invalid-or-expired', 'already-used', 'ring-rejected', 'completion-pending', 'failure',
])

function hmacKey() {
  const key = process.env.RING_HMAC_KEY
  if (!key) throw new Error('RING_HMAC_KEY is not configured')
  return key
}

function signature(payload: string) {
  return createHmac('sha256', hmacKey()).update(payload).digest('base64url')
}

export function createOwnerSession(email: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function verifyOwnerSession(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null
  const [payload, receivedSignature, extra] = value.split('.')
  if (!payload || !receivedSignature || extra !== undefined) return null
  const expected = Buffer.from(signature(payload))
  const supplied = Buffer.from(receivedSignature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof session.email !== 'string' || !Number.isSafeInteger(session.exp) || session.exp <= Math.floor(now / 1000)) return null
    return session.email
  } catch {
    return null
  }
}

export type RingLinkResultStatus =
  | 'success' | 'sign-in-failed' | 'sign-in-required' | 'unavailable' | 'invalid-request'
  | 'invalid-or-expired' | 'already-used' | 'ring-rejected' | 'completion-pending' | 'failure'

export function createRingLinkResult(status: RingLinkResultStatus, now = Date.now()) {
  if (!RESULT_STATUSES.has(status)) throw new Error('Invalid Ring link result status')
  const payload = Buffer.from(JSON.stringify({ status, exp: Math.floor(now / 1000) + RESULT_SECONDS })).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function verifyRingLinkResult(value: string | undefined, now = Date.now()): RingLinkResultStatus | null {
  if (!value) return null
  const [payload, receivedSignature, extra] = value.split('.')
  if (!payload || !receivedSignature || extra !== undefined) return null
  const expected = Buffer.from(signature(payload))
  const supplied = Buffer.from(receivedSignature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const result = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!RESULT_STATUSES.has(result.status) || !Number.isSafeInteger(result.exp) || result.exp <= Math.floor(now / 1000)) return null
    return result.status as RingLinkResultStatus
  } catch {
    return null
  }
}

export function getOwnerSession(request: NextRequest) {
  return verifyOwnerSession(request.cookies.get(RING_OWNER_COOKIE)?.value)
}

export function ownerCredentialsConfigured() {
  return !!(process.env.RING_LINK_OWNER_EMAIL && process.env.RING_LINK_OWNER_PASSWORD && process.env.RING_HMAC_KEY)
}

export function verifyOwnerCredentials(email: string, password: string) {
  const expectedEmail = process.env.RING_LINK_OWNER_EMAIL
  const expectedPassword = process.env.RING_LINK_OWNER_PASSWORD
  if (!expectedEmail || !expectedPassword || !process.env.RING_HMAC_KEY) return false
  const equal = (left: string, right: string) => {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  return equal(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase()) && equal(password, expectedPassword)
}

export function maskRingAccountIdentifier(email: string) {
  const [local, domain, ...extra] = email.split('@')
  if (!local || !domain || extra.length) throw new Error('Owner email must be a valid email address')
  const localMask = local.length < 2 ? `${local[0]}***` : `${local[0]}***${local.at(-1)}`
  return `${localMask}@${domain}`
}
