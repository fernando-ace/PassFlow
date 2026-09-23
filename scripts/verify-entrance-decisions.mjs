import assert from 'node:assert/strict'
import { AccessDecisionEngine, ACCESS_OUTCOME } from '../lib/access/decisionCore.mjs'
import { DoorwayTracker } from '../lib/entrance/trackerCore.mjs'

const frame = { width: 1_000, height: 1_000 }
const validCredential = {
  valid: true,
  status: 'valid',
  message: 'Credential verified.',
  credential: {
    passId: 'verification-pass',
    displayName: 'Verification visitor',
    location: 'Front door',
    validFrom: '2026-09-23T18:00:00.000Z',
    validUntil: '2026-09-23T19:00:00.000Z',
  },
}

function person(bottom, x) {
  return { x, y: bottom - 200, width: 100, height: 200, confidence: 0.9 }
}

function runScenario({ credential, frames }) {
  const tracker = new DoorwayTracker()
  const decision = new AccessDecisionEngine({ entryWindowMs: 12_000 })
  if (credential) decision.credentialVerified(validCredential, 0)

  let state = decision.snapshot(0)
  for (const sample of frames) {
    const result = tracker.update(sample.detections, sample.timestamp, frame)
    state = decision.updatePeopleDetected(sample.detections.length, sample.timestamp)
    for (const crossing of result.crossings) {
      state = decision.recordEntrant(crossing.trackId, crossing.timestamp)
    }
  }
  return state
}

const oneEntrant = runScenario({
  credential: true,
  frames: [
    { timestamp: 1_000, detections: [person(540, 420)] },
    { timestamp: 1_500, detections: [person(620, 420)] },
    { timestamp: 2_000, detections: [person(710, 420)] },
  ],
})
assert.equal(oneEntrant.outcome, ACCESS_OUTCOME.authorized)

const multipleEntrants = runScenario({
  credential: true,
  frames: [
    { timestamp: 1_000, detections: [person(540, 280), person(540, 620)] },
    { timestamp: 1_500, detections: [person(620, 280), person(620, 620)] },
    { timestamp: 2_000, detections: [person(710, 280), person(710, 620)] },
  ],
})
assert.equal(multipleEntrants.outcome, ACCESS_OUTCOME.tailgating)

const nearDoor = runScenario({
  credential: true,
  frames: [
    { timestamp: 1_000, detections: [person(580, 420)] },
    { timestamp: 1_500, detections: [person(620, 420)] },
    { timestamp: 2_000, detections: [person(590, 420)] },
  ],
})
assert.equal(nearDoor.entrantsCounted, 0)

const noCredential = runScenario({
  credential: false,
  frames: [
    { timestamp: 1_000, detections: [person(540, 420)] },
    { timestamp: 1_500, detections: [person(620, 420)] },
    { timestamp: 2_000, detections: [person(710, 420)] },
  ],
})
assert.equal(noCredential.outcome, ACCESS_OUTCOME.unauthorized)

console.log('Deterministic entrance verification passed:')
console.log(`- valid credential + one entrant: ${oneEntrant.outcome}`)
console.log(`- valid credential + two entrants: ${multipleEntrants.outcome}`)
console.log(`- near-door movement without crossing: ${nearDoor.entrantsCounted} entrants`)
console.log(`- entrant without credential: ${noCredential.outcome}`)
