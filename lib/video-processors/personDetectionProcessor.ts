import { processorRegistry } from './registry'
import type { BoundingBox, ProcessorResult, VideoProcessor } from './types'
import { ENTRANCE_CONFIG } from '@/lib/entrance/config.mjs'
import { DoorwayTracker } from '@/lib/entrance/trackerCore.mjs'
import { boxesOverlap, cropFrame } from './frameTools.mjs'

export const PERSON_DETECTION_PROCESSOR_ID = 'passflow-person-detection'

export const PERSON_DETECTION_CONFIG = {
  minimumConfidence: 0.4,
  minimumInferenceIntervalMs: 200,
  modelBase: 'mobilenet_v2' as const,
}

export type PersonDetectorStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface PersonCalibrationConfig {
  entranceMode: 'boundary' | 'doorbell'
  doorbellNearCameraHeightRatio: number
  doorbellExitSide: 'left' | 'right'
  boundaryPositionRatio: number
  enteringDirection: 'positive' | 'negative'
  neutralZoneWidthRatio: number
  minimumConfidence: number
  samplingFps: number
}

interface BoundaryConfig {
  orientation: 'horizontal' | 'vertical'
  positionRatio: number
  zoneHalfWidthRatio: number
  enteringDirection: 'positive' | 'negative'
}

interface CocoPrediction {
  bbox: [number, number, number, number]
  class: string
  score: number
}

interface CocoModel {
  detect(input: ImageData, maxNumBoxes: number, minScore: number): Promise<CocoPrediction[]>
  dispose(): void
}

type LoadCocoModel = (config: { base: typeof PERSON_DETECTION_CONFIG.modelBase }) => Promise<CocoModel>

export interface PersonDetectionProcessorOptions {
  minimumConfidence?: number
  minimumInferenceIntervalMs?: number
  now?: () => number
  loadModel?: LoadCocoModel
}

/**
 * Browser-only COCO-SSD processor. The live camera starts warming the
 * lightweight MobileNet model on mount so inference is ready before a crossing.
 */
export class PersonDetectionProcessor implements VideoProcessor {
  id = PERSON_DETECTION_PROCESSOR_ID
  name = 'Person detection'
  description = 'Detects people in sampled video frames without identifying them.'
  enabled = true

  private model: CocoModel | null = null
  private initialization: Promise<void> | null = null
  private lastInferenceAt = Number.NEGATIVE_INFINITY
  private minimumConfidence: number
  private minimumInferenceIntervalMs: number
  private readonly now: () => number
  private readonly loadModelOverride?: LoadCocoModel
  private tracker = new DoorwayTracker()
  private status: PersonDetectorStatus = 'idle'
  private statusError: string | null = null
  private statusListeners = new Set<() => void>()
  private boundary: BoundaryConfig = { ...ENTRANCE_CONFIG.boundary }
  private entranceMode: PersonCalibrationConfig['entranceMode'] = 'boundary'
  private doorbellNearCameraHeightRatio: number = ENTRANCE_CONFIG.doorbellNearCameraHeightRatio
  private sessionVersion = 0
  private sampleTimes: number[] = []
  private lastSampleAt: number | null = null

  constructor(options: PersonDetectionProcessorOptions = {}) {
    this.minimumConfidence = options.minimumConfidence ?? PERSON_DETECTION_CONFIG.minimumConfidence
    this.minimumInferenceIntervalMs = options.minimumInferenceIntervalMs
      ?? PERSON_DETECTION_CONFIG.minimumInferenceIntervalMs
    this.now = options.now ?? Date.now
    this.loadModelOverride = options.loadModel
  }

  async init() {
    if (this.model) return
    if (this.initialization) return this.initialization

    this.setStatus('loading')
    this.initialization = this.loadModel()
      .then((model) => {
        this.model = model
        this.setStatus('ready')
      })
      .catch((error) => {
        this.setStatus('error', error instanceof Error ? error.message : 'Vision model failed to load.')
        throw error
      })
      .finally(() => { this.initialization = null })

    return this.initialization
  }

