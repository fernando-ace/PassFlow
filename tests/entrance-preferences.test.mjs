import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_ENTRANCE_PREFERENCES,
  ENTRANCE_PREFERENCES_STORAGE_KEY,
  parseEntrancePreferences,
} from '../lib/entrance/preferences.mjs'

test('parses saved doorbell mode and a valid threshold', () => {
  assert.equal(ENTRANCE_PREFERENCES_STORAGE_KEY, 'passflow.entrance-preferences.v1')
  assert.deepEqual(parseEntrancePreferences('{"entranceMode":"doorbell","doorbellNearCameraHeightRatio":0.8}'), {
    entranceMode: 'doorbell',
    doorbellNearCameraHeightRatio: 0.8,
  })
})

test('parses the saved boundary mode and keeps its doorbell threshold', () => {
  assert.deepEqual(parseEntrancePreferences('{"entranceMode":"boundary","doorbellNearCameraHeightRatio":0.65}'), {
    entranceMode: 'boundary',
    doorbellNearCameraHeightRatio: 0.65,
  })
})

test('falls back to default preferences when saved settings are missing or invalid', () => {
  for (const value of [null, '{bad json', '{}', '{"entranceMode":"unknown","doorbellNearCameraHeightRatio":0.65}', '{"entranceMode":"doorbell","doorbellNearCameraHeightRatio":0.64}', '{"entranceMode":"doorbell","doorbellNearCameraHeightRatio":0.95}']) {
    assert.deepEqual(parseEntrancePreferences(value), DEFAULT_ENTRANCE_PREFERENCES)
  }
})
