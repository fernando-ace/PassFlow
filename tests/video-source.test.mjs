import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDefaultRingDevice } from '../lib/ring/deviceSelection.mjs'
import {
  createSingleFlightGate,
  getContainedVideoRect,
  resetVideoSource,
} from '../lib/video-processors/processingCore.mjs'

test('camera selection handles zero devices and defaults to an online camera', () => {
  assert.equal(selectDefaultRingDevice([]), null)
  const devices = [
    { id: 'offline', online: false },
    { id: 'online', online: true },
  ]
  assert.equal(selectDefaultRingDevice(devices)?.id, 'online')
  assert.equal(selectDefaultRingDevice(devices, 'offline')?.id, 'offline')
})

test('single-flight gate prevents duplicate inference until the active loop releases', () => {
  const gate = createSingleFlightGate()
  assert.equal(gate.acquire(), true)
  assert.equal(gate.acquire(), false)
  gate.release()
  assert.equal(gate.acquire(), true)
})

test('video source reset clears prior detections and tracker state', () => {
  const results = new Map([['person', { id: 'old-source' }]])
  let resets = 0
  resetVideoSource([{ resetSession: () => { resets += 1 } }], results)
  assert.equal(results.size, 0)
  assert.equal(resets, 1)
})

test('overlay geometry fits intrinsic video pixels into the object-contain area', () => {
  assert.deepEqual(getContainedVideoRect(640, 360, 640, 360), {
    scale: 1, x: 0, y: 0, width: 640, height: 360,
  })
  assert.deepEqual(getContainedVideoRect(640, 360, 4, 3), {
    scale: 120, x: 80, y: 0, width: 480, height: 360,
  })
  assert.equal(getContainedVideoRect(640, 360, 0, 0), null)
})