  async process(frame: ImageData, _canvas?: HTMLCanvasElement, _video?: HTMLVideoElement,
    context?: { capturedAt: number; healthy: boolean }): Promise<ProcessorResult | null> {
    const now = context?.capturedAt ?? this.now()
    const session = this.sessionVersion
    if (now - this.lastInferenceAt < this.minimumInferenceIntervalMs) return null
    this.lastInferenceAt = now

    if (!this.model && this.status === 'error') return null
    await this.init()
    if (!this.model || session !== this.sessionVersion) return null

    const startedAt = performance.now()
    const predictions = await this.model.detect(frame, 30, this.minimumConfidence)
    const people = predictions.filter((prediction) => (
      prediction.class === 'person' && prediction.score >= this.minimumConfidence
    ))
    // Recover truncated/occluded people before interpreting their disappearance.
    let recoveryAttempts = 0
    let recoveryComplete = true
    for (const box of this.tracker.getRecoveryBoxes()) {
      if (people.some((p) => boxesOverlap(box, { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] }))) continue
      if (recoveryAttempts >= 2) { recoveryComplete = false; break }
      const crop = cropFrame(frame, box)
      if (!crop) continue
      recoveryAttempts += 1
      const recovered = await this.model.detect(new ImageData(crop.frame.data, crop.frame.width, crop.frame.height),
        10, Math.min(this.minimumConfidence, 0.2))
      for (const p of recovered.filter((p) => p.class === 'person')) {
        const translated = { x: p.bbox[0] + crop.x, y: p.bbox[1] + crop.y, width: p.bbox[2], height: p.bbox[3] }
        if (!boxesOverlap(box, translated)) continue
        if (people.some((other) => boxesOverlap(translated,
          { x: other.bbox[0], y: other.bbox[1], width: other.bbox[2], height: other.bbox[3] }))) continue
        people.push({ ...p, bbox: [translated.x, translated.y, translated.width, translated.height] })
      }
    }
    if (session !== this.sessionVersion) return null
    const detections: BoundingBox[] = people.map((prediction) => ({
      x: prediction.bbox[0],
      y: prediction.bbox[1],
      width: prediction.bbox[2],
      height: prediction.bbox[3],
      label: 'Person',
      confidence: prediction.score,
      color: '#0d9488',
    }))
    const healthy = recoveryComplete && (context?.healthy ?? true) && (this.lastSampleAt === null
      || now - this.lastSampleAt <= Math.max(ENTRANCE_CONFIG.maximumSampleGapMs, this.minimumInferenceIntervalMs * 1.5))
    this.lastSampleAt = now
    this.sampleTimes = [...this.sampleTimes.filter((time) => now - time < 2_000), now]
    const actualFps = this.sampleTimes.length > 1
      ? (this.sampleTimes.length - 1) * 1_000 / Math.max(1, now - this.sampleTimes[0]) : 0
    const tracking = this.tracker.update(detections, now, {
      width: frame.width,
      height: frame.height,
    }, healthy)
    const boundingBoxes: BoundingBox[] = tracking.tracks.filter((track) => track.fresh).map((track) => ({
      ...track.bbox,
      label: track.nearCamera ? `Person #${track.id} · Near camera` : `Person #${track.id}`,
      confidence: track.confidence,
      color: track.entered ? '#059669' : track.nearCamera ? '#f59e0b' : '#0d9488',
      debugOnly: true,
    }))
    const boundaryPosition = this.boundary.orientation === 'horizontal'
      ? frame.height * this.boundary.positionRatio
      : frame.width * this.boundary.positionRatio
    const neutralOffset = (this.boundary.orientation === 'horizontal' ? frame.height : frame.width)
      * this.boundary.zoneHalfWidthRatio
    const overlayLines = this.entranceMode === 'doorbell' ? [] : this.boundary.orientation === 'horizontal'
      ? [{
          x1: 0,
          y1: boundaryPosition,
          x2: frame.width,
          y2: boundaryPosition,
          label: 'Entrance boundary',
          color: '#f59e0b',
          dashed: true,
          debugOnly: true,
        }, {
          x1: 0, y1: boundaryPosition - neutralOffset, x2: frame.width, y2: boundaryPosition - neutralOffset,
          color: '#fbbf24', dashed: true, debugOnly: true,
        }, {
          x1: 0, y1: boundaryPosition + neutralOffset, x2: frame.width, y2: boundaryPosition + neutralOffset,
          color: '#fbbf24', dashed: true, debugOnly: true,
        }]
      : [{
          x1: boundaryPosition,
          y1: 0,
          x2: boundaryPosition,
          y2: frame.height,
          label: 'Entrance boundary',
          color: '#f59e0b',
          dashed: true,
          debugOnly: true,
        }, {
          x1: boundaryPosition - neutralOffset, y1: 0, x2: boundaryPosition - neutralOffset, y2: frame.height,
          color: '#fbbf24', dashed: true, debugOnly: true,
        }, {
          x1: boundaryPosition + neutralOffset, y1: 0, x2: boundaryPosition + neutralOffset, y2: frame.height,
          color: '#fbbf24', dashed: true, debugOnly: true,
        }]

