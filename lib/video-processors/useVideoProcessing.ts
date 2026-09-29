'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { processorRegistry } from './registry'
import { ProcessorResult, VideoProcessor } from './types'
import { createSingleFlightGate, resetVideoSource } from './processingCore.mjs'

interface UseVideoProcessingOptions {
  video: HTMLVideoElement | null
  canvas: HTMLCanvasElement | null
  enabled: boolean
  fps?: number
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
}: UseVideoProcessingOptions) {
  const [displayResults, setDisplayResults] = useState<Map<string, ProcessorResult>>(new Map())
  const [processors, setProcessors] = useState<VideoProcessor[]>([])

  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const resultsRef = useRef<Map<string, ProcessorResult>>(new Map())
  const inferenceGateRef = useRef(createSingleFlightGate())

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
  }, [enabled, video])

  // Batch UI updates at 2Hz to reduce re-renders
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      setDisplayResults(new Map(resultsRef.current))
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

    let lastTime = 0
    let cancelled = false
    let animationId = 0

    const queueNextFrame = () => {
      if (!cancelled) animationId = requestAnimationFrame(processFrame)
    }

    const processFrame = async (timestamp: number) => {
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
      if (!inferenceGateRef.current.acquire()) {
        queueNextFrame()
        return
      }

      try {
        frameCanvas.width = video.videoWidth
        frameCanvas.height = video.videoHeight
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height)
        const frame = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height)

        for (const processor of activeProcessors) {
          try {
            const result = await processor.process(frame, canvas, video)
            if (cancelled) return
            if (result) resultsRef.current.set(processor.id, result)
            else resultsRef.current.delete(processor.id)
          } catch (err) {
            console.error(`Processor ${processor.id} error:`, err)
          }
        }
      } finally {
        inferenceGateRef.current.release()
      }
      queueNextFrame()
    }

    void Promise.all(activeProcessors.map((processor) => processor.init?.()))
      .catch((error) => {
        console.error('Video processor initialization failed:', error)
      })
      .finally(() => {
        if (!cancelled) animationId = requestAnimationFrame(processFrame)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(animationId)
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
  }
}
