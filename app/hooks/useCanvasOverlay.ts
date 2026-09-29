'use client'

import { useEffect, useRef, RefObject } from 'react'
import { DetectionEvent } from '@/lib/types/events'
import { ProcessorResult } from '@/lib/video-processors/types'
import { getContainedVideoRect } from '@/lib/video-processors/processingCore.mjs'

interface UseCanvasOverlayOptions {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  events: DetectionEvent[]
  results: Map<string, ProcessorResult>
  showDebug?: boolean
}

/**
 * Draws generic bounding boxes from Ring events and PassFlow processors.
 */
export function useCanvasOverlay({
  videoRef,
  canvasRef,
  events,
  results,
  showDebug = false,
}: UseCanvasOverlayOptions) {
  const eventsRef = useRef(events)
  const resultsRef = useRef(results)

  useEffect(() => { eventsRef.current = events }, [events])
  useEffect(() => { resultsRef.current = results }, [results])

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const context = canvas.getContext('2d')
    if (!context) return

    let animationId: number

    const draw = () => {
      canvas.width = video.clientWidth
      canvas.height = video.clientHeight
      context.clearRect(0, 0, canvas.width, canvas.height)

      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight
      if (videoWidth <= 0 || videoHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) {
        animationId = requestAnimationFrame(draw)
        return
      }
      // The video uses object-contain, so map video pixels to the centered visible area.
      const rect = getContainedVideoRect(canvas.width, canvas.height, videoWidth, videoHeight)
      if (!rect) {
        animationId = requestAnimationFrame(draw)
        return
      }
      const x = (value: number) => rect.x + value * rect.scale
      const y = (value: number) => rect.y + value * rect.scale

      const eventBoxes = eventsRef.current
        .filter((event) => event.bounding_box)
        .slice(0, 5)
        .map((event) => ({
          ...event.bounding_box!,
          label: event.event_type,
          confidence: event.confidence,
          color: '#0d9488',
        }))

      const processorBoxes = Array.from(resultsRef.current.values())
        .flatMap((result) => result.boundingBoxes || [])
        .filter((box) => showDebug || !box.debugOnly)

      const processorLines = Array.from(resultsRef.current.values())
        .flatMap((result) => result.overlayLines || [])
        .filter((line) => showDebug || !line.debugOnly)

      for (const line of processorLines) {
        context.save()
        context.strokeStyle = line.color || '#f59e0b'
        context.fillStyle = context.strokeStyle
        context.lineWidth = 2
        context.setLineDash(line.dashed ? [8, 6] : [])
        context.beginPath()
        context.moveTo(x(line.x1), y(line.y1))
        context.lineTo(x(line.x2), y(line.y2))
        context.stroke()
        if (line.label) {
          context.font = '12px ui-monospace, monospace'
          context.fillText(line.label, x(line.x1) + 6, y(line.y1) - 7)
        }
        context.restore()
      }

      for (const box of [...eventBoxes, ...processorBoxes]) {
        context.strokeStyle = box.color || '#0d9488'
        context.lineWidth = 2
        context.strokeRect(
          x(box.x),
          y(box.y),
          box.width * rect.scale,
          box.height * rect.scale
        )

        if (box.label) {
          const confidence = box.confidence
            ? ` ${(box.confidence * 100).toFixed(0)}%`
            : ''
          context.fillStyle = context.strokeStyle
          context.font = '12px ui-monospace, monospace'
          context.fillText(`${box.label}${confidence}`, x(box.x), y(box.y) - 5)
        }
      }

      animationId = requestAnimationFrame(draw)
    }

    animationId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationId)
  }, [canvasRef, showDebug, videoRef])
}
