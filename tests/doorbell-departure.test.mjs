import test from 'node:test'
import assert from 'node:assert/strict'
import { DoorwayTracker } from '../lib/entrance/trackerCore.mjs'

const frame = { width: 1_000, height: 1_000 }
const box = (x, height = 700) => ({ x, y: 900 - height, width: 180, height, confidence: 0.8 })
const tracker = (config = {}) => new DoorwayTracker({ mode: 'doorbell', ...config })
function approach(t, shift = 0) {
  for (const [time, x, height] of [[0, 400, 500], [200, 430, 600], [400, 460, 700],
    [600, 490, 700], [800, 520, 700], [1000, 550, 700], [1200, 650, 700], [1400, 760, 700]]) {
    t.update([box(x + shift, height)], time, frame)
  }
}
function absent(t, start = 1600, end = 4600, step = 200, healthy = true) {
  const events = []
  for (let time = start; time <= end; time += step) events.push(...t.update([], time, frame, healthy).crossings)
  return events
}

test('counts only sustained approach, right-edge departure and three seconds of fresh absence', () => {
  const t = tracker()
  approach(t)
  assert.equal(absent(t, 1600, 4400).length, 0)
  const result = t.update([], 4600, frame)
  assert.deepEqual(result.crossings, [{ trackId: 1, direction: 'entering', timestamp: 1600,
    confirmedAt: 4600, evidence: 'inferred' }])
  assert.equal(absent(t, 4800, 7000).length, 0)
})

test('standing and knocking near the camera never counts', () => {
  const t = tracker()
  for (let time = 0; time <= 3000; time += 200) assert.equal(t.update([box(500)], time, frame).crossings.length, 0)
  assert.equal(absent(t, 3200, 8000).length, 0)
})

test('close appearance without observed approach is insufficient even at the exit edge', () => {
  const t = tracker()
  for (let time = 0; time <= 1000; time += 200) t.update([box(700 + time / 10)], time, frame)
  assert.equal(absent(t, 1200, 6000).length, 0)
})

test('loss away from the right edge and retreat do not count', () => {
  for (const retreat of [false, true]) {
    const t = tracker()
    approach(t, -300)
    if (retreat) t.update([box(430, 500)], 1600, frame)
    assert.equal(absent(t, 1800, 7000).length, 0)
  }
})

test('reacquiring a partially visible person cancels the pending entry', () => {
  const t = tracker()
  approach(t)
  t.update([], 1600, frame)
  const visible = t.update([box(780)], 1800, frame)
  assert.equal(visible.tracks[0].id, 1)
  assert.equal(visible.tracks[0].fresh, true)
  for (let time = 2000; time <= 5400; time += 200) assert.equal(t.update([box(780)], time, frame).crossings.length, 0)
  assert.equal(absent(t, 5600, 9600).length, 0)
})

test('brief misses retain identity and expose missing tracks as non-fresh', () => {
  const t = tracker()
  approach(t)
  const missing = t.update([], 1600, frame)
  assert.equal(missing.tracks[0].fresh, false)
  assert.equal(t.update([box(760)], 1800, frame).tracks[0].id, 1)
})

test('stalled video and long inference gaps cannot confirm departure', () => {
  for (const healthy of [true, false]) {
    const t = tracker()
    approach(t)
    t.update([], 1600, frame)
    assert.equal(t.update([], 5000, frame, healthy).crossings.length, 0)
    assert.equal(absent(t, 5200, 9000).length, 0)
  }
})

test('absence grace uses time, not sampling frequency', () => {
  for (const step of [100, 200, 500, 1000]) {
    const t = tracker()
    approach(t)
    const events = absent(t, 1600, 4600, step)
    assert.equal(events.length, 1)
    assert.equal(events[0].confirmedAt, 4600)
  }
})

test('two distinct people can produce separate departures', () => {
  const t = tracker()
  approach(t)
  assert.equal(absent(t).length, 1)
  for (const [offset, x, height] of [[0, 400, 500], [200, 430, 600], [400, 460, 700],
    [600, 490, 700], [800, 520, 700], [1000, 550, 700], [1200, 650, 700], [1400, 760, 700]]) {
    t.update([box(x, height)], 6000 + offset, frame)
  }
  const events = absent(t, 7600, 10600)
  assert.equal(events.length, 1)
  assert.equal(events[0].trackId, 2)
})

test('another person blocking the exit leaves the missing person unconfirmed', () => {
  const t = tracker()
  approach(t)
  t.update([{ ...box(850), y: 0, width: 30, height: 80 }], 1600, frame)
  assert.equal(absent(t, 1800, 7000).length, 0)
})

test('left exit calibration mirrors the departure rule', () => {
  const t = tracker({ doorbellExitSide: 'left' })
  for (const [time, x, height] of [[0, 400, 500], [200, 430, 600], [400, 460, 700],
    [600, 490, 700], [800, 520, 700], [1000, 550, 700], [1200, 650, 700], [1400, 760, 700]]) {
    t.update([box(820 - x, height)], time, frame)
  }
  assert.equal(absent(t).length, 1)
})

test('the configured 90% close threshold must be sustained; a single large box cannot arm entry', () => {
  const t = tracker({ doorbellNearCameraHeightRatio: 0.9 })
  approach(t)
  t.update([box(800, 950)], 1600, frame)
  assert.equal(absent(t, 1800, 6500).length, 0)
})
