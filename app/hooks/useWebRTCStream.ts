'use client'

import { useState, useRef, useCallback, useEffect, RefObject } from 'react'

interface UseWebRTCStreamOptions {
  videoRef: RefObject<HTMLVideoElement>
  deviceId?: string
}

interface UseWebRTCStreamReturn {
  streamActive: boolean
  streamStarting: boolean
  streamError: string | null
  startStream: () => Promise<void>
  stopStream: () => Promise<void>
}

/** Manages one Ring WHEP session and its browser-side media resources. */
export function useWebRTCStream({ videoRef, deviceId }: UseWebRTCStreamOptions): UseWebRTCStreamReturn {
  const [streamActive, setStreamActive] = useState(false)
  const [streamStarting, setStreamStarting] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sessionUrlRef = useRef<string | null>(null)
  const attemptRef = useRef(0)
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current)
    connectionTimeoutRef.current = null
  }, [])

  const releaseRingSession = useCallback(async () => {
    const sessionUrl = sessionUrlRef.current
    sessionUrlRef.current = null
    if (!sessionUrl) return
    await fetch('/api/ring/stream', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionUrl }),
    }).catch(() => undefined)
  }, [])

  const closePeerConnection = useCallback(() => {
    clearConnectionTimeout()
    const video = videoRef.current
    if (video) {
      video.onplaying = null
      video.srcObject = null
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    if (pcRef.current) {
      pcRef.current.ontrack = null
      pcRef.current.onconnectionstatechange = null
      pcRef.current.close()
    }
    pcRef.current = null
  }, [clearConnectionTimeout, videoRef])

  const failStream = useCallback((message: string, pc?: RTCPeerConnection) => {
    if (pc && pcRef.current !== pc) return
    setStreamError(message)
    setStreamActive(false)
    setStreamStarting(false)
    closePeerConnection()
    void releaseRingSession()
  }, [closePeerConnection, releaseRingSession])

  const startStream = useCallback(async () => {
    if (!deviceId || pcRef.current) return
    const attempt = ++attemptRef.current
    setStreamStarting(true)
    setStreamActive(false)
    setStreamError(null)
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      })
      pcRef.current = pc
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.ontrack = (event) => {
        if (pcRef.current !== pc || attemptRef.current !== attempt) return
        const stream = event.streams[0] ?? new MediaStream([event.track])
        mediaStreamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.onplaying = () => {
          if (pcRef.current !== pc || attemptRef.current !== attempt) return
          clearConnectionTimeout()
          setStreamActive(true)
          setStreamStarting(false)
        }
        event.track.onended = () => failStream('The Ring video track ended. Start live view again to reconnect.', pc)
        void video.play().catch(() => {
          setStreamError('The browser blocked Ring video playback. Use the video playback controls or allow autoplay, then restart live view.')
        })
      }

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return
        if (pc.connectionState === 'failed') {
          failStream('The Ring live view connection failed. Check that the camera is online, then try again.', pc)
        } else if (pc.connectionState === 'disconnected') {
          clearConnectionTimeout()
          connectionTimeoutRef.current = setTimeout(() => {
            if (pc.connectionState === 'disconnected') {
              failStream('The Ring live view disconnected. Restart the stream to reconnect.', pc)
            }
          }, 5000)
        }
      }

      const offer = await pc.createOffer()
      if (attemptRef.current !== attempt) return
      await pc.setLocalDescription(offer)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve()
        const timeout = setTimeout(resolve, 5000)
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        }
      })
      if (attemptRef.current !== attempt || pcRef.current !== pc) return

      const response = await fetch('/api/ring/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdpOffer: pc.localDescription?.sdp, deviceId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Ring stream session could not be created.')
      if (attemptRef.current !== attempt || pcRef.current !== pc) {
        if (typeof payload.sessionUrl === 'string') {
          sessionUrlRef.current = payload.sessionUrl
          await releaseRingSession()
        }
        return
      }
      if (typeof payload.sdpAnswer !== 'string') throw new Error('Ring returned an invalid stream response.')
      sessionUrlRef.current = typeof payload.sessionUrl === 'string' ? payload.sessionUrl : null
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdpAnswer })
      connectionTimeoutRef.current = setTimeout(() => {
        failStream('Ring accepted the live-view session, but no video started. Confirm the camera is online and try again.', pc)
      }, 20000)
    } catch (error) {
      if (attemptRef.current !== attempt) return
      failStream(error instanceof Error ? error.message : 'Ring live view failed to start.')
    }
  }, [clearConnectionTimeout, deviceId, failStream, releaseRingSession, videoRef])

  const stopStream = useCallback(async () => {
    attemptRef.current += 1
    closePeerConnection()
    await releaseRingSession()
    setStreamActive(false)
    setStreamStarting(false)
    setStreamError(null)
  }, [closePeerConnection, releaseRingSession])

  useEffect(() => {
    setStreamActive(false)
    setStreamStarting(false)
    setStreamError(null)
  }, [deviceId])

  useEffect(() => {
    // A camera change must release the previous stream before the new one can start.
    return () => {
      attemptRef.current += 1
      closePeerConnection()
      void releaseRingSession()
    }
  }, [closePeerConnection, deviceId, releaseRingSession])

  return { streamActive, streamStarting, streamError, startStream, stopStream }
}
