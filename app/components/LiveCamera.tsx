'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RingDeviceStatus } from '@/app/types/ring'
import { verifyQrCredential } from '@/lib/credentials/verifyQrCredential'
import type { VerificationResult } from '@/lib/credentials/types'
import { useCanvasOverlay } from '@/app/hooks/useCanvasOverlay'
import { useWebRTCStream } from '@/app/hooks/useWebRTCStream'
import {
  ensureQrCredentialProcessorRegistered,
  getQrCredentialProcessor,
  QR_CREDENTIAL_PROCESSOR_ID,
} from '@/lib/video-processors/qrCredentialProcessor'
import { useVideoProcessing } from '@/lib/video-processors/useVideoProcessing'
import {
  ensurePersonDetectionProcessorRegistered,
  getPersonDetectionProcessor,
  PERSON_DETECTION_PROCESSOR_ID,
  type PersonDetectorStatus,
} from '@/lib/video-processors/personDetectionProcessor'
import type { ProcessorResult } from '@/lib/video-processors/types'
import type { DetectionEvent } from '@/lib/types/events'
import { CalibrationPanel, type CalibrationSettings } from './CalibrationPanel'
import { ApertureIcon, PlayIcon, StopIcon } from './icons'

const NO_EVENTS: DetectionEvent[] = []
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const DEFAULT_CALIBRATION: CalibrationSettings = {
  boundaryPositionRatio: 0.62,
  enteringDirection: 'positive',
  neutralZoneWidthRatio: 0.07,
  minimumConfidence: 0.55,
  qrSamplingFps: 2,
  samplingFps: 2,
  entryWindowSeconds: 12,
}

interface LiveCameraProps {
  deviceId?: string
  deviceStatus: RingDeviceStatus
  deviceError: string | null
  onCredentialChecking: () => void
  onCredentialVerified: (result: VerificationResult) => void
  onPeopleResult: (result: ProcessorResult) => void
  onReset: () => void
  onEntryWindowDurationChange: (durationMs: number) => void
}

