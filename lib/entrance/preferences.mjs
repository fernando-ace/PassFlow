export const ENTRANCE_PREFERENCES_STORAGE_KEY = 'passflow.entrance-preferences.v3'
export const LEGACY_ENTRANCE_PREFERENCES_STORAGE_KEY = 'passflow.entrance-preferences.v2'
export const OLDER_ENTRANCE_PREFERENCES_STORAGE_KEY = 'passflow.entrance-preferences.v1'

export const DEFAULT_ENTRANCE_PREFERENCES = Object.freeze({
  entranceMode: 'doorbell',
  doorbellNearCameraHeightRatio: 0.6,
  doorbellExitSide: 'left',
  boundaryPositionRatio: 0.62,
  enteringDirection: 'positive',
  neutralZoneWidthRatio: 0.07,
  minimumConfidence: 0.4,
  samplingFps: 5,
  qrSamplingFps: 8,
  entryWindowSeconds: 12,
})

/** @param {string | null} serialized */
export function parseEntrancePreferences(serialized) {
  if (typeof serialized !== 'string') return { ...DEFAULT_ENTRANCE_PREFERENCES }

  try {
    const value = JSON.parse(serialized)
    const defaults = { ...DEFAULT_ENTRANCE_PREFERENCES }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const enums = { entranceMode: ['boundary', 'doorbell'], doorbellExitSide: ['left', 'right'], enteringDirection: ['positive', 'negative'] }
    for (const [key, allowed] of Object.entries(enums)) {
      if (allowed.includes(value[key])) defaults[key] = value[key]
    }
    const ranges = {
      doorbellNearCameraHeightRatio: [0.3, 0.9, 0.05], boundaryPositionRatio: [0.1, 0.9, 0.01],
      neutralZoneWidthRatio: [0, 0.2, 0.01], minimumConfidence: [0.2, 0.95, 0.05],
      samplingFps: [1, 10, 1], qrSamplingFps: [1, 10, 1], entryWindowSeconds: [5, 30, 1],
    }
    for (const [key, [min, max, step]] of Object.entries(ranges)) {
      const item = value[key]
      if (typeof item === 'number' && Number.isFinite(item) && item >= min && item <= max
        && Math.abs((item - min) / step - Math.round((item - min) / step)) < 1e-8) defaults[key] = item
    }
    return defaults
  } catch {
    return { ...DEFAULT_ENTRANCE_PREFERENCES }
  }
}

/** @param {string | null} serialized */
export function migrateRecordedFrontDoorPreferences(serialized) {
  const preferences = parseEntrancePreferences(serialized)
  if (preferences.entranceMode === 'doorbell'
    && preferences.doorbellExitSide === 'right'
    && preferences.doorbellNearCameraHeightRatio >= 0.85) {
    return { ...preferences, doorbellExitSide: 'left', doorbellNearCameraHeightRatio: 0.6 }
  }
  return preferences
}
