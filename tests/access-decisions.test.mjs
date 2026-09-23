import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccessDecisionEngine, ACCESS_OUTCOME } from '../lib/access/decisionCore.mjs'

const validCredential = {
  valid: true,
  status: 'valid',
  message: 'Credential verified.',
  credential: {
    passId: 'pass-1',
    displayName: 'Test visitor',
    location: 'Front door',
    validFrom: '2026-09-23T18:00:00.000Z',
    validUntil: '2026-09-23T19:00:00.000Z',
  },
}

test('opens a configurable entry window after a valid credential', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  const state = engine.credentialVerified(validCredential, 1_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.credentialReady)
  assert.equal(state.entryWindowExpiresAt, 11_000)
  assert.equal(state.entryWindowRemainingMs, 10_000)
})

test('first entrant in the credential window is authorized', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  engine.credentialVerified(validCredential, 1_000)
  const state = engine.recordEntrant(1, 2_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.authorized)
  assert.equal(state.entrantsCounted, 1)
})

test('second entrant in the same window triggers possible tailgating', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  engine.credentialVerified(validCredential, 1_000)
  engine.recordEntrant(1, 2_000)
  const state = engine.recordEntrant(2, 3_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.tailgating)
  assert.equal(state.entrantsCounted, 2)
})

test('duplicate events for one track do not increment the entrant count', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  engine.credentialVerified(validCredential, 1_000)
  engine.recordEntrant(7, 2_000)
  const state = engine.recordEntrant(7, 3_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.authorized)
  assert.equal(state.entrantsCounted, 1)
})

test('entrant without a valid credential is unauthorized', () => {
  const engine = new AccessDecisionEngine()
  const state = engine.recordEntrant(1, 1_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.unauthorized)
  assert.equal(state.entrantsCounted, 1)
})

test('entrant after the entry window expires is unauthorized', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  engine.credentialVerified(validCredential, 1_000)
  const state = engine.recordEntrant(1, 11_001)

  assert.equal(state.outcome, ACCESS_OUTCOME.unauthorized)
  assert.equal(state.entryWindowActive, false)
})

test('invalid credential does not open an entry window', () => {
  const engine = new AccessDecisionEngine()
  engine.credentialVerified({
    valid: false,
    status: 'expired',
    message: 'Credential expired.',
  }, 1_000)
  const state = engine.recordEntrant(1, 2_000)

  assert.equal(state.outcome, ACCESS_OUTCOME.unauthorized)
  assert.equal(state.credential.status, 'expired')
})

test('an unused credential window returns to waiting after expiry', () => {
  const engine = new AccessDecisionEngine({ entryWindowMs: 10_000 })
  engine.credentialVerified(validCredential, 1_000)
  const state = engine.snapshot(11_001)

  assert.equal(state.outcome, ACCESS_OUTCOME.waiting)
  assert.equal(state.entryWindowActive, false)
})
