import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { before, test } from 'node:test'
import {
  createPassInputSchema,
  createSignedCredential,
  verifySignedCredential,
} from '../lib/credentials/tokenCore.mjs'

const signingSecret = 'passflow-automated-test-signing-secret-2026'
const now = new Date('2026-09-23T18:00:00.000Z')

before(() => {
  process.env.PASSFLOW_SIGNING_SECRET = signingSecret
})

function input(overrides = {}) {
  return {
    displayName: 'Credential Test Visitor',
    location: 'Front door',
    validFrom: '2026-09-23T17:00:00.000Z',
    validUntil: '2026-09-23T19:00:00.000Z',
    ...overrides,
  }
}

function signPayload(payloadObject) {
  const payload = Buffer.from(JSON.stringify(payloadObject)).toString('base64url')
  const signedValue = `pf1.${payload}`
  const signature = createHmac('sha256', signingSecret)
    .update(signedValue)
    .digest('base64url')
  return `${signedValue}.${signature}`
}

test('continues verifying legacy pf1 passes with the same public credential shape', () => {
  const credential = { version: 1, passId: '4fc0f2be-10a7-4b3a-a3b6-b4d29c2e9862', ...input() }
  const result = verifySignedCredential(signPayload(credential), now)
  assert.equal(result.valid, true)
  assert.deepEqual(result.credential, credential)
})

test('compact format retains Unicode names and millisecond validity', () => {
  const created = createSignedCredential(input({ displayName: 'Zoë 李', validFrom: '2026-09-23T17:00:00.123Z' }))
  assert.deepEqual(verifySignedCredential(created.token, now).credential, created.credential)
  assert.ok(created.token.length < signPayload(created.credential).length)
})

test('signed compact payload with invalid time bounds or tuple shape is malformed', () => {
  const created = createSignedCredential(input())
  const payload = JSON.parse(Buffer.from(created.token.split('.')[1], 'base64url').toString('utf8'))
  for (const bad of [[...payload, 'extra'], [payload[0], payload[1], payload[2], -1, payload[4]],
    [payload[0], payload[1], payload[2], payload[4], payload[3]]]) {
    const encoded = Buffer.from(JSON.stringify(bad)).toString('base64url')
    const value = `pf2.${encoded}`
    const signed = `${value}.${createHmac('sha256', signingSecret).update(value).digest('base64url')}`
    assert.equal(verifySignedCredential(signed, now).status, 'malformed')
  }
})

test('generates and verifies a valid credential', () => {
  const created = createSignedCredential(input())
  assert.match(created.token, /^pf2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(created.credential.displayName, 'Credential Test Visitor')
  assert.equal(created.credential.location, 'Front door')
  assert.match(created.credential.passId, /^[0-9a-f-]{36}$/i)

  const result = verifySignedCredential(created.token, now)
  assert.equal(result.valid, true)
  assert.equal(result.status, 'valid')
  assert.equal(result.credential?.passId, created.credential.passId)
})

test('reports an expired credential', () => {
  const created = createSignedCredential(input({
    validFrom: '2026-09-23T16:00:00.000Z',
    validUntil: '2026-09-23T17:00:00.000Z',
  }))
  const result = verifySignedCredential(created.token, now)
  assert.equal(result.valid, false)
  assert.equal(result.status, 'expired')
})

test('reports a not-yet-valid credential', () => {
  const created = createSignedCredential(input({
    validFrom: '2026-09-23T19:00:00.000Z',
    validUntil: '2026-09-23T20:00:00.000Z',
  }))
  const result = verifySignedCredential(created.token, now)
  assert.equal(result.valid, false)
  assert.equal(result.status, 'not-yet-valid')
})

test('rejects a modified payload', () => {
  const created = createSignedCredential(input())
  const [prefix, payload, signature] = created.token.split('.')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  parsed[2] = 'Modified door'
  const modifiedPayload = Buffer.from(JSON.stringify(parsed)).toString('base64url')

  const result = verifySignedCredential(`${prefix}.${modifiedPayload}.${signature}`, now)
  assert.equal(result.valid, false)
  assert.equal(result.status, 'invalid-signature')
})

test('rejects an invalid signature', () => {
  const created = createSignedCredential(input())
  const [prefix, payload, signature] = created.token.split('.')
  const replacement = signature.startsWith('A') ? 'B' : 'A'
  const result = verifySignedCredential(
    `${prefix}.${payload}.${replacement}${signature.slice(1)}`,
    now
  )
  assert.equal(result.valid, false)
  assert.equal(result.status, 'invalid-signature')
})

test('rejects a malformed token', () => {
  const result = verifySignedCredential('not-a-passflow-token', now)
  assert.equal(result.valid, false)
  assert.equal(result.status, 'malformed')
})

test('rejects a correctly signed payload with missing required fields', () => {
  const token = signPayload({
    version: 1,
    passId: '4fc0f2be-10a7-4b3a-a3b6-b4d29c2e9862',
    displayName: 'Incomplete Visitor',
    validFrom: '2026-09-23T17:00:00.000Z',
    validUntil: '2026-09-23T19:00:00.000Z',
  })
  const result = verifySignedCredential(token, now)
  assert.equal(result.valid, false)
  assert.equal(result.status, 'malformed')
})

test('rejects pass generation input with missing required fields', () => {
  const parsed = createPassInputSchema.safeParse({
    displayName: 'Missing Location',
    validFrom: '2026-09-23T17:00:00.000Z',
    validUntil: '2026-09-23T19:00:00.000Z',
  })
  assert.equal(parsed.success, false)
})
