'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { processorRegistry } from './registry'
import { ProcessorResult, VideoProcessor } from './types'

interface UseVideoProcessingOptions {
  video: HTMLVideoElement | null
  canvas: HTMLCanvasElement | null
  enabled: boolean
  fps?: number
}

/**
 * Manages video frame processing pipeline.
 * Batches state updates to reduce re-renders (updates UI at 2Hz, processes at target FPS).
 */
export function useVideoProcessing({
  video,
  canvas,
  enabled,
  fps = 10,
}: UseVideoProcessingOptions) {
  const [displayResults, setDisplayResults] = useState<Map<string, ProcessorResult>>(new Map())
  const [processors, setProcessors] = useState<VideoProcessor[]>([])

  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const resultsRef = useRef<Map<string, ProcessorResult>>(new Map())

  // Subscribe to processor registry changes
  useEffect(() => {
    const update = () => setProcessors(processorRegistry.getAll())
    update()
    return processorRegistry.subscribe(update)
  }, [])

  // Create offscreen canvas for frame capture
  useEffect(() => {
    frameCanvasRef.current = document.createElement('canvas')
  }, [])

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

    const frameCanvas = frameCanvasRef.current!
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!
    const interval = 1000 / fps

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

      if (video.readyState < 2 || video.paused) {
        queueNextFrame()
        return
      }

      // Capture frame
      frameCanvas.width = video.videoWidth || 640
      frameCanvas.height = video.videoHeight || 480
      frameCtx.drawImage(video, 0, 0)

      const frame = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height)

      // Run enabled processors
      const enabledProcessors = processorRegistry.getEnabled()

      for (const processor of enabledProcessors) {
        try {
          const result = await processor.process(frame, canvas, video)
          if (result) {
            resultsRef.current.set(processor.id, result)
          }
        } catch (err) {
          console.error(`Processor ${processor.id} error:`, err)
        }
      }

      queueNextFrame()
    }

    animationId = requestAnimationFrame(processFrame)

    return () => {
      cancelled = true
      cancelAnimationFrame(animationId)
    }
  }, [enabled, video, canvas, fps])

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
