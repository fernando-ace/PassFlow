import test from 'node:test'
import assert from 'node:assert/strict'
import { createFrameClock, createResultLane } from '../lib/video-processors/processingCore.mjs'
import { createCredentialScan } from '../lib/credentials/scanCore.mjs'

test('a single-frame QR is delivered even when the next sample is empty', async () => {
  const lane = createResultLane()
  const events = []
  await lane.run(async () => ({ token: 'one-frame' }), (result) => events.push(result), assert.fail)
  await lane.run(async () => null, (result) => events.push(result), assert.fail)
  assert.deepEqual(events, [{ token: 'one-frame' }])
})

test('slow person inference cannot block the QR lane and each lane has one flight', async () => {
  const person = createResultLane()
  const qr = createResultLane()
  let finish
  const delivered = []
  const pending = person.run(() => new Promise((resolve) => { finish = resolve }), (x) => delivered.push(x), assert.fail)
  assert.equal(await person.run(async () => 'duplicate', assert.fail, assert.fail), false)
  await qr.run(async () => 'qr', (x) => delivered.push(x), assert.fail)
  assert.deepEqual(delivered, ['qr'])
  person.reset()
  finish('stale person')
  await pending
  assert.deepEqual(delivered, ['qr'])
})

test('empty frames do not abort a slow verification; resets do discard it', async () => {
  for (const reset of [false, true]) {
    let finish
    let signal
    const results = []
    const scanner = createCredentialScan({
      verify: (_, s) => { signal = s; return new Promise((resolve) => { finish = resolve }) },
      checking: () => {}, verified: (x) => results.push(x), status: () => {},
    })
    const pending = scanner.submit('token')
    await scanner.submit('token')
    if (reset) scanner.reset()
    assert.equal(signal.aborted, reset)
    finish({ valid: true, status: 'valid' })
    await pending
    assert.equal(results.length, reset ? 0 : 1)
  }
})

test('duplicate/frozen presented-frame counters are skipped and a resumed stream is unhealthy', () => {
  const clock = createFrameClock()
  assert.equal(clock.sample(1, 100).healthy, true)
  assert.equal(clock.sample(1, 3000), null)
  assert.equal(clock.sample(2, 3200).healthy, false)
  assert.equal(clock.sample(3, 3400).healthy, true)
})
