export const ENTRANCE_CONFIG = Object.freeze({
  mode: 'boundary',
  doorbellNearCameraHeightRatio: 0.6,
  doorbellExitSide: 'left',
  closePresenceMs: 600,
  closePresenceSamples: 3,
  disappearanceMs: 3_000,
  maximumSampleGapMs: 1_000,
  boundary: Object.freeze({
    orientation: 'horizontal',
    positionRatio: 0.62,
    zoneHalfWidthRatio: 0.035,
    enteringDirection: 'positive',
  }),
  tracking: Object.freeze({
    minimumIou: 0.1,
    maximumCentroidDistanceRatio: 0.18,
    maximumMissingFrames: 3,
    maximumMissingMs: 2_000,
  }),
})
