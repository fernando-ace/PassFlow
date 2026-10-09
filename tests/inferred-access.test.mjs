import test from 'node:test'
import assert from 'node:assert/strict'
import { AccessDecisionEngine } from '../lib/access/decisionCore.mjs'

const verification = { valid: true, status: 'valid', message: 'Valid', credential: {
  displayName: 'Visitor', validUntil: '2099-01-01T00:00:00.000Z',
} }
test('inference confirmed after window expiry is adjudicated at observed departure time', () => {
  const engine = new AccessDecisionEngine({ now: () => 15000 })
  engine.credentialVerified(verification, 0)
  assert.equal(engine.snapshot(13000).outcome, 'waiting-for-credential')
  const state = engine.recordEntrant(1, 11000, 'inferred', 15000)
  assert.equal(state.outcome, 'authorized-entry')
  assert.equal(state.entryWindowActive, false)
  assert.equal(state.entryEvidence, 'inferred')
  assert.match(state.events.find((e) => e.type === 'entrant-counted').label, /Inferred entry/)
  assert.equal(engine.recordEntrant(2, 11500, 'inferred').outcome, 'possible-tailgating')
})
test('late departure and a departure before the credential window are unauthorized', () => {
  for (const timestamp of [500, 14000]) {
    const engine = new AccessDecisionEngine()
    engine.credentialVerified(verification, 1000)
    assert.equal(engine.recordEntrant(1, timestamp, 'inferred').outcome, 'unauthorized-entry')
  }
})
test('reset discards historical credential windows', () => {
  const engine = new AccessDecisionEngine()
  engine.credentialVerified(verification, 0)
  engine.reset()
  assert.equal(engine.recordEntrant(1, 11000, 'inferred').outcome, 'unauthorized-entry')
})

test('a new rejected credential closes the previous authorization but retains earlier departure evidence', () => {
  const engine = new AccessDecisionEngine()
  engine.credentialVerified(verification, 0)
  engine.credentialChecking(6000)
  engine.credentialVerified({ valid: false, status: 'expired', message: 'Expired' }, 6200)
  assert.equal(engine.recordEntrant(1, 7000, 'inferred', 10000).outcome, 'unauthorized-entry')
  const late = engine.recordEntrant(2, 5000, 'inferred', 8000)
  assert.equal(late.outcome, 'authorized-entry')
  assert.equal(late.entryWindowActive, false)
})
