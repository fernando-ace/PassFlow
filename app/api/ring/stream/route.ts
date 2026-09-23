import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const API_BASE = 'https://api.amazonvision.com'

function isTrustedRingSessionUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'api.amazonvision.com'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sdpOffer, deviceId } = await request.json()

    if (!sdpOffer) {
      return NextResponse.json({ error: 'Missing sdpOffer' }, { status: 400 })
    }

    // Use deviceId from request body, fall back to env var
    const resolvedDeviceId = deviceId || process.env.RING_DEVICE_ID
    if (!resolvedDeviceId) {
      return NextResponse.json(
        { error: 'No device ID provided. Pass deviceId in the request body or set RING_DEVICE_ID.' },
        { status: 400 }
      )
    }

    const token = await getAccessToken()
    const whepUrl = `${API_BASE}/v1/devices/${resolvedDeviceId}/media/streaming/whep/sessions`

    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    })

    if (!response.ok) {
      const error = await response.text()
      const message = response.status === 401 || response.status === 403
        ? 'Ring rejected the access token. Generate a fresh Playground token, update .env.local, and restart PassFlow.'
        : `Ring live view failed with status ${response.status}.`
      return NextResponse.json(
        { error: `${message} ${error}`.trim() },
        { status: response.status }
      )
    }

    const sdpAnswer = await response.text()
    const sessionUrl = response.headers.get('Location')

    return NextResponse.json({ sdpAnswer, sessionUrl })
  } catch (error) {
    console.error('Stream error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stream failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { sessionUrl } = await request.json()
    if (!sessionUrl) {
      return NextResponse.json({ error: 'Missing sessionUrl' }, { status: 400 })
    }

    if (!isTrustedRingSessionUrl(sessionUrl)) {
      return NextResponse.json({ error: 'Invalid Ring session URL' }, { status: 400 })
    }

    const token = await getAccessToken()
    await fetch(sessionUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to close session' }, { status: 500 })
  }
}
