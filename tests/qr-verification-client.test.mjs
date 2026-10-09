import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/loadTypescript.mjs'
const { verifyQrCredential, isPassFlowQrValue } = await loadTypescript('lib/credentials/verifyQrCredential.ts')

test('both pf1 and pf2 reach server verification; unrelated values are classified locally', async () => {
  const original = globalThis.fetch
  const values = []
  globalThis.fetch = async (_url, options) => {
    values.push(JSON.parse(options.body).token)
    return { ok: true, json: async () => ({ valid: true, status: 'valid', message: 'Valid' }) }
  }
  try {
    for (const value of ['pf1.payload.signature', 'pf2.payload.signature']) {
      assert.equal(isPassFlowQrValue(value), true)
      assert.equal((await verifyQrCredential(value)).valid, true)
    }
    assert.equal((await verifyQrCredential('https://example.com')).status, 'malformed')
    assert.deepEqual(values, ['pf1.payload.signature', 'pf2.payload.signature'])
  } finally { globalThis.fetch = original }
})
