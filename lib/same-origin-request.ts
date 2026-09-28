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
  const protocol = firstHeaderValue(request.headers.get('x-forwarded-proto')) ?? request.nextUrl.protocol.slice(0, -1)
  if (!host || (protocol !== 'http' && protocol !== 'https')) return false

  try {
    const requestOrigin = new URL(`${protocol}://${host}`).origin
    return parsedOrigin.origin === requestOrigin
  } catch {
    return false
  }
}
