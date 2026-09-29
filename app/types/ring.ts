export interface RingDevice {
  id: string
  name: string
  online: boolean
  capabilities: Record<string, unknown>
}

export type RingDeviceStatus = 'loading' | 'ready' | 'empty' | 'error'
