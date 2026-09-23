import QRCode from 'qrcode'
import jsQR from 'jsqr'

const baseUrl = process.env.PASSFLOW_BASE_URL || 'http://127.0.0.1:3000'

async function createCredential(validFrom, validUntil) {
  const response = await fetch(`${baseUrl}/api/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Credential Test',
      location: 'Front door',
      validFrom,
      validUntil,
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Credential creation failed: ${JSON.stringify(body)}`)
  return body.token
}

async function verify(token) {
  const response = await fetch(`${baseUrl}/api/credentials/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return response.json()
}

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString()
}

function tamper(token) {
  const finalCharacter = token.at(-1)
  return `${token.slice(0, -1)}${finalCharacter === 'A' ? 'B' : 'A'}`
}

function decodeGeneratedQr(value) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const scale = 5
  const margin = 4
  const width = (qr.modules.size + margin * 2) * scale
  const pixels = new Uint8ClampedArray(width * width * 4)

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / scale) - margin
      const moduleY = Math.floor(y / scale) - margin
      const dark = moduleX >= 0 && moduleY >= 0
        && moduleX < qr.modules.size && moduleY < qr.modules.size
        && qr.modules.get(moduleX, moduleY)
      const offset = (y * width + x) * 4
      const shade = dark ? 15 : 255
      pixels[offset] = shade
      pixels[offset + 1] = dark ? 29 : 255
      pixels[offset + 2] = dark ? 46 : 255
      pixels[offset + 3] = 255
    }
  }

  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data
}

const cases = []
const validToken = await createCredential(iso(-60_000), iso(60_000))
if (decodeGeneratedQr(validToken) !== validToken) {
  throw new Error('Generated QR did not decode back to its signed credential.')
}
console.log('PASS generated QR round trip')
cases.push(['valid', await verify(validToken)])

const expiredToken = await createCredential(iso(-120_000), iso(-60_000))
cases.push(['expired', await verify(expiredToken)])

const futureToken = await createCredential(iso(60_000), iso(120_000))
cases.push(['not-yet-valid', await verify(futureToken)])
cases.push(['invalid-signature', await verify(tamper(validToken))])
cases.push(['malformed', await verify('not-a-passflow-token')])

for (const [expected, result] of cases) {
  if (result.status !== expected || result.valid !== (expected === 'valid')) {
    throw new Error(`Expected ${expected}; received ${JSON.stringify(result)}`)
  }
  console.log(`PASS ${expected}`)
}
