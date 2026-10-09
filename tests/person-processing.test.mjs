import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/loadTypescript.mjs'
const { PersonDetectionProcessor } = await loadTypescript('lib/video-processors/personDetectionProcessor.ts')
globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) { Object.assign(this, { data, width, height }) }
}
const frame = new ImageData(new Uint8ClampedArray(100 * 100 * 4), 100, 100)

test('20% confidence reaches the real processor model and retains a 25% person prediction', async () => {
  let loaded
  let threshold
  const processor = new PersonDetectionProcessor({ minimumConfidence: 0.2,
    loadModel: async (config) => {
      loaded = config.base
      return { dispose() {}, detect: async (_frame, _limit, score) => {
        threshold = score
        return [{ class: 'person', score: 0.25, bbox: [20, 10, 20, 60] }]
      } }
    },
  })
  const result = await processor.process(frame)
  assert.equal(loaded, 'mobilenet_v2')
  assert.equal(threshold, 0.2)
  assert.equal(result.data.peopleDetected, 1)
})

test('lost-person crop is rechecked and its coordinates map back to the original frame', async () => {
  let calls = 0
  let now = 0
  const inputs = []
  const processor = new PersonDetectionProcessor({ now: () => now, loadModel: async () => ({ dispose() {},
    detect: async (input) => {
      inputs.push(input)
      calls += 1
      if (calls === 1) return [{ class: 'person', score: 0.8, bbox: [60, 10, 30, 70] }]
      if (calls === 2) return []
      return [{ class: 'person', score: 0.25, bbox: [12, 28, 20, 50] }]
    },
  }) })
  await processor.process(frame)
  now = 200
  const result = await processor.process(frame)
  assert.equal(calls, 3)
  assert.ok(inputs[2].width < frame.width)
  assert.equal(result.data.recoveryAttempts, 1)
  assert.equal(result.data.tracks[0].id, 1)
  assert.equal(result.boundingBoxes[0].x, 60)
  assert.equal(result.boundingBoxes[0].y, 28)
})

test('reset while inference is pending prevents stale detections or tracking mutations', async () => {
  let finish
  const processor = new PersonDetectionProcessor({ loadModel: async () => ({ dispose() {},
    detect: () => new Promise((resolve) => { finish = resolve }),
  }) })
  await processor.init()
  const pending = processor.process(frame)
  await new Promise((resolve) => setImmediate(resolve))
  processor.resetSession()
  finish([{ class: 'person', score: 0.9, bbox: [1, 1, 20, 70] }])
  assert.equal(await pending, null)
})
