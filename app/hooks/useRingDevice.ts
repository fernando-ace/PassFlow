'use client'

import { useEffect, useState } from 'react'
import type { RingDevice, RingDeviceStatus } from '@/app/types/ring'

interface RingDeviceState {
  device: RingDevice | null
  status: RingDeviceStatus
  error: string | null
}

const INITIAL_STATE: RingDeviceState = {
  device: null,
  status: 'loading',
  error: null,
}

export function useRingDevice(): RingDeviceState {
  const [state, setState] = useState<RingDeviceState>(INITIAL_STATE)

  useEffect(() => {
    const controller = new AbortController()

    async function discoverDevice() {
      try {
        const configResponse = await fetch('/api/ring/config', {
          signal: controller.signal,
        })
        const config = await configResponse.json()

        if (!configResponse.ok) {
          throw new Error(config.error || 'Ring authentication is not configured.')
        }

        const devicesResponse = await fetch('/api/ring/devices', {
          signal: controller.signal,
        })
        const result = await devicesResponse.json()

        if (!devicesResponse.ok) {
          throw new Error(result.error || 'Ring device discovery failed.')
        }

        const device = result.devices?.[0] as RingDevice | undefined
        if (!device) {
          throw new Error('No Ring devices were found for this token.')
        }

        setState({ device, status: 'ready', error: null })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setState({
          device: null,
          status: 'error',
          error: error instanceof Error ? error.message : 'Ring device discovery failed.',
        })
      }
    }

    discoverDevice()
    return () => controller.abort()
  }, [])

  return state
}
