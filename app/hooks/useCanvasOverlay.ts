'use client'

import { useEffect, useRef, RefObject } from 'react'
import { DetectionEvent } from '@/lib/types/events'
import { ProcessorResult } from '@/lib/video-processors/types'

interface UseCanvasOverlayOptions {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  events: DetectionEvent[]
  results: Map<string, ProcessorResult>
}

/**
 * Draws generic bounding boxes from Ring events and future PassFlow processors.
 * The UI does not activate this pipeline until a later QR/CV milestone.
 */
export function useCanvasOverlay({ videoRef, canvasRef, events, results }: UseCanvasOverlayOptions) {
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

      const videoWidth = video.videoWidth || 1920
      const videoHeight = video.videoHeight || 1080
      const scaleX = canvas.width / videoWidth
      const scaleY = canvas.height / videoHeight

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

      for (const box of [...eventBoxes, ...processorBoxes]) {
        context.strokeStyle = box.color || '#0d9488'
        context.lineWidth = 2
        context.strokeRect(
          box.x * scaleX,
          box.y * scaleY,
          box.width * scaleX,
          box.height * scaleY
        )

        if (box.label) {
          const confidence = box.confidence
            ? ` ${(box.confidence * 100).toFixed(0)}%`
            : ''
          context.fillStyle = context.strokeStyle
          context.font = '12px ui-monospace, monospace'
          context.fillText(`${box.label}${confidence}`, box.x * scaleX, box.y * scaleY - 5)
        }
      }

      animationId = requestAnimationFrame(draw)
    }

    animationId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationId)
  }, [canvasRef, videoRef])
}
