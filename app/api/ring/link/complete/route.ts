import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { validateRingLink } from '@/lib/ring-auth-core.mjs'
import { claimRingCredential, listUnclaimedRingCredentials, setRingCredentialLinkState } from '@/lib/ring-store'
import {
  createRingLinkResult,
  getOwnerSession,
  maskRingAccountIdentifier,
  RING_LINK_RESULT_COOKIE,
} from '@/lib/ring-owner-session'
import { decryptRingToken } from '@/lib/ring-auth-core.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  return origin === request.nextUrl.origin
}

async function callRing(path: string, method: 'POST' | 'PATCH', accessToken: string, payload: Record<string, string>) {
  return fetch(`https://api.amazonvision.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
}

export async function POST(request: NextRequest) {
  const result = (status: Parameters<typeof createRingLinkResult>[0]) => {
    const response = NextResponse.redirect(new URL('/ring/link/result', request.url), 303)
    if (process.env.RING_HMAC_KEY) {
      response.cookies.set(RING_LINK_RESULT_COOKIE, createRingLinkResult(status), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/ring/link/result',
        maxAge: 120,
      })
    }
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  const ownerEmail = getOwnerSession(request)
  if (!ownerEmail) return result('sign-in-required')

  try {
    const form = await request.formData()
    const nonce = form.get('nonce')
    const time = form.get('time')
    if (typeof nonce !== 'string' || typeof time !== 'string') return result('invalid-request')
    const hmacKey = process.env.RING_HMAC_KEY
    const encryptionKey = process.env.RING_TOKEN_ENCRYPTION_KEY
    if (!hmacKey || !encryptionKey) throw new Error('Ring link secrets are not configured')

    const candidates = await listUnclaimedRingCredentials()
    const match = candidates.find((candidate) => validateRingLink(time, nonce, candidate.accountId, hmacKey))
    if (!match) return result('invalid-or-expired')

    const accountIdentifier = maskRingAccountIdentifier(ownerEmail)
    const claimed = await claimRingCredential({
      accountId: match.accountId,
      partnerIdentifier: accountIdentifier,
      nonceDigest: createHash('sha256').update(nonce).digest('hex'),
      nonceTimeMs: time,
    })
    if (!claimed) return result('already-used')

    const accessToken = decryptRingToken(claimed.accessTokenCiphertext, encryptionKey)
    const path = '/v1/accounts/me/app-integrations'
    const confirmation = await callRing(path, 'POST', accessToken, { account_identifier: accountIdentifier, nonce })
    if (!confirmation.ok) {
      await setRingCredentialLinkState(match.accountId, 'unclaimed')
      console.error('[RING_ACCOUNT_LINK]', { stage: 'nonce_confirmation', status: confirmation.status })
      return result('ring-rejected')
    }
    await setRingCredentialLinkState(match.accountId, 'awaiting')

    const completion = await callRing(path, 'PATCH', accessToken, { status: 'completed' })
    if (!completion.ok) {
      console.error('[RING_ACCOUNT_LINK]', { stage: 'integration_completion', status: completion.status })
      return result('completion-pending')
    }
    await setRingCredentialLinkState(match.accountId, 'completed')
    return result('success')
  } catch (error) {
    console.error('[RING_ACCOUNT_LINK]', { stage: 'link_completion', message: error instanceof Error ? error.message : 'Unknown server error' })
    return result('failure')
  }
}