    return {
      id: `${this.id}-${now}`,
      processorId: this.id,
      timestamp: now,
      boundingBoxes,
      overlayLines,
      data: {
        peopleDetected: people.length,
        entranceMode: this.entranceMode,
        tracks: tracking.tracks,
        crossings: tracking.crossings,
        inferenceMs: Math.round(performance.now() - startedAt),
        samplingFps: Math.round((1_000 / this.minimumInferenceIntervalMs) * 10) / 10,
        actualFps: Math.round(actualFps * 10) / 10,
        healthy,
        recoveryAttempts,
      },
      message: boundingBoxes.length === 1
        ? '1 person detected'
        : `${boundingBoxes.length} people detected`,
    }
  }

  async destroy() {
    await this.initialization
    this.model?.dispose()
    this.model = null
    this.resetSession()
    this.setStatus('idle')
  }

  resetSession() {
    this.sessionVersion += 1
    this.tracker.reset()
    this.sampleTimes = []
    this.lastSampleAt = null
    this.lastInferenceAt = Number.NEGATIVE_INFINITY
  }

  configure(config: PersonCalibrationConfig) {
    this.resetSession()
    this.entranceMode = config.entranceMode
    this.doorbellNearCameraHeightRatio = config.doorbellNearCameraHeightRatio
    this.minimumConfidence = config.minimumConfidence
    this.minimumInferenceIntervalMs = 1_000 / config.samplingFps
    this.boundary = {
      ...this.boundary,
      positionRatio: config.boundaryPositionRatio,
      enteringDirection: config.enteringDirection,
      zoneHalfWidthRatio: config.neutralZoneWidthRatio / 2,
    }
    this.tracker.configure({
      mode: this.entranceMode,
      doorbellNearCameraHeightRatio: this.doorbellNearCameraHeightRatio,
      doorbellExitSide: config.doorbellExitSide,
      boundary: { ...this.boundary },
      tracking: ENTRANCE_CONFIG.tracking,
      maximumSampleGapMs: Math.max(ENTRANCE_CONFIG.maximumSampleGapMs, this.minimumInferenceIntervalMs * 1.5),
    })
    this.lastInferenceAt = Number.NEGATIVE_INFINITY
  }

  getStatus() {
    return { status: this.status, error: this.statusError }
  }

  getSessionVersion() { return this.sessionVersion }

  subscribeStatus(listener: () => void) {
    this.statusListeners.add(listener)
    return () => { this.statusListeners.delete(listener) }
  }

  private setStatus(status: PersonDetectorStatus, error: string | null = null) {
    this.status = status
    this.statusError = error
    this.statusListeners.forEach((listener) => listener())
  }

  private async loadModel(): Promise<CocoModel> {
    if (this.loadModelOverride) {
      return this.loadModelOverride({ base: PERSON_DETECTION_CONFIG.modelBase })
    }

    const tf = await import('@tensorflow/tfjs-core')
    await import('@tensorflow/tfjs-backend-cpu')
    await import('@tensorflow/tfjs-backend-webgl')
    const cocoSsd = await import('@tensorflow-models/coco-ssd')

    try {
      if (!await tf.setBackend('webgl')) await tf.setBackend('cpu')
    } catch {
      await tf.setBackend('cpu')
    }
    await tf.ready()
    return cocoSsd.load({ base: PERSON_DETECTION_CONFIG.modelBase }) as Promise<CocoModel>
  }
}

export function ensurePersonDetectionProcessorRegistered() {
  if (!processorRegistry.get(PERSON_DETECTION_PROCESSOR_ID)) {
    processorRegistry.register(new PersonDetectionProcessor())
  }
}

export function getPersonDetectionProcessor() {
  return processorRegistry.get(PERSON_DETECTION_PROCESSOR_ID) as PersonDetectionProcessor | undefined
}
