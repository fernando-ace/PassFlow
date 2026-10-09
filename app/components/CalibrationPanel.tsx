import type { PersonCalibrationConfig } from '@/lib/video-processors/personDetectionProcessor'

export interface CalibrationSettings extends PersonCalibrationConfig {
  qrSamplingFps: number
  entryWindowSeconds: number
}

interface CalibrationPanelProps {
  settings: CalibrationSettings
  onChange: (settings: CalibrationSettings) => void
  peopleDetected: number
  inferenceMs: number | null
  lastCrossingTrackIds: number[]
}

interface NumberControlProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}

function NumberControl({ label, value, min, max, step, suffix, onChange }: NumberControlProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-passflow-ink">
        {label}
        <span className="font-mono text-passflow-muted">{value}{suffix}</span>
      </span>
      <input
        className="mt-1 min-h-11 w-full touch-pan-x accent-passflow-accent sm:mt-2"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function CalibrationPanel({ settings, onChange, peopleDetected, inferenceMs, lastCrossingTrackIds }: CalibrationPanelProps) {
  const update = <Key extends keyof CalibrationSettings,>(key: Key, value: CalibrationSettings[Key]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <section id="calibration-panel" aria-labelledby="calibration-heading" className="mt-5 rounded-xl border border-passflow-warning/30 bg-passflow-warning/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-passflow-warning">Live calibration</p>
          <h2 id="calibration-heading" className="mt-1 text-lg font-semibold text-passflow-ink">Ring feed calibration</h2>
        </div>
        <p className="text-xs text-passflow-muted">
          {peopleDetected} people · {inferenceMs === null ? 'No inference yet' : `${inferenceMs} ms inference`}
        </p>
      </div>

      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-passflow-ink">Entrance detection mode</span>
          <select
            aria-label="Entrance detection mode"
            className="form-control mt-2 min-h-12"
            value={settings.entranceMode}
            onChange={(event) => update('entranceMode', event.target.value as 'boundary' | 'doorbell')}
          >
            <option value="boundary">Boundary crossing</option>
            <option value="doorbell">Doorbell close approach</option>
          </select>
        </label>
        {settings.entranceMode === 'boundary' ? <>
          <NumberControl label="Entrance boundary" value={Math.round(settings.boundaryPositionRatio * 100)} min={10} max={90} step={1} suffix="%" onChange={(value) => update('boundaryPositionRatio', value / 100)} />
          <label className="block">
            <span className="text-xs font-semibold text-passflow-ink">Crossing direction</span>
            <select className="form-control mt-2 min-h-10" value={settings.enteringDirection} onChange={(event) => update('enteringDirection', event.target.value as 'positive' | 'negative')}>
              <option value="positive">Toward lower/right side</option>
              <option value="negative">Toward upper/left side</option>
            </select>
          </label>
          <NumberControl label="Neutral-zone width" value={Math.round(settings.neutralZoneWidthRatio * 100)} min={0} max={20} step={1} suffix="%" onChange={(value) => update('neutralZoneWidthRatio', value / 100)} />
        </> : <>
          <NumberControl
            label="Near-camera size threshold"
            value={Math.round(settings.doorbellNearCameraHeightRatio * 100)}
            min={30}
            max={90}
            step={5}
            suffix="% frame height"
            onChange={(value) => update('doorbellNearCameraHeightRatio', value / 100)}
          />
          <p className="text-xs leading-5 text-passflow-muted sm:col-span-2">
            A person is counted after reaching this size and then staying out of view until their track expires. This infers entry; it cannot confirm that someone crossed a physical doorway.
          </p>
        </>}
        <NumberControl label="Person confidence" value={Math.round(settings.minimumConfidence * 100)} min={20} max={95} step={5} suffix="%" onChange={(value) => update('minimumConfidence', value / 100)} />
        <NumberControl label="QR sampling rate" value={settings.qrSamplingFps} min={1} max={10} step={1} suffix=" FPS" onChange={(value) => update('qrSamplingFps', value)} />
        <NumberControl label="Person sampling rate" value={settings.samplingFps} min={1} max={10} step={1} suffix=" FPS" onChange={(value) => update('samplingFps', value)} />
        <NumberControl label="Credential entry window" value={settings.entryWindowSeconds} min={5} max={30} step={1} suffix="s" onChange={(value) => update('entryWindowSeconds', value)} />
      </div>

      <div className="mt-5 border-t border-passflow-warning/20 pt-4 text-xs leading-5 text-passflow-muted">
        <p>{settings.entranceMode === 'boundary'
          ? 'Boundary line, neutral-zone edges, person boxes, and track IDs are visible on the feed.'
          : 'Near-camera person boxes and track IDs are highlighted on the feed.'}</p>
        <p className="mt-1 font-semibold text-passflow-ink">
          {lastCrossingTrackIds.length
            ? `Entry event: track ${lastCrossingTrackIds.map((id) => `#${id}`).join(', ')}`
            : 'Entry event: none yet'}
        </p>
      </div>
    </section>
  )
}
