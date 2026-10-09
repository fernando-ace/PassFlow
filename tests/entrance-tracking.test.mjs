import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DoorwayTracker } from '../lib/entrance/trackerCore.mjs'

const frame = { width: 1_000, height: 1_000 }

function person(bottom, x = 400) {
  return { x, y: bottom - 200, width: 100, height: 200, confidence: 0.9 }
}

function nearPerson(x = 400, height = 700) {
  return { x, y: 900 - height, width: 100, height, confidence: 0.9 }
}

function doorbellTracker() {
  const tracker = new DoorwayTracker()
  tracker.configure({ mode: 'doorbell', doorbellNearCameraHeightRatio: 0.65 })
  return tracker
}

test('counts a tracked person crossing into the entrance', () => {
  const tracker = new DoorwayTracker()
  assert.equal(tracker.update([person(540)], 0, frame).crossings.length, 0)
  assert.equal(tracker.update([person(620)], 500, frame).crossings.length, 0)
  const result = tracker.update([person(710)], 1_000, frame)

  assert.deepEqual(result.crossings.map((crossing) => crossing.trackId), [1])
  assert.equal(result.tracks[0].entered, true)
})

test('does not count a person who remains near the boundary without crossing', () => {
  const tracker = new DoorwayTracker()
  const bottoms = [570, 600, 635, 605, 575]
  const crossings = bottoms.flatMap((bottom, index) => (
    tracker.update([person(bottom)], index * 500, frame).crossings
  ))

  assert.equal(crossings.length, 0)
})

test('does not count movement away from the entrance', () => {
  const tracker = new DoorwayTracker()
  tracker.update([person(710)], 0, frame)
  tracker.update([person(620)], 500, frame)
  const result = tracker.update([person(540)], 1_000, frame)

  assert.equal(result.crossings.length, 0)
})

test('suppresses duplicate crossings for the same track', () => {
  const tracker = new DoorwayTracker()
  const bottoms = [540, 710, 540, 710]
  const crossings = bottoms.flatMap((bottom, index) => (
    tracker.update([person(bottom)], index * 500, frame).crossings
  ))

  assert.equal(crossings.length, 1)
  assert.equal(crossings[0].trackId, 1)
})

test('keeps two nearby entrants on separate track IDs', () => {
  const tracker = new DoorwayTracker()
  tracker.update([person(540, 300), person(540, 600)], 0, frame)
  const result = tracker.update([person(710, 305), person(710, 595)], 500, frame)

  assert.deepEqual(result.crossings.map((crossing) => crossing.trackId).sort(), [1, 2])
})

test('expires a missing track instead of reusing it indefinitely', () => {
  const tracker = new DoorwayTracker()
  tracker.update([person(540)], 0, frame)
  tracker.update([], 500, frame)
  tracker.update([], 1_000, frame)
  tracker.update([], 1_500, frame)
  tracker.update([], 2_000, frame)
  const result = tracker.update([person(710)], 2_500, frame)

  assert.equal(result.crossings.length, 0)
  assert.equal(result.tracks[0].id, 2)
})

test('applies a calibrated reverse crossing direction after resetting tracks', () => {
  const tracker = new DoorwayTracker()
  tracker.configure({
    boundary: {
      orientation: 'horizontal',
      positionRatio: 0.5,
      zoneHalfWidthRatio: 0.02,
      enteringDirection: 'negative',
    },
    tracking: {
      minimumIou: 0.1,
      maximumCentroidDistanceRatio: 0.18,
      maximumMissingFrames: 3,
      maximumMissingMs: 2_000,
    },
  })
  tracker.update([person(650)], 0, frame)
  const result = tracker.update([person(430)], 500, frame)

  assert.equal(result.crossings.length, 1)
})

test('doorbell mode counts a near-camera track only after its disappearance grace period', () => {
  const tracker = doorbellTracker()
  assert.equal(tracker.update([nearPerson()], 0, frame).crossings.length, 0)
  assert.equal(tracker.update([], 500, frame).crossings.length, 0)
  assert.equal(tracker.update([], 1_000, frame).crossings.length, 0)
  assert.equal(tracker.update([], 1_500, frame).crossings.length, 0)
  const result = tracker.update([], 2_000, frame)

  assert.deepEqual(result.crossings, [{ trackId: 1, direction: 'entering', timestamp: 2_000 }])
  assert.equal(result.tracks.length, 0)
  assert.equal(tracker.update([], 2_500, frame).crossings.length, 0)
})

test('doorbell mode ignores disappearance before the person reaches the near-camera threshold', () => {
  const tracker = doorbellTracker()
  tracker.update([nearPerson(400, 600)], 0, frame)
  const result = tracker.update([], 2_000, frame)

  assert.equal(result.crossings.length, 0)
})

test('doorbell mode does not count a person who remains visible near the camera', () => {
  const tracker = doorbellTracker()
  const results = [0, 500, 1_000, 1_500, 2_000].map((timestamp) => (
    tracker.update([nearPerson()], timestamp, frame)
  ))

  assert.ok(results.every((result) => result.crossings.length === 0))
  assert.equal(results.at(-1).tracks[0].nearCamera, true)
})

test('doorbell mode preserves the near-camera candidate across a brief detection gap', () => {
  const tracker = doorbellTracker()
  tracker.update([nearPerson()], 0, frame)
  tracker.update([], 500, frame)
  tracker.update([nearPerson()], 1_000, frame)
  tracker.update([], 1_500, frame)
  tracker.update([], 2_000, frame)
  tracker.update([], 2_500, frame)
  const result = tracker.update([], 3_000, frame)

  assert.deepEqual(result.crossings.map((crossing) => crossing.trackId), [1])
})

test('doorbell mode emits separate events for two near-camera tracks', () => {
  const tracker = doorbellTracker()
  tracker.update([nearPerson(200), nearPerson(700)], 0, frame)
  tracker.update([], 500, frame)
  tracker.update([], 1_000, frame)
  tracker.update([], 1_500, frame)
  const result = tracker.update([], 2_000, frame)

  assert.deepEqual(result.crossings.map((crossing) => crossing.trackId), [1, 2])
})
