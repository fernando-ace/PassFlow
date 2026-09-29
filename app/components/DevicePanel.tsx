import type { RingDevice, RingDeviceStatus } from '@/app/types/ring'
import { CameraIcon } from './icons'

interface DevicePanelProps {
  devices: RingDevice[]
  device: RingDevice | null
  status: RingDeviceStatus
  onSelect: (id: string) => void
}

export function DevicePanel({ devices, device, status, onSelect }: DevicePanelProps) {
  const statusLabel = status === 'loading'
    ? 'Discovering device'
    : status === 'empty'
      ? 'No cameras found'
      : device?.online
        ? 'Online'
        : status === 'ready'
          ? 'Offline'
          : 'Unavailable'

  return (
    <section aria-labelledby="ring-device-heading" className="border-b border-passflow-border pb-8">
      <h2 id="ring-device-heading" className="section-label">Ring device</h2>
      <div className="mt-5 flex items-start gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-passflow-soft text-passflow-muted">
          <CameraIcon className="size-7" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-base font-semibold text-passflow-ink">
            {device?.name || (status === 'loading' ? 'Finding your camera' : 'Ring camera')}
          </p>
          {device?.id ? (
            <p className="mt-1 break-all text-xs text-passflow-faint">Device ID: {device.id}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-2 text-sm font-medium">
            <span
              className={`size-2 rounded-full ${
                status === 'loading'
                  ? 'animate-pulse bg-passflow-warning'
                  : device?.online
                    ? 'bg-passflow-success'
                    : 'bg-passflow-faint'
              }`}
            />
            <span className={device?.online ? 'text-passflow-success' : 'text-passflow-muted'}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
      {devices.length > 1 ? (
        <label className="mt-5 block">
          <span className="form-label">Camera</span>
          <select aria-label="Select Ring camera" className="form-control" value={device?.id ?? ''} onChange={(event) => onSelect(event.target.value)}>
            {devices.map((item) => <option key={item.id} value={item.id}>{item.name}{item.online ? '' : ' (offline)'}</option>)}
          </select>
        </label>
      ) : null}
    </section>
  )
}
