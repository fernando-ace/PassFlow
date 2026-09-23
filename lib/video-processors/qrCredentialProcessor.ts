import jsQR from 'jsqr'
import { processorRegistry } from './registry'
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
    const code = jsQR(frame.data, frame.width, frame.height, {
      inversionAttempts: 'dontInvert',
    })
    if (!code || !this.debouncer.shouldProcess(code.data)) return null

    const corners = [
      code.location.topLeftCorner,
      code.location.topRightCorner,
      code.location.bottomRightCorner,
      code.location.bottomLeftCorner,
    ]
    const xValues = corners.map((corner) => corner.x)
    const yValues = corners.map((corner) => corner.y)
    const left = Math.min(...xValues)
    const top = Math.min(...yValues)

    return {
      id: `${this.id}-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      data: { token: code.data },
      message: 'QR detected',
      boundingBoxes: [{
        x: left,
        y: top,
        width: Math.max(...xValues) - left,
        height: Math.max(...yValues) - top,
        label: 'Credential',
        color: '#0d9488',
      }],
    }
  }
}

export function ensureQrCredentialProcessorRegistered() {
  if (!processorRegistry.get(QR_CREDENTIAL_PROCESSOR_ID)) {
    processorRegistry.register(new QrCredentialProcessor())
  }
}
