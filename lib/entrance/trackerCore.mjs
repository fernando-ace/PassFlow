import { ENTRANCE_CONFIG } from './config.mjs'

function anchorFor(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height,
  }
}

function intersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  if (!intersection) return 0
  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function sideOfBoundary(anchor, frameSize, boundary) {
  const extent = boundary.orientation === 'horizontal' ? frameSize.height : frameSize.width
  const value = boundary.orientation === 'horizontal' ? anchor.y : anchor.x
  const center = extent * boundary.positionRatio
  const halfWidth = extent * boundary.zoneHalfWidthRatio
  if (value < center - halfWidth) return -1
  if (value > center + halfWidth) return 1
  return 0
}

function isEnteringTransition(previousSide, currentSide, direction) {
  return direction === 'positive'
    ? previousSide === -1 && currentSide === 1
    : previousSide === 1 && currentSide === -1
}

function publicTrack(track) {
  return {
    id: track.id,
    bbox: { ...track.bbox },
    confidence: track.confidence,
    anchor: { ...track.anchor },
    firstSeenAt: track.firstSeenAt,
    lastSeenAt: track.lastSeenAt,
    missedFrames: track.missedFrames,
    nearCamera: track.nearCamera,
    entered: track.entered,
    fresh: track.missedFrames === 0,
    phase: track.phase,
    velocity: { ...track.velocity },
  }
}

/**
 * Short-lived doorway tracker using greedy IoU/anchor matching. It deliberately
 * keeps no appearance or biometric information.
 */
export class DoorwayTracker {
  constructor(config = ENTRANCE_CONFIG) {
    this.config = {
      ...ENTRANCE_CONFIG,
      ...config,
      boundary: { ...ENTRANCE_CONFIG.boundary, ...config.boundary },
      tracking: { ...ENTRANCE_CONFIG.tracking, ...config.tracking },
    }
    this.tracks = new Map()
    this.nextTrackId = 1
    this.lastUpdateAt = null
  }

