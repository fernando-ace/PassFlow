import { processorRegistry } from './registry'
import { decodeQrFrameRobust } from './qrDecoder.mjs'
import { QrValueDebouncer } from './qrValueDebouncer.mjs'
import type { ProcessorResult, VideoProcessor } from './types'

export { QrValueDebouncer } from './qrValueDebouncer.mjs'

export const QR_CREDENTIAL_PROCESSOR_ID = 'passflow-qr-credential'
export const QR_CREDENTIAL_DEFAULT_FPS = 8

export class QrCredentialProcessor implements VideoProcessor {
  id = QR_CREDENTIAL_PROCESSOR_ID
  name = 'PassFlow QR credential'
  description = 'Recognizes signed PassFlow credentials from Ring video frames.'
  enabled = true

  private readonly debouncer = new QrValueDebouncer()
  private minimumProcessingIntervalMs = 1_000 / QR_CREDENTIAL_DEFAULT_FPS
  private lastProcessedAt = Number.NEGATIVE_INFINITY
  private sessionVersion = 0
  private sample = 0
  private worker: Worker | null = null
  private pendingReject: ((error: Error) => void) | null = null

  async process(frame: ImageData): Promise<ProcessorResult | null> {
    const now = Date.now()
    if (now - this.lastProcessedAt < this.minimumProcessingIntervalMs) return null
    this.lastProcessedAt = now
    const session = this.sessionVersion
    const decoded = await this.decode(frame)
    if (session !== this.sessionVersion) return null
    const emit = decoded && this.debouncer.shouldProcess(decoded.value)

    return {
      id: `${this.id}-${now}`,
      processorId: this.id,
      timestamp: now,
      data: { ...(emit ? { token: decoded.value } : {}), scanned: true, decoded: Boolean(decoded) },
      message: decoded ? 'QR detected' : 'Scanning for QR',
      boundingBoxes: decoded ? [{
        ...decoded.boundingBox,
        label: 'Credential',
        color: '#0d9488',
      }] : [],
    }
  }

  async init() {
    this.resetSession()
  }

  async destroy() {
    this.resetSession()
  }

  configureSamplingRate(fps: number) {
    this.minimumProcessingIntervalMs = 1_000 / fps
  }

  resetSession() {
    this.sessionVersion += 1
    this.worker?.terminate()
    this.worker = null
    this.pendingReject?.(new Error('QR scan reset.'))
    this.pendingReject = null
    this.debouncer.reset()
    this.lastProcessedAt = Number.NEGATIVE_INFINITY
  }

  getSessionVersion() { return this.sessionVersion }

  private async decode(frame: ImageData): Promise<ReturnType<typeof decodeQrFrameRobust>> {
    const sample = this.sample++
    if (typeof Worker === 'undefined') return decodeQrFrameRobust(frame, sample)
    this.worker ??= new Worker(new URL('./qrWorker.ts', import.meta.url))
    const worker = this.worker
    return new Promise((resolve, reject) => {
      this.pendingReject = reject
      worker.onmessage = (event) => {
        this.pendingReject = null
        if (event.data.error) reject(new Error(event.data.error))
        else resolve(event.data.decoded)
      }
      worker.onerror = () => {
        this.pendingReject = null
        worker.terminate()
        this.worker = null
        reject(new Error('QR scanner worker failed. Restart scanning.'))
      }
      // Structured clone: the person detector still owns the original pixel buffer.
      worker.postMessage({ frame: { data: frame.data, width: frame.width, height: frame.height }, sample })
    })
  }
}

export function ensureQrCredentialProcessorRegistered() {
  if (!processorRegistry.get(QR_CREDENTIAL_PROCESSOR_ID)) {
    processorRegistry.register(new QrCredentialProcessor())
  }
}

export function getQrCredentialProcessor() {
  return processorRegistry.get(QR_CREDENTIAL_PROCESSOR_ID) as QrCredentialProcessor | undefined
}
