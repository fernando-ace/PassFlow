import assert from 'node:assert/strict'
import { test } from 'node:test'
import QRCode from 'qrcode'
import { decodeQrFrame } from '../lib/video-processors/qrDecoder.mjs'
import { QrValueDebouncer } from '../lib/video-processors/qrValueDebouncer.mjs'

function qrFrame(value) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const scale = 6
  const margin = 4
  const width = (qr.modules.size + margin * 2) * scale
  const data = new Uint8ClampedArray(width * width * 4)

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / scale) - margin
      const moduleY = Math.floor(y / scale) - margin
      const dark = moduleX >= 0 && moduleY >= 0
        && moduleX < qr.modules.size && moduleY < qr.modules.size
        && qr.modules.get(moduleX, moduleY)
      const offset = (y * width + x) * 4
      const shade = dark ? 0 : 255
      data[offset] = shade
      data[offset + 1] = shade
      data[offset + 2] = shade
      data[offset + 3] = 255
    }
  }

  return { data, width, height: width }
}

test('shared decoder recognizes a generated PassFlow QR value', () => {
  const value = 'pf1.test-payload.test-signature'
  const decoded = decodeQrFrame(qrFrame(value))

  assert.equal(decoded?.value, value)
  assert.ok(decoded?.boundingBox.width > 0)
  assert.ok(decoded?.boundingBox.height > 0)
})

test('shared decoder also returns non-PassFlow QR values for graceful classification', () => {
  const value = 'https://example.com/not-passflow'
  assert.equal(decodeQrFrame(qrFrame(value))?.value, value)
})

test('suppresses repeated detections during the cooldown', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  assert.equal(debouncer.shouldProcess('credential-a', 1_001), false)
  assert.equal(debouncer.shouldProcess('credential-a', 8_999), false)
  assert.equal(debouncer.shouldProcess('credential-a', 9_000), true)
})

test('does not let alternating values bypass per-value cooldowns', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  assert.equal(debouncer.shouldProcess('credential-b', 1_001), true)
  assert.equal(debouncer.shouldProcess('credential-a', 1_002), false)
})

test('reset allows a value to be processed immediately', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  debouncer.reset()
  assert.equal(debouncer.shouldProcess('credential-a', 1_001), true)
})
