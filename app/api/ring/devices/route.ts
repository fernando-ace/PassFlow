import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const DEVICE_ID = process.env.RING_DEVICE_ID
const DEVICE_NAME = process.env.RING_DEVICE_NAME || 'Ring camera'
const API_BASE = 'https://api.amazonvision.com'

interface RingApiDevice {
  id: string
  attributes?: {
    name?: string
    description?: string
    online?: boolean
    capabilities?: Record<string, unknown>
  }
}

function getDiscoveryError(status: number) {
  if (status === 401 || status === 403) {
    return 'Ring rejected the access token. Generate a fresh Playground token, update .env.local, and restart PassFlow.'
  }

  return `Ring device discovery failed with status ${status}.`
}

async function getDeviceOnline(token: string, deviceId: string) {
  const response = await fetch(`${API_BASE}/v1/devices/${deviceId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!response.ok) return undefined
  const data = await response.json()
  const online = data?.data?.attributes?.online
  return typeof online === 'boolean' ? online : undefined
}

export async function GET() {
  try {
    const token = await getAccessToken()

    // In access token mode, always auto-discover (ignore configured device ID).
    const isAccessTokenMode = !!process.env.RING_ACCESS_TOKEN
    const useConfiguredDevice = DEVICE_ID && !isAccessTokenMode

    // If device ID is configured (refresh token mode only), use it directly
    if (useConfiguredDevice) {
      const statusRes = await fetch(`${API_BASE}/v1/devices/${DEVICE_ID}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      let online = false
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        online = statusData?.data?.attributes?.online || false
      }

      return NextResponse.json({
        devices: [{
          id: DEVICE_ID,
          name: DEVICE_NAME,
          online,
          capabilities: { motionDetection: true },
        }],
      })
    }

    // Auto-discover devices using the token
    const res = await fetch(`${API_BASE}/v1/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const error = await res.text()
      return NextResponse.json(
        { devices: [], error: `${getDiscoveryError(res.status)} ${error}`.trim() },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Normalize JSON:API response to simple device list
    const devices = await Promise.all((data?.data || []).map(async (device: RingApiDevice) => {
      // Ring Private App device listings may omit `online`; ask the status endpoint.
      const statusOnline = await getDeviceOnline(token, device.id)
      return {
        id: device.id,
        name: device.attributes?.name || device.attributes?.description || 'Ring Device',
        online: statusOnline ?? (typeof device.attributes?.online === 'boolean' ? device.attributes.online : false),
        capabilities: device.attributes?.capabilities || {},
      }
    }))

    return NextResponse.json({ devices })
  } catch (error) {
    console.error('Devices error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch devices', devices: [] },
      { status: 500 }
    )
  }
}
