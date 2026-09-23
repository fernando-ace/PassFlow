'use client'

import Link from 'next/link'
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { AccessDecision } from '@/app/components/AccessDecision'
import { AppHeader } from '@/app/components/AppHeader'
import { useAccessDecision } from '@/app/hooks/useAccessDecision'
import { verifyQrCredential } from '@/lib/credentials/verifyQrCredential'
import type { VerificationResult } from '@/lib/credentials/types'
import type { DetectionEvent } from '@/lib/types/events'
import { useCanvasOverlay } from '@/app/hooks/useCanvasOverlay'
import {
  QR_CREDENTIAL_PROCESSOR_ID,
  QrCredentialProcessor,
} from '@/lib/video-processors/qrCredentialProcessor'
import { processorRegistry } from '@/lib/video-processors/registry'
import type { ProcessorResult } from '@/lib/video-processors/types'
import { useVideoProcessing } from '@/lib/video-processors/useVideoProcessing'

const NO_EVENTS: DetectionEvent[] = []

type CredentialScenario = 'valid' | 'expired' | 'not-yet-valid'

interface HarnessEvent {
  id: number
  source: string
  outcome: string
  detail: string
}

function iso(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString()
}

function imageDataFromUrl(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        reject(new Error('The browser could not prepare the image for QR decoding.'))
        return
      }
      context.drawImage(image, 0, 0)
      resolve(context.getImageData(0, 0, canvas.width, canvas.height))
    }
    image.onerror = () => reject(new Error('The selected QR image could not be read.'))
    image.src = url
  })
}

function statusLabel(result: VerificationResult) {
  if (result.status === 'valid') return 'VALID'
  if (result.status === 'expired') return 'EXPIRED'
  if (result.status === 'not-yet-valid') return 'NOT YET VALID'
  return 'INVALID'
}

