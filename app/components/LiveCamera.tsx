'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccessDecisionState } from '@/app/types/access'
import type { RingDeviceStatus } from '@/app/types/ring'
import { verifyQrCredential } from '@/lib/credentials/verifyQrCredential'
import { useCanvasOverlay } from '@/app/hooks/useCanvasOverlay'
import { useWebRTCStream } from '@/app/hooks/useWebRTCStream'
import {
  ensureQrCredentialProcessorRegistered,
  QR_CREDENTIAL_PROCESSOR_ID,
} from '@/lib/video-processors/qrCredentialProcessor'
import { useVideoProcessing } from '@/lib/video-processors/useVideoProcessing'
import type { DetectionEvent } from '@/lib/types/events'
import { ApertureIcon, PlayIcon, StopIcon } from './icons'

const NO_EVENTS: DetectionEvent[] = []

interface LiveCameraProps {
  deviceId?: string
  deviceStatus: RingDeviceStatus
  deviceError: string | null
  onDecisionChange: (decision: AccessDecisionState) => void
}

export function LiveCamera({ deviceId, deviceStatus, deviceError, onDecisionChange }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const [qrDetected, setQrDetected] = useState(false)
  const lastResultIdRef = useRef<string | null>(null)
  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])
  const attachCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node
    setCanvasElement(node)
  }, [])

  useEffect(() => ensureQrCredentialProcessorRegistered(), [])

  const { streamActive, streamStarting, streamError, startStream, stopStream } = useWebRTCStream({
    videoRef,
    deviceId,
  })
  const { results } = useVideoProcessing({
    video: videoElement,
    canvas: canvasElement,
    enabled: streamActive,
    fps: 2,
  })
  useCanvasOverlay({ videoRef, canvasRef, events: NO_EVENTS, results })
  const credentialResult = results.get(QR_CREDENTIAL_PROCESSOR_ID)
  const credentialResultId = credentialResult?.id
  const credentialToken = credentialResult?.data?.token

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

    onDecisionChange({ state: 'checking' })
    void verifyQrCredential(credentialToken, controller.signal)
      .then((verification) => {
        if (!controller.signal.aborted) {
          onDecisionChange({ state: 'result', result: verification })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          onDecisionChange({
            state: 'result',
            result: {
              valid: false,
              status: 'malformed',
              message: error instanceof Error
                ? error.message
                : 'PassFlow could not verify this credential. Try again.',
            },
          })
        }
      })

    return () => {
      controller.abort()
      window.clearTimeout(indicatorTimer)
    }
  }, [credentialResultId, credentialToken, onDecisionChange])

  const unavailable = deviceStatus !== 'ready' || !deviceId
  const error = streamError || deviceError

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

        {streamActive && qrDetected ? (
          <span className="absolute right-4 top-4 rounded-md bg-passflow-success px-3 py-2 text-xs font-semibold text-white shadow-sm">
            Credential detected
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!streamActive ? (
          <button
            type="button"
            onClick={startStream}
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
          <button type="button" onClick={stopStream} className="control-button control-button-secondary">
            <StopIcon className="size-5" />
            Stop Live View
          </button>
        )}
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
    </section>
  )
}
