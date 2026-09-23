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
    entered: track.entered,
  }
}

/**
 * Short-lived doorway tracker using greedy IoU/anchor matching. It deliberately
 * keeps no appearance or biometric information.
 */
export class DoorwayTracker {
  constructor(config = ENTRANCE_CONFIG) {
    this.config = config
    this.tracks = new Map()
    this.nextTrackId = 1
  }

  update(detections, timestamp, frameSize) {
    const activeTracks = [...this.tracks.values()]
    const diagonal = Math.hypot(frameSize.width, frameSize.height)
    const maximumDistance = diagonal * this.config.tracking.maximumCentroidDistanceRatio
    const candidates = []

    for (const track of activeTracks) {
      for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex += 1) {
        const detection = detections[detectionIndex]
        const anchor = anchorFor(detection)
        const iou = intersectionOverUnion(track.bbox, detection)
        const anchorDistance = distance(track.anchor, anchor)
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

      track.bbox = { ...detection }
      track.confidence = detection.confidence
      track.anchor = anchor
      track.lastSeenAt = timestamp
      track.missedFrames = 0

      if (currentSide !== 0) {
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
      if (track.missedFrames > this.config.tracking.maximumMissingFrames
        || timestamp - track.lastSeenAt > this.config.tracking.maximumMissingMs) {
        this.tracks.delete(track.id)
      }
    }

    for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex += 1) {
      if (matchedDetectionIndexes.has(detectionIndex)) continue
      const detection = detections[detectionIndex]
      const anchor = anchorFor(detection)
      const side = sideOfBoundary(anchor, frameSize, this.config.boundary)
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
        entered: false,
        lastNonZoneSide: side === 0 ? null : side,
      })
    }

    return {
      tracks: [...this.tracks.values()].filter((track) => track.missedFrames === 0).map(publicTrack),
      crossings,
    }
  }

  reset() {
    this.tracks.clear()
    this.nextTrackId = 1
  }
}

export const trackerMath = { anchorFor, intersectionOverUnion, sideOfBoundary }
