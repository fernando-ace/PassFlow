import { processorRegistry } from './registry'
import { decodeQrFrame } from './qrDecoder.mjs'
import { QrValueDebouncer } from './qrValueDebouncer.mjs'
import type { ProcessorResult, VideoProcessor } from './types'

export { QrValueDebouncer } from './qrValueDebouncer.mjs'

export const QR_CREDENTIAL_PROCESSOR_ID = 'passflow-qr-credential'

export class QrCredentialProcessor implements VideoProcessor {
  id = QR_CREDENTIAL_PROCESSOR_ID
  name = 'PassFlow QR credential'
  description = 'Recognizes signed PassFlow credentials from Ring video frames.'
  enabled = true

  private readonly debouncer = new QrValueDebouncer()

  async process(frame: ImageData): Promise<ProcessorResult | null> {
    const decoded = decodeQrFrame(frame)
    if (!decoded || !this.debouncer.shouldProcess(decoded.value)) return null

    return {
      id: `${this.id}-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
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
    this.debouncer.reset()
  }

  async destroy() {
    this.debouncer.reset()
  }
}

export function ensureQrCredentialProcessorRegistered() {
  if (!processorRegistry.get(QR_CREDENTIAL_PROCESSOR_ID)) {
    processorRegistry.register(new QrCredentialProcessor())
  }
}