export function LiveCamera({
  deviceId,
  deviceStatus,
  deviceError,
  onCredentialChecking,
  onCredentialVerified,
  onPeopleResult,
  onReset,
  onEntryWindowDurationChange,
}: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const [qrDetected, setQrDetected] = useState(false)
  const [calibrationEnabled, setCalibrationEnabled] = useState(false)
  const [calibration, setCalibration] = useState(DEFAULT_CALIBRATION)
  const [visionState, setVisionState] = useState<{ status: PersonDetectorStatus; error: string | null }>({
    status: 'idle',
    error: null,
  })
  const lastResultIdRef = useRef<string | null>(null)
  const lastPeopleResultIdRef = useRef<string | null>(null)
  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])
  const attachCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node
    setCanvasElement(node)
  }, [])

  useEffect(() => {
    ensureQrCredentialProcessorRegistered()
    ensurePersonDetectionProcessorRegistered()
    const personProcessor = getPersonDetectionProcessor()
    if (!personProcessor) return
    const updateStatus = () => setVisionState(personProcessor.getStatus())
    updateStatus()
    const unsubscribe = personProcessor.subscribeStatus(updateStatus)
    void personProcessor.init().catch(() => {
      // The visible status provides retry guidance; the Ring stream remains usable.
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    getPersonDetectionProcessor()?.configure(calibration)
    getQrCredentialProcessor()?.configureSamplingRate(calibration.qrSamplingFps)
    onEntryWindowDurationChange(calibration.entryWindowSeconds * 1_000)
  }, [calibration, onEntryWindowDurationChange])

  const { streamActive, streamStarting, streamError, startStream, stopStream } = useWebRTCStream({
    videoRef,
    deviceId,
  })
  const { results } = useVideoProcessing({
    video: videoElement,
    canvas: canvasElement,
    enabled: streamActive,
    fps: Math.max(calibration.qrSamplingFps, calibration.samplingFps),
  })
  useCanvasOverlay({
    videoRef,
    canvasRef,
    events: NO_EVENTS,
    results,
    showDebug: IS_DEVELOPMENT && calibrationEnabled,
  })
  const credentialResult = results.get(QR_CREDENTIAL_PROCESSOR_ID)
  const credentialResultId = credentialResult?.id
  const credentialToken = credentialResult?.data?.token
  const peopleResult = results.get(PERSON_DETECTION_PROCESSOR_ID)
  const peopleDetected = typeof peopleResult?.data?.peopleDetected === 'number'
    ? peopleResult.data.peopleDetected
    : 0
  const inferenceMs = typeof peopleResult?.data?.inferenceMs === 'number'
    ? peopleResult.data.inferenceMs
    : null
  const crossings = Array.isArray(peopleResult?.data?.crossings) ? peopleResult.data.crossings : []
  const lastCrossingTrackIds = crossings.flatMap((crossing) => (
    typeof crossing === 'object' && crossing !== null && typeof crossing.trackId === 'number'
      ? [crossing.trackId]
      : []
  ))

  useEffect(() => {
    if (!peopleResult || peopleResult.id === lastPeopleResultIdRef.current) return
    lastPeopleResultIdRef.current = peopleResult.id
    onPeopleResult(peopleResult)
  }, [onPeopleResult, peopleResult])

  useEffect(() => {
    if (
      !credentialResultId
      || credentialResultId === lastResultIdRef.current
      || typeof credentialToken !== 'string'
    ) return

    lastResultIdRef.current = credentialResultId
    setQrDetected(true)
    const indicatorTimer = window.setTimeout(() => setQrDetected(false), 1800)
    const controller = new AbortController()

    onCredentialChecking()
    void verifyQrCredential(credentialToken, controller.signal)
      .then((verification) => {
        if (!controller.signal.aborted) {
          onCredentialVerified(verification)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          onCredentialVerified({
              valid: false,
              status: 'malformed',
              message: error instanceof Error
                ? error.message
                : 'PassFlow could not verify this credential. Try again.',
          })
        }
      })

    return () => {
      controller.abort()
      window.clearTimeout(indicatorTimer)
    }
  }, [credentialResultId, credentialToken, onCredentialChecking, onCredentialVerified])

  const unavailable = deviceStatus !== 'ready' || !deviceId
  const error = streamError || deviceError
  const handleStartStream = useCallback(() => {
    onReset()
    startStream()
  }, [onReset, startStream])
  const handleStopStream = useCallback(() => {
    stopStream()
    onReset()
  }, [onReset, stopStream])

  return (
    <section aria-labelledby="live-camera-heading" className="min-w-0">
      <h1 id="live-camera-heading" className="text-3xl font-semibold tracking-tight text-passflow-ink sm:text-4xl">
        Live camera
      </h1>
      <p className="mt-3 text-base text-passflow-muted">
        Connect to your Ring device to view the live feed.
      </p>

      <div className="relative mt-7 aspect-video overflow-hidden rounded-xl bg-passflow-video text-white ring-1 ring-black/10">
        <video
          ref={attachVideoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live video from the selected Ring device"
          className="h-full w-full object-contain"
        />
        <canvas ref={attachCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

        {!streamActive ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <ApertureIcon className={`mx-auto size-16 text-white/30 ${streamStarting ? 'animate-spin' : ''}`} />
              <p className="mt-5 text-lg font-semibold text-white">
                {streamStarting ? 'Connecting to live view' : 'Live view is off'}
              </p>
              <p className="mt-2 text-sm text-white/60">
                {streamStarting
                  ? 'PassFlow is negotiating a secure Ring video session.'
                  : 'Start live view when you are ready to connect.'}
              </p>
            </div>
          </div>
        ) : null}

        {streamActive ? (
          <span className="absolute left-4 top-4 flex items-center gap-2 rounded-md bg-black/70 px-3 py-2 text-xs font-semibold">
            <span className="size-2 rounded-full bg-passflow-success" />
            Live
          </span>
        ) : null}

        <span className={`absolute bottom-4 left-4 hidden rounded-md bg-black/70 px-3 py-2 text-xs font-semibold sm:inline-flex ${
          visionState.status === 'ready'
            ? 'text-emerald-300'
            : visionState.status === 'error'
              ? 'text-red-300'
              : 'text-white'
        }`}>
          {visionState.status === 'ready'
            ? 'Vision ready'
            : visionState.status === 'error'
              ? 'Vision unavailable'
              : 'Loading vision model'}
        </span>

        {streamActive && qrDetected ? (
          <span className="absolute right-4 top-4 rounded-md bg-passflow-success px-3 py-2 text-xs font-semibold text-white shadow-sm">
            Credential detected
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className={`inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold sm:hidden ${
          visionState.status === 'ready'
            ? 'bg-passflow-success/10 text-passflow-success'
            : visionState.status === 'error'
              ? 'bg-passflow-danger/10 text-passflow-danger'
              : 'bg-passflow-soft text-passflow-muted'
        }`}>
          {visionState.status === 'ready'
            ? 'Vision ready'
            : visionState.status === 'error'
              ? 'Vision unavailable'
              : 'Loading vision model'}
        </span>
        {!streamActive ? (
          <button
            type="button"
            onClick={handleStartStream}
            disabled={unavailable || streamStarting}
            className="control-button control-button-primary"
          >
            <PlayIcon className="size-5" />
            {streamStarting
              ? 'Starting Live View…'
              : deviceStatus === 'loading'
                ? 'Discovering device…'
                : 'Start Live View'}
          </button>
        ) : (
          <button type="button" onClick={handleStopStream} className="control-button control-button-secondary">
            <StopIcon className="size-5" />
            Stop Live View
          </button>
        )}
        {visionState.status === 'error' ? (
          <button
            type="button"
            className="control-button control-button-secondary"
            onClick={() => void getPersonDetectionProcessor()?.init().catch(() => {})}
          >
            Retry vision model
          </button>
        ) : null}
        {IS_DEVELOPMENT ? (
          <button
            type="button"
            aria-expanded={calibrationEnabled}
            className="control-button control-button-secondary"
            onClick={() => setCalibrationEnabled((enabled) => !enabled)}
          >
            {calibrationEnabled ? 'Hide calibration' : 'Calibrate Ring feed'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mt-4 max-w-3xl rounded-lg border border-passflow-danger/25 bg-passflow-danger/5 px-4 py-3 text-sm leading-6 text-passflow-danger">
          {error}
        </div>
      ) : (
        <p className="mt-4 text-sm text-passflow-faint">
          The live session connects directly through PassFlow’s server-side Ring integration.
        </p>
      )}

      {visionState.status === 'error' ? (
        <div role="alert" className="mt-4 max-w-3xl rounded-lg border border-passflow-danger/25 bg-passflow-danger/5 px-4 py-3 text-sm leading-6 text-passflow-danger">
          Vision model failed to load{visionState.error ? `: ${visionState.error}` : '.'} QR scanning and the Ring stream remain available. Retry when the connection is stable.
        </div>
      ) : null}

      {IS_DEVELOPMENT && calibrationEnabled ? (
        <CalibrationPanel
          settings={calibration}
          onChange={setCalibration}
          peopleDetected={peopleDetected}
          inferenceMs={inferenceMs}
          lastCrossingTrackIds={lastCrossingTrackIds}
        />
      ) : null}
    </section>
  )
}