  update(detections, timestamp, frameSize, healthy = true) {
    const continuous = healthy && (this.lastUpdateAt === null
      || timestamp - this.lastUpdateAt <= this.config.maximumSampleGapMs)
    const elapsed = continuous && this.lastUpdateAt !== null ? Math.max(0, timestamp - this.lastUpdateAt) : 0
    this.lastUpdateAt = timestamp
    if (!continuous) this.interrupt()
    for (const track of this.tracks.values()) {
      const lifetime = this.config.mode === 'boundary' ? this.config.tracking.maximumMissingMs
        : Math.max(this.config.tracking.maximumMissingMs, this.config.disappearanceMs + this.config.maximumSampleGapMs)
      if (timestamp - track.lastSeenAt > lifetime && track.phase !== 'absence-pending') this.tracks.delete(track.id)
    }
    const activeTracks = [...this.tracks.values()]
    const diagonal = Math.hypot(frameSize.width, frameSize.height)
    const maximumDistance = diagonal * this.config.tracking.maximumCentroidDistanceRatio
    const candidates = []

    for (const track of activeTracks) {
      for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex += 1) {
        const detection = detections[detectionIndex]
        const anchor = anchorFor(detection)
        const iou = intersectionOverUnion(track.bbox, detection)
        const predictionMs = Math.min(500, Math.max(0, timestamp - track.lastSeenAt))
        const predictedAnchor = {
          x: track.anchor.x + track.velocity.x * predictionMs,
          y: track.anchor.y + track.velocity.y * predictionMs,
        }
        const anchorDistance = Math.min(distance(track.anchor, anchor), distance(predictedAnchor, anchor))
        if (iou < this.config.tracking.minimumIou && anchorDistance > maximumDistance) continue
        candidates.push({
          track,
          detectionIndex,
          score: iou * 2 + Math.max(0, 1 - anchorDistance / maximumDistance),
        })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const matchedTrackIds = new Set()
    const matchedDetectionIndexes = new Set()
    const matches = []

    for (const candidate of candidates) {
      if (matchedTrackIds.has(candidate.track.id)
        || matchedDetectionIndexes.has(candidate.detectionIndex)) continue
      matchedTrackIds.add(candidate.track.id)
      matchedDetectionIndexes.add(candidate.detectionIndex)
      matches.push(candidate)
    }

    const crossings = []
    for (const { track, detectionIndex } of matches) {
      const detection = detections[detectionIndex]
      const anchor = anchorFor(detection)
      const currentSide = sideOfBoundary(anchor, frameSize, this.config.boundary)
      const previousNonZoneSide = track.lastNonZoneSide
      const previousBox = track.bbox
      const deltaMs = Math.max(1, timestamp - track.lastSeenAt)
      const deltaX = anchor.x - track.anchor.x
      const wasAbsencePending = track.phase === 'absence-pending'
      track.velocity = { x: deltaX / deltaMs, y: (anchor.y - track.anchor.y) / deltaMs }
      track.absentMs = 0
      track.departureAt = null

      if (this.config.mode === 'doorbell') {
        const near = detection.height / frameSize.height >= this.config.doorbellNearCameraHeightRatio
        const retreating = detection.height < previousBox.height * 0.85
        const sign = this.config.doorbellExitSide === 'left' ? -1 : 1
        const towardDoor = deltaX * sign > frameSize.width * 0.005
        const movingBackFromDoor = deltaX * sign < -frameSize.width * 0.025
        const atEdge = sign > 0
          ? detection.x + detection.width >= frameSize.width * 0.9
          : detection.x <= frameSize.width * 0.1
        if (wasAbsencePending) {
          // Reacquisition cancels the absence timer and requires fresh exit evidence.
          track.departureArmed = false
          track.phase = 'approaching'
          track.closeStartedAt = null
          track.closeSamples = 0
        }
        if (movingBackFromDoor || (retreating && !towardDoor)) {
          track.departureArmed = false
          track.closeStartedAt = null
          track.closeSamples = 0
          track.phase = 'approaching'
        }
        track.approached ||= detection.height >= track.initialHeight * 1.15
        if (near && (!retreating || towardDoor)) {
          track.closeStartedAt ??= timestamp
          track.closeSamples += 1
          if (track.approached && track.closeSamples >= this.config.closePresenceSamples
            && timestamp - track.closeStartedAt >= this.config.closePresenceMs) {
            track.phase = 'close'
            if (atEdge && towardDoor) track.departureArmed = true
          }
        }
        // Edge departure is a latched observation: slowing at the edge or a
        // brief loss of detections must not erase the evidence already seen.
        if (track.departureArmed && !wasAbsencePending) track.phase = 'edge-departure'
        track.nearCamera = near
      }

      track.bbox = { ...detection }
      track.confidence = detection.confidence
      track.anchor = anchor
      track.lastSeenAt = timestamp
      track.missedFrames = 0

      if (this.config.mode === 'boundary' && currentSide !== 0) {
        if (!track.entered && previousNonZoneSide !== null && isEnteringTransition(
          previousNonZoneSide,
          currentSide,
          this.config.boundary.enteringDirection,
        )) {
          track.entered = true
          crossings.push({ trackId: track.id, direction: 'entering', timestamp })
        }
        track.lastNonZoneSide = currentSide
      }
    }

    for (const track of activeTracks) {
      if (matchedTrackIds.has(track.id)) continue
      track.missedFrames += 1
      if (this.config.mode === 'doorbell' && continuous && !track.entered) {
        const blocked = detections.some((box) => this.config.doorbellExitSide === 'left'
          ? box.x <= frameSize.width * 0.15
          : box.x + box.width >= frameSize.width * 0.85)
        if (blocked) track.phase = 'unconfirmed'
        if (track.departureArmed && track.phase === 'edge-departure') {
          track.phase = 'absence-pending'
          track.departureAt = timestamp
          track.absentMs = 0
        } else if (track.phase === 'absence-pending') {
          track.absentMs += elapsed
        }
        if (track.phase === 'absence-pending' && track.absentMs >= this.config.disappearanceMs) {
          track.entered = true
          track.departureArmed = false
          track.phase = 'inferred-entry'
          crossings.push({ trackId: track.id, direction: 'entering', timestamp: track.departureAt,
            confirmedAt: timestamp, evidence: 'inferred' })
        }
      }
    }

    for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex += 1) {
      if (matchedDetectionIndexes.has(detectionIndex)) continue
      const detection = detections[detectionIndex]
      const anchor = anchorFor(detection)
      const side = this.config.mode === 'boundary'
        ? sideOfBoundary(anchor, frameSize, this.config.boundary)
        : 0
      const id = this.nextTrackId
      this.nextTrackId += 1
      this.tracks.set(id, {
        id,
        bbox: { ...detection },
        confidence: detection.confidence,
        anchor,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        missedFrames: 0,
        velocity: { x: 0, y: 0 },
        initialHeight: detection.height,
        approached: false,
        closeStartedAt: null,
        closeSamples: 0,
        absentMs: 0,
        departureAt: null,
        departureArmed: false,
        phase: 'approaching',
        entered: false,
        nearCamera: this.config.mode === 'doorbell'
          && detection.height / frameSize.height >= this.config.doorbellNearCameraHeightRatio,
        lastNonZoneSide: side === 0 ? null : side,
      })
    }

    return {
      tracks: [...this.tracks.values()].map(publicTrack),
      crossings,
    }
  }

  reset() {
    this.tracks.clear()
    this.lastUpdateAt = null
  }

  interrupt() {
    for (const track of this.tracks.values()) {
      track.phase = 'unconfirmed'
      track.closeStartedAt = null
      track.closeSamples = 0
      track.absentMs = 0
      track.departureAt = null
      track.departureArmed = false
      track.lastNonZoneSide = null
    }
  }

  getRecoveryBoxes() {
    return [...this.tracks.values()].filter((track) => !track.entered).map((track) => ({ ...track.bbox }))
  }

  configure(config) {
    this.config = {
      ...this.config,
      ...config,
      boundary: { ...this.config.boundary, ...config.boundary },
      tracking: { ...this.config.tracking, ...config.tracking },
    }
    this.reset()
  }
}

export const trackerMath = { anchorFor, intersectionOverUnion, sideOfBoundary }
