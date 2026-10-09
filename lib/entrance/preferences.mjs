export const ENTRANCE_PREFERENCES_STORAGE_KEY = 'passflow.entrance-preferences.v1'

export const DEFAULT_ENTRANCE_PREFERENCES = Object.freeze({
  entranceMode: 'boundary',
  doorbellNearCameraHeightRatio: 0.65,
})

/** @param {string | null} serialized */
export function parseEntrancePreferences(serialized) {
  if (typeof serialized !== 'string') return { ...DEFAULT_ENTRANCE_PREFERENCES }

  try {
    const value = JSON.parse(serialized)
    const ratio = value?.doorbellNearCameraHeightRatio
    const isValidRatio = typeof ratio === 'number'
      && ratio >= 0.3
      && ratio <= 0.9
      && Math.abs((ratio - 0.3) / 0.05 - Math.round((ratio - 0.3) / 0.05)) < 1e-8
    if ((value?.entranceMode !== 'boundary' && value?.entranceMode !== 'doorbell') || !isValidRatio) {
      return { ...DEFAULT_ENTRANCE_PREFERENCES }
    }
    return {
      entranceMode: value.entranceMode,
      doorbellNearCameraHeightRatio: ratio,
    }
  } catch {
    return { ...DEFAULT_ENTRANCE_PREFERENCES }
  }
}
