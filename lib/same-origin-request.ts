import type { NextRequest } from 'next/server'

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  let parsedOrigin: URL
  try {
    parsedOrigin = new URL(origin)
  } catch {
    return false
  }
  if (parsedOrigin.origin !== origin) return false

  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
  const host = forwardedHost ?? request.headers.get('host')
  // Vercel may terminate TLS before the app request, so use HTTPS in production
  // and compare the browser origin's host with the forwarded public host.
  const expectedProtocol = process.env.NODE_ENV === 'production' ? 'https:' : request.nextUrl.protocol
  if (!host || parsedOrigin.protocol !== expectedProtocol) return false

  try {
    const requestHost = new URL(`${parsedOrigin.protocol}//${host}`)
    if (requestHost.username || requestHost.password || requestHost.pathname !== '/' || requestHost.search || requestHost.hash) {
      return false
    }
    return parsedOrigin.host === requestHost.host
  } catch {
    return false
  }
}
