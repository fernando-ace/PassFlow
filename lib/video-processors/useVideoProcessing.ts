'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { processorRegistry } from './registry'
import { ProcessorResult, VideoProcessor } from './types'
import { createFrameClock, createResultLane, resetVideoSource } from './processingCore.mjs'

interface UseVideoProcessingOptions {
  video: HTMLVideoElement | null
  canvas: HTMLCanvasElement | null
  enabled: boolean
  fps?: number
  onResult?: (result: ProcessorResult) => void
}

/**
 * Manages video frame processing pipeline.
 * Batches state updates to reduce re-renders (updates UI at 2Hz, processes at target FPS).
 * Processor resources outlive an individual stream so expensive models stay warm.
 */
export function useVideoProcessing({
  video,
  canvas,
  enabled,
  fps = 2,
  onResult,
}: UseVideoProcessingOptions) {
  const [displayResults, setDisplayResults] = useState<Map<string, ProcessorResult>>(new Map())
  const [processors, setProcessors] = useState<VideoProcessor[]>([])

  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const resultsRef = useRef<Map<string, ProcessorResult>>(new Map())
  const lanesRef = useRef(new Map<string, ReturnType<typeof createResultLane>>())
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const [streamFresh, setStreamFresh] = useState(false)
  const lastCaptureRef = useRef(0)

  // Subscribe to processor registry changes
  useEffect(() => {
    const update = () => setProcessors(processorRegistry.getAll())
    update()
    return processorRegistry.subscribe(update)
  }, [])

  // Create offscreen canvas for frame capture
  useEffect(() => {
    frameCanvasRef.current = document.createElement('canvas')
    return () => { frameCanvasRef.current = null }
  }, [])

  useEffect(() => {
    if (enabled && video) return
    resetVideoSource([], resultsRef.current)
    setDisplayResults(new Map())
    setStreamFresh(false)
  }, [enabled, video])

  // Batch UI updates at 2Hz to reduce re-renders
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      const now = Date.now()
      setDisplayResults(new Map(Array.from(resultsRef.current).filter(([, result]) => now - result.timestamp < 1_500)))
      setStreamFresh(now - lastCaptureRef.current < 1_000)
    }, 500)

    return () => clearInterval(interval)
  }, [enabled])

  // Main processing loop
  useEffect(() => {
    if (!enabled || !video || !canvas) {
      return
    }

    const frameCanvas = frameCanvasRef.current
    const frameCtx = frameCanvas?.getContext('2d', { willReadFrequently: true })
    if (!frameCanvas || !frameCtx) return
    const interval = 1000 / fps
    const activeProcessors = processors.filter((processor) => processor.enabled)
    const clock = createFrameClock()
    const hasFrameCallbacks = typeof video.requestVideoFrameCallback === 'function'
    let presentedFrames = 0
    let presentedAt = 0
    let frameCallbackId = 0
    const observeFrame = (_time: number, metadata: VideoFrameCallbackMetadata) => {
      presentedFrames = metadata.presentedFrames
      presentedAt = Date.now()
      if (!cancelled) frameCallbackId = video.requestVideoFrameCallback(observeFrame)
    }

    let lastTime = 0
    let cancelled = false
    let animationId = 0

    const queueNextFrame = () => {
      if (!cancelled) animationId = requestAnimationFrame(processFrame)
    }

    const processFrame = (timestamp: number) => {
      if (cancelled) return

      if (timestamp - lastTime < interval) {
        queueNextFrame()
        return
      }
      lastTime = timestamp

      if (video.readyState < 2 || video.paused || video.videoWidth <= 0 || video.videoHeight <= 0) {
        queueNextFrame()
        return
      }
      const now = Date.now()
      const qualityFrames = video.getVideoPlaybackQuality?.().totalVideoFrames
      const frameIdentity = hasFrameCallbacks ? presentedFrames : qualityFrames ?? video.currentTime
      if (hasFrameCallbacks && presentedFrames === 0) { queueNextFrame(); return }
      const context = clock.sample(frameIdentity, now)
      if (!context) {
        queueNextFrame()
        return
      }

      try {
        const freshnessVerified = hasFrameCallbacks ? now - presentedAt < 1_000 : typeof qualityFrames === 'number'
        context.healthy &&= freshnessVerified
        if (freshnessVerified) lastCaptureRef.current = context.capturedAt
        if (frameCanvas.width !== video.videoWidth) frameCanvas.width = video.videoWidth
        if (frameCanvas.height !== video.videoHeight) frameCanvas.height = video.videoHeight
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height)
        const frame = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height)

        for (const processor of activeProcessors) {
          let lane = lanesRef.current.get(processor.id)
          if (!lane) { lane = createResultLane(); lanesRef.current.set(processor.id, lane) }
          const session = processor.getSessionVersion?.()
          void lane.run(() => processor.process(frame, canvas, video, context), (result: ProcessorResult) => {
            if (cancelled) return
            resultsRef.current.set(processor.id, result)
            onResultRef.current?.(result)
          }, (err: unknown) => {
            processor.resetSession?.()
            resultsRef.current.delete(processor.id)
            console.error(`Processor ${processor.id} error:`, err)
          }, () => !cancelled && processor.getSessionVersion?.() === session)
        }
      } catch (err) {
        activeProcessors.forEach((processor) => processor.resetSession?.())
        console.error('Video frame capture failed:', err)
      }
      queueNextFrame()
    }

    activeProcessors.forEach((processor) => {
      void processor.init?.().catch((error) => console.error('Video processor initialization failed:', error))
    })
    if (hasFrameCallbacks) frameCallbackId = video.requestVideoFrameCallback(observeFrame)
    animationId = requestAnimationFrame(processFrame)

    return () => {
      cancelled = true
      cancelAnimationFrame(animationId)
      if (hasFrameCallbacks) video.cancelVideoFrameCallback(frameCallbackId)
      lanesRef.current.forEach((lane) => lane.reset())
      resetVideoSource(activeProcessors, resultsRef.current)
    }
  }, [enabled, video, canvas, fps, processors])

  const toggleProcessor = useCallback((id: string) => {
    const processor = processorRegistry.get(id)
    if (processor) {
      const newEnabled = !processor.enabled
      processorRegistry.setEnabled(id, newEnabled)
      
      // Clear results when processor is disabled
      if (!newEnabled) {
        resultsRef.current.delete(id)
        setDisplayResults(new Map(resultsRef.current))
      }
    }
  }, [])

  return {
    processors,
    results: displayResults,
    toggleProcessor,
    enabledCount: processors.filter(p => p.enabled).length,
    streamFresh,
  }
}