export function DevQrHarness() {
  const [processor] = useState(() => new QrCredentialProcessor())
  const [scenario, setScenario] = useState<CredentialScenario>('valid')
  const [generatedQr, setGeneratedQr] = useState<string | null>(null)
  const [staticPreview, setStaticPreview] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoRunning, setVideoRunning] = useState(false)
  const { decision, credentialChecking, credentialVerified } = useAccessDecision()
  const [events, setEvents] = useState<HarnessEvent[]>([])
  const [busy, setBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [overlayElement, setOverlayElement] = useState<HTMLCanvasElement | null>(null)
  const lastVideoResultId = useRef<string | null>(null)
  const staticUrlRef = useRef<string | null>(null)
  const videoUrlRef = useRef<string | null>(null)
  const verificationControllerRef = useRef<AbortController | null>(null)

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])
  const attachOverlay = useCallback((node: HTMLCanvasElement | null) => {
    overlayRef.current = node
    setOverlayElement(node)
  }, [])

  useEffect(() => {
    processorRegistry.register(processor)
    return () => processorRegistry.unregister(processor.id)
  }, [processor])

  useEffect(() => () => {
    verificationControllerRef.current?.abort()
    if (staticUrlRef.current) URL.revokeObjectURL(staticUrlRef.current)
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
  }, [])

  const { results } = useVideoProcessing({
    video: videoElement,
    canvas: overlayElement,
    enabled: videoRunning,
    fps: 2,
  })
  useCanvasOverlay({ videoRef, canvasRef: overlayRef, events: NO_EVENTS, results })

  const record = useCallback((source: string, outcome: string, detail: string) => {
    setEvents((current) => [{ id: Date.now() + Math.random(), source, outcome, detail }, ...current].slice(0, 12))
  }, [])

  const verifyResult = useCallback(async (result: ProcessorResult, source: string) => {
    const value = result.data?.token
    if (typeof value !== 'string') return

    verificationControllerRef.current?.abort()
    const controller = new AbortController()
    verificationControllerRef.current = controller
    credentialChecking()
    try {
      const verification = await verifyQrCredential(value, controller.signal)
      if (controller.signal.aborted) return
      credentialVerified(verification)
      record(source, statusLabel(verification), verification.message)
    } catch (error) {
      if (controller.signal.aborted) return
      const failure: VerificationResult = {
        valid: false,
        status: 'malformed',
        message: error instanceof Error ? error.message : 'Credential verification failed.',
      }
      credentialVerified(failure)
      record(source, 'ERROR', failure.message)
    }
  }, [credentialChecking, credentialVerified, record])

  const scanImageUrl = useCallback(async (url: string, source: string) => {
    const frame = await imageDataFromUrl(url)
    const result = await processor.process(frame)
    if (!result) {
      record(source, 'SUPPRESSED / NO QR', 'No new QR decision was emitted.')
      return null
    }
    await verifyResult(result, source)
    return result
  }, [processor, record, verifyResult])

  const videoResult = results.get(QR_CREDENTIAL_PROCESSOR_ID)
  useEffect(() => {
    if (!videoResult || videoResult.id === lastVideoResultId.current) return
    lastVideoResultId.current = videoResult.id
    void verifyResult(videoResult, 'Prerecorded video')
  }, [videoResult, verifyResult])

  async function generatePass() {
    setBusy(true)
    try {
      const windows: Record<CredentialScenario, [string, string]> = {
        valid: [iso(-60_000), iso(10 * 60_000)],
        expired: [iso(-20 * 60_000), iso(-10 * 60_000)],
        'not-yet-valid': [iso(10 * 60_000), iso(20 * 60_000)],
      }
      const [validFrom, validUntil] = windows[scenario]
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: `Harness ${scenario} visitor`,
          location: 'Front door',
          validFrom,
          validUntil,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Pass generation failed.')
      const QRCode = await import('qrcode')
      const dataUrl = await QRCode.toDataURL(body.token, {
        errorCorrectionLevel: 'M',
        margin: 3,
        width: 420,
      })
      await processor.init()
      setGeneratedQr(dataUrl)
      record('Generated QR', 'READY', `${scenario} credential generated server-side.`)
    } catch (error) {
      record('Generated QR', 'ERROR', error instanceof Error ? error.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function scanGeneratedRepeatedly() {
    if (!generatedQr) return
    setBusy(true)
    try {
      await processor.init()
      await scanImageUrl(generatedQr, 'Generated QR · first scan')
      const repeated = await scanImageUrl(generatedQr, 'Generated QR · immediate repeat')
      if (repeated) {
        record('Generated QR · immediate repeat', 'UNEXPECTED', 'Duplicate was not suppressed.')
      }
    } catch (error) {
      record('Generated QR', 'ERROR', error instanceof Error ? error.message : 'Scan failed.')
    } finally {
      setBusy(false)
    }
  }

  async function scanNonPassFlow() {
    setBusy(true)
    try {
      const QRCode = await import('qrcode')
      const dataUrl = await QRCode.toDataURL('https://example.com/not-passflow', {
        margin: 3,
        width: 420,
      })
      await processor.init()
      setGeneratedQr(dataUrl)
      await scanImageUrl(dataUrl, 'Non-PassFlow QR')
    } catch (error) {
      record('Non-PassFlow QR', 'ERROR', error instanceof Error ? error.message : 'Scan failed.')
    } finally {
      setBusy(false)
    }
  }

  async function selectStaticImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (staticUrlRef.current) URL.revokeObjectURL(staticUrlRef.current)
    const url = URL.createObjectURL(file)
    staticUrlRef.current = url
    setStaticPreview(url)
    setBusy(true)
    try {
      await processor.init()
      await scanImageUrl(url, `Static image · ${file.name}`)
    } catch (error) {
      record('Static image', 'ERROR', error instanceof Error ? error.message : 'Image scan failed.')
    } finally {
      setBusy(false)
    }
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const url = URL.createObjectURL(file)
    videoUrlRef.current = url
    setVideoRunning(false)
    setVideoUrl(url)
    record('Prerecorded video', 'READY', `${file.name} loaded. Play it to sample at 2 FPS.`)
  }

  return (
    <div className="min-h-screen bg-passflow-soft">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        <div className="rounded-xl border border-passflow-warning/30 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-passflow-warning">Development only</p>
          <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-passflow-ink">QR pipeline test harness</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-passflow-muted">
                Exercises the same decoder, duplicate guard, and server verification used by Ring video. It does not simulate, replace, or verify the Ring camera path.
              </p>
            </div>
            <Link href="/" className="text-sm font-semibold text-passflow-accent hover:text-passflow-accent-hover">Back to PassFlow</Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
          <div className="space-y-6">
            <section className="rounded-xl border border-passflow-border bg-white p-6" aria-labelledby="generated-heading">
              <h2 id="generated-heading" className="text-lg font-semibold text-passflow-ink">Generated PassFlow QR</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-52">
                  <span className="form-label">Credential state</span>
                  <select className="form-control" value={scenario} onChange={(event) => setScenario(event.target.value as CredentialScenario)}>
                    <option value="valid">Valid now</option>
                    <option value="expired">Expired</option>
                    <option value="not-yet-valid">Not yet valid</option>
                  </select>
                </label>
                <button type="button" className="control-button control-button-primary" onClick={generatePass} disabled={busy}>Generate signed QR</button>
                <button type="button" className="control-button control-button-secondary" onClick={scanGeneratedRepeatedly} disabled={busy || !generatedQr}>Scan twice</button>
                <button type="button" className="control-button control-button-secondary" onClick={scanNonPassFlow} disabled={busy}>Test non-PassFlow QR</button>
              </div>
              {generatedQr ? <img src={generatedQr} alt="Generated QR under test" className="mt-5 size-72 max-w-full rounded-lg border border-passflow-border bg-white p-2" /> : null}
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-passflow-border bg-white p-6">
                <h2 className="text-lg font-semibold text-passflow-ink">Static QR image</h2>
                <p className="mt-2 text-sm leading-6 text-passflow-muted">Choose a local PNG, JPEG, or WebP image. It is decoded in this browser only.</p>
                <input aria-label="Choose static QR image" className="mt-4 block w-full text-sm text-passflow-muted" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectStaticImage} />
                {staticPreview ? <img src={staticPreview} alt="Selected static QR" className="mt-4 max-h-64 w-full rounded-lg border border-passflow-border object-contain" /> : null}
              </div>

              <div className="rounded-xl border border-passflow-border bg-white p-6">
                <h2 className="text-lg font-semibold text-passflow-ink">Prerecorded moving QR video</h2>
                <p className="mt-2 text-sm leading-6 text-passflow-muted">Choose a local video, then play it. Frames use the production 2 FPS processor path.</p>
                <input aria-label="Choose prerecorded QR video" className="mt-4 block w-full text-sm text-passflow-muted" type="file" accept="video/*" onChange={selectVideo} />
                {videoUrl ? (
                  <div className="relative mt-4 overflow-hidden rounded-lg bg-passflow-video">
                    <video ref={attachVideo} src={videoUrl} controls muted playsInline className="aspect-video w-full object-contain" onPlay={() => setVideoRunning(true)} onPause={() => setVideoRunning(false)} onEnded={() => setVideoRunning(false)} />
                    <canvas ref={attachOverlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-passflow-border bg-white px-6">
              <AccessDecision decision={decision} />
            </div>
            <section className="rounded-xl border border-passflow-border bg-white p-6" aria-labelledby="harness-log-heading">
              <h2 id="harness-log-heading" className="text-lg font-semibold text-passflow-ink">Harness events</h2>
              <div aria-live="polite" className="mt-4 space-y-3">
                {events.length ? events.map((event) => (
                  <div key={event.id} className="rounded-lg bg-passflow-soft p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-passflow-ink">{event.source}</span>
                      <span className="shrink-0 text-xs font-bold text-passflow-muted">{event.outcome}</span>
                    </div>
                    <p className="mt-1 leading-5 text-passflow-muted">{event.detail}</p>
                  </div>
                )) : <p className="text-sm leading-6 text-passflow-muted">No QR frames processed yet.</p>}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
