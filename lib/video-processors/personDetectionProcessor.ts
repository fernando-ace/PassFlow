import { processorRegistry } from './registry'
import type { BoundingBox, ProcessorResult, VideoProcessor } from './types'

export const PERSON_DETECTION_PROCESSOR_ID = 'passflow-person-detection'

export const PERSON_DETECTION_CONFIG = {
  minimumConfidence: 0.55,
  minimumInferenceIntervalMs: 500,
  modelBase: 'lite_mobilenet_v2' as const,
}

interface CocoPrediction {
  bbox: [number, number, number, number]
  class: string
  score: number
}

interface CocoModel {
  detect(input: ImageData): Promise<CocoPrediction[]>
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
 * Browser-only COCO-SSD processor. The lightweight MobileNet model is loaded
 * lazily so server routes and production startup do not pay its initialization
 * cost until video processing actually begins.
 */
export class PersonDetectionProcessor implements VideoProcessor {
  id = PERSON_DETECTION_PROCESSOR_ID
  name = 'Person detection'
  description = 'Detects people in sampled video frames without identifying them.'
  enabled = true

  private model: CocoModel | null = null
  private initialization: Promise<void> | null = null
  private lastInferenceAt = Number.NEGATIVE_INFINITY
  private readonly minimumConfidence: number
  private readonly minimumInferenceIntervalMs: number
  private readonly now: () => number
  private readonly loadModelOverride?: LoadCocoModel

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

    this.initialization = this.loadModel()
      .then((model) => { this.model = model })
      .finally(() => { this.initialization = null })

    return this.initialization
  }

  async process(frame: ImageData): Promise<ProcessorResult | null> {
    const now = this.now()
    if (now - this.lastInferenceAt < this.minimumInferenceIntervalMs) return null
    this.lastInferenceAt = now

    await this.init()
    if (!this.model) return null

    const startedAt = performance.now()
    const predictions = await this.model.detect(frame)
    const people = predictions.filter((prediction) => (
      prediction.class === 'person' && prediction.score >= this.minimumConfidence
    ))
    const boundingBoxes: BoundingBox[] = people.map((prediction) => ({
      x: prediction.bbox[0],
      y: prediction.bbox[1],
      width: prediction.bbox[2],
      height: prediction.bbox[3],
      label: 'Person',
      confidence: prediction.score,
      color: '#0d9488',
    }))

    return {
      id: `${this.id}-${now}`,
      processorId: this.id,
      timestamp: now,
      boundingBoxes,
      data: {
        peopleDetected: boundingBoxes.length,
        inferenceMs: Math.round(performance.now() - startedAt),
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
    this.lastInferenceAt = Number.NEGATIVE_INFINITY
  }

  private async loadModel(): Promise<CocoModel> {
    if (this.loadModelOverride) {
      return this.loadModelOverride({ base: PERSON_DETECTION_CONFIG.modelBase })
    }

    const tf = await import('@tensorflow/tfjs-core')
    await import('@tensorflow/tfjs-backend-webgl')
    const cocoSsd = await import('@tensorflow-models/coco-ssd')

    await tf.setBackend('webgl')
    await tf.ready()
    return cocoSsd.load({ base: PERSON_DETECTION_CONFIG.modelBase }) as Promise<CocoModel>
  }
}

export function ensurePersonDetectionProcessorRegistered() {
  if (!processorRegistry.get(PERSON_DETECTION_PROCESSOR_ID)) {
    processorRegistry.register(new PersonDetectionProcessor())
  }
}
