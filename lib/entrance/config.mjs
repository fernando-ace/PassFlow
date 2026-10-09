export const ENTRANCE_CONFIG = Object.freeze({
  mode: 'boundary',
  doorbellNearCameraHeightRatio: 0.65,
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
