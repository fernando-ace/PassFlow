import { processorRegistry } from './registry'
import { decodeQrFrame } from './qrDecoder.mjs'
import { QrValueDebouncer } from './qrValueDebouncer.mjs'
import type { ProcessorResult, VideoProcessor } from './types'

export { QrValueDebouncer } from './qrValueDebouncer.mjs'

export const QR_CREDENTIAL_PROCESSOR_ID = 'passflow-qr-credential'
export const QR_CREDENTIAL_DEFAULT_FPS = 2

export class QrCredentialProcessor implements VideoProcessor {
  id = QR_CREDENTIAL_PROCESSOR_ID
  name = 'PassFlow QR credential'
  description = 'Recognizes signed PassFlow credentials from Ring video frames.'
  enabled = true

  private readonly debouncer = new QrValueDebouncer()
  private minimumProcessingIntervalMs = 1_000 / QR_CREDENTIAL_DEFAULT_FPS
  private lastProcessedAt = Number.NEGATIVE_INFINITY

  async process(frame: ImageData): Promise<ProcessorResult | null> {
    const now = Date.now()
    if (now - this.lastProcessedAt < this.minimumProcessingIntervalMs) return null
    this.lastProcessedAt = now
    const decoded = decodeQrFrame(frame)
    if (!decoded || !this.debouncer.shouldProcess(decoded.value)) return null

    return {
      id: `${this.id}-${now}`,
      processorId: this.id,
      timestamp: now,
      data: { token: decoded.value },
      message: 'QR detected',
      boundingBoxes: [{
        ...decoded.boundingBox,
        label: 'Credential',
        color: '#0d9488',
      }],
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
    this.debouncer.reset()
    this.lastProcessedAt = Number.NEGATIVE_INFINITY
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
