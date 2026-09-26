import { NextRequest, NextResponse } from 'next/server'
import {
  createOwnerSession,
  createRingLinkResult,
  ownerCredentialsConfigured,
  RING_LINK_RESULT_COOKIE,
  RING_OWNER_COOKIE,
  verifyOwnerCredentials,
} from '@/lib/ring-owner-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  return origin === request.nextUrl.origin
}

function resultResponse(request: NextRequest, status: Parameters<typeof createRingLinkResult>[0]) {
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

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  if (!ownerCredentialsConfigured()) return resultResponse(request, 'unavailable')
  try {
    const form = await request.formData()
    const email = form.get('email')
    const password = form.get('password')
    const nonce = form.get('nonce')
    const time = form.get('time')
    if (typeof email !== 'string' || email.length > 320 || typeof password !== 'string' || password.length > 1024 ||
        typeof nonce !== 'string' || nonce.length > 128 || typeof time !== 'string' || time.length > 20 ||
        !verifyOwnerCredentials(email, password)) {
      return resultResponse(request, 'sign-in-failed')
    }
    const response = NextResponse.redirect(new URL(`/ring/link?${new URLSearchParams({ nonce, time })}`, request.url), 303)
    response.cookies.set(RING_OWNER_COOKIE, createOwnerSession(process.env.RING_LINK_OWNER_EMAIL!.trim().toLowerCase()), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return resultResponse(request, 'sign-in-failed')
  }
}
