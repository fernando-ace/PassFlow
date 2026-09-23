import { QrValueDebouncer } from '../lib/video-processors/qrValueDebouncer.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const debouncer = new QrValueDebouncer(8_000)

assert(debouncer.shouldProcess('credential-a', 1_000), 'First credential should be processed.')
assert(!debouncer.shouldProcess('credential-a', 1_001), 'Immediate duplicate should be suppressed.')
assert(!debouncer.shouldProcess('credential-a', 8_999), 'Duplicate inside cooldown should be suppressed.')
assert(debouncer.shouldProcess('credential-a', 9_000), 'Credential should be accepted after cooldown.')
assert(debouncer.shouldProcess('credential-b', 9_001), 'A different credential should be processed immediately.')

console.log('PASS duplicate QR values are suppressed for the configured cooldown')
console.log('PASS new QR values bypass the duplicate cooldown')
