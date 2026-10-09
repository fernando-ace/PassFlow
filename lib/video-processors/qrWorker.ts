import { decodeQrFrameRobust } from './qrDecoder.mjs'

self.onmessage = (event: MessageEvent) => {
  const { frame, sample } = event.data
  try {
    self.postMessage({ decoded: decodeQrFrameRobust(frame, sample) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'QR decoding failed.' })
  }
}
