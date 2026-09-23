import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QrValueDebouncer } from '../lib/video-processors/qrValueDebouncer.mjs'

test('suppresses repeated detections during the cooldown', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  assert.equal(debouncer.shouldProcess('credential-a', 1_001), false)
  assert.equal(debouncer.shouldProcess('credential-a', 8_999), false)
  assert.equal(debouncer.shouldProcess('credential-a', 9_000), true)
})

test('does not let alternating values bypass per-value cooldowns', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  assert.equal(debouncer.shouldProcess('credential-b', 1_001), true)
  assert.equal(debouncer.shouldProcess('credential-a', 1_002), false)
})

test('reset allows a value to be processed immediately', () => {
  const debouncer = new QrValueDebouncer(8_000)

  assert.equal(debouncer.shouldProcess('credential-a', 1_000), true)
  debouncer.reset()
  assert.equal(debouncer.shouldProcess('credential-a', 1_001), true)
})
