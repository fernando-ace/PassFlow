import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import QRCode from 'qrcode'
import { verifySignedCredential } from '../lib/credentials/tokenCore.mjs'
import { qrPresentationOptions } from '../lib/credentials/qrPresentation.mjs'
import { decodeQrFrameRobust } from '../lib/video-processors/qrDecoder.mjs'

process.env.PASSFLOW_SIGNING_SECRET = 'passflow-qr-degraded-test-secret-only-2026'
const credential = { version: 1, passId: '4fc0f2be-10a7-4b3a-a3b6-b4d29c2e9862', displayName: 'Alex Smith', location: 'Front door',
  validFrom: '2026-10-09T18:00:00.123Z', validUntil: '2026-10-09T19:00:00.456Z' }
const compactValue = `pf2.${Buffer.from(JSON.stringify([credential.passId, credential.displayName, credential.location,
  Date.parse(credential.validFrom), Date.parse(credential.validUntil)])).toString('base64url')}`
const created = { credential, token: `${compactValue}.${createHmac('sha256', process.env.PASSFLOW_SIGNING_SECRET).update(compactValue).digest('base64url')}` }
const legacyValue = `pf1.${Buffer.from(JSON.stringify(created.credential)).toString('base64url')}`
const legacy = `${legacyValue}.${createHmac('sha256', process.env.PASSFLOW_SIGNING_SECRET).update(legacyValue).digest('base64url')}`

// Synthetic image degradation, deliberately not presented as physical Ring evidence.
function cameraFrame(value, condition, moduleScale = 4) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const extent = (qr.modules.size + 8) * moduleScale
  const width = 800
  const height = 600
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localY = y - 80
      // Inverse of a planar homography (top edge narrower than bottom edge).
      const sourceY = condition === 'perspective' ? localY / (0.78 + 0.22 * localY / extent) : localY
      const narrowing = condition === 'perspective' ? 0.78 / (1 - 0.22 * sourceY / extent) : 1
      const localX = (x - 250 - (1 - narrowing) * extent / 2) / narrowing
      const mx = Math.floor(localX / moduleScale) - 4
      const my = Math.floor(sourceY / moduleScale) - 4
      const inCode = localX >= 0 && localY >= 0 && localX < extent && localY < extent
      const dark = inCode && mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(mx, my)
      let gray = inCode ? (dark ? 0 : 255) : 90
      if (condition === 'low-contrast' && inCode) gray = dark ? 115 : 155
      if (condition === 'inverted' && inCode) gray = 255 - gray
      const offset = (y * width + x) * 4
      data[offset] = data[offset + 1] = data[offset + 2] = gray
      data[offset + 3] = 255
    }
  }
  if (condition === 'blur') {
    const original = data.slice()
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) sum += original[((y + dy) * width + x + dx) * 4]
        const offset = (y * width + x) * 4
        data[offset] = data[offset + 1] = data[offset + 2] = sum / 9
      }
    }
  }
  return { data, width, height }
}

for (const [format, value] of [['pf1', legacy], ['pf2', created.token]]) {
  for (const condition of ['scaled', 'low-contrast', 'inverted', 'perspective', 'blur']) {
    test(`${format} real-length QR synthetic ${condition}${format === 'pf1' && condition === 'perspective' ? ' records a known optical failure boundary' : ' decodes'}`, () => {
      const decoded = decodeQrFrameRobust(cameraFrame(value, condition))
      if (format === 'pf1' && condition === 'perspective') {
        // Explicit optical failure boundary: compatibility does not make a dense legacy symbol readable.
        assert.equal(decoded, null)
        assert.equal(decodeQrFrameRobust(cameraFrame(created.token, condition))?.value, created.token)
        return
      }
      assert.equal(decoded?.value, value)
      assert.ok(decoded.boundingBox.x > 240 && decoded.boundingBox.x < 300)
      assert.equal(verifySignedCredential(decoded.value, new Date('2026-10-09T18:30:00Z')).valid, true)
    })
  }
}

test('presentation has four-module margins, black and white, and integer scaling that fits', () => {
  for (const available of [320, 390, 720]) {
    const options = qrPresentationOptions(QRCode.create(created.token, { errorCorrectionLevel: 'M' }).modules.size, available)
    const modules = QRCode.create(created.token, options).modules.size
    assert.equal(options.margin, 4)
    assert.equal(options.color.dark, '#000000')
    assert.equal(options.color.light, '#ffffff')
    assert.equal(Number.isInteger(options.scale), true)
    assert.ok((modules + 8) * options.scale <= available)
  }
  assert.ok(QRCode.create(created.token).modules.size < QRCode.create(legacy).modules.size)
})
