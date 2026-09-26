import { NextRequest, NextResponse } from 'next/server'
import { encryptRingToken, exchangeRingAuthorizationCode } from '@/lib/ring-auth-core.mjs'
import { saveUnclaimedRingCredentials } from '@/lib/ring-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function readCode(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  const raw = await request.text()
  if (raw.length > 8192) throw new Error('Request body is too large')
  let value: unknown
  if (contentType === 'application/json') {
    const body = JSON.parse(raw)
    value = body?.code
  } else if (contentType === 'application/x-www-form-urlencoded') {
    value = new URLSearchParams(raw).get('code')
  } else {
    throw new Error('Expected a JSON or form-encoded authorization-code request')
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) throw new Error('A valid authorization code is required')
  return value
}

export async function POST(request: NextRequest) {
  let stage = 'request_validation'
  try {
    const code = await readCode(request)
    stage = 'token_exchange'
    const tokens = await exchangeRingAuthorizationCode(code, {
      clientId: process.env.RING_CLIENT_ID,
      clientSecret: process.env.RING_CLIENT_SECRET,
    })

    stage = 'account_lookup'
    const profileResponse = await fetch('https://api.amazonvision.com/v1/users/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: 'no-store',
    })
    if (!profileResponse.ok) throw new Error(`Ring account lookup failed with status ${profileResponse.status}`)
    const profile = await profileResponse.json()
    const accountId = profile?.data?.id
    if (typeof accountId !== 'string' || accountId.length === 0 || accountId.length > 256) {
      throw new Error('Ring account lookup returned an invalid account identifier')
    }

    stage = 'durable_store'
    const encryptionKey = process.env.RING_TOKEN_ENCRYPTION_KEY
    if (!encryptionKey) throw new Error('RING_TOKEN_ENCRYPTION_KEY is not configured')
    await saveUnclaimedRingCredentials({
      accountId,
      accessTokenCiphertext: encryptRingToken(tokens.accessToken, encryptionKey),
      refreshTokenCiphertext: encryptRingToken(tokens.refreshToken, encryptionKey),
      accessTokenExpiresAt: new Date(tokens.expiresAt),
    })
    return NextResponse.json({ status: 'accepted' })
  } catch (error) {
    console.error('[RING_TOKEN_EXCHANGE]', {
      stage,
      message: error instanceof Error ? error.message : 'Unknown server error',
    })
    return NextResponse.json({ error: 'Ring authorization could not be processed.' }, { status: 400 })
  }
}
