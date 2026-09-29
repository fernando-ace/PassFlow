'use client'

import { useEffect, useState } from 'react'
import type { RingDevice, RingDeviceStatus } from '@/app/types/ring'
import { selectDefaultRingDevice } from '@/lib/ring/deviceSelection.mjs'

interface RingDeviceState {
  devices: RingDevice[]
  device: RingDevice | null
  status: RingDeviceStatus
  error: string | null
}

interface UseRingDeviceState extends RingDeviceState {
  selectDevice: (id: string) => void
}

const INITIAL_STATE: RingDeviceState = {
  devices: [],
  device: null,
  status: 'loading',
  error: null,
}

export function useRingDevice(): UseRingDeviceState {
  const [state, setState] = useState<RingDeviceState>(INITIAL_STATE)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

        const devices = Array.isArray(result.devices) ? result.devices as RingDevice[] : []
        setState({
          devices,
          device: selectDefaultRingDevice(devices, selectedId),
          status: devices.length ? 'ready' : 'empty',
          error: null,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setState({
          device: null,
          devices: [],
          status: 'error',
          error: error instanceof Error ? error.message : 'Ring device discovery failed.',
        })
      }
    }

    discoverDevice()
    return () => controller.abort()
  }, [selectedId])

  const selectDevice = (id: string) => {
    setSelectedId(id)
    setState((current) => ({ ...current, device: current.devices.find((item) => item.id === id) ?? null }))
  }

  return { ...state, selectDevice }
}
