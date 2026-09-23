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

/**
 * Manages WebRTC connection to Ring camera stream.
 * Handles ICE gathering, SDP negotiation, and cleanup.
 */
export function useWebRTCStream({ videoRef, deviceId }: UseWebRTCStreamOptions): UseWebRTCStreamReturn {
  const [streamActive, setStreamActive] = useState(false)
  const [streamStarting, setStreamStarting] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sessionUrlRef = useRef<string | null>(null)
  const startingRef = useRef(false)

  const closePeerConnection = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [videoRef])

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

  const startStream = useCallback(async () => {
    if (!deviceId || startingRef.current || pcRef.current) return

    startingRef.current = true
    setStreamStarting(true)
    setStreamError(null)
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      })
      pcRef.current = pc

      pc.addTransceiver('audio', { direction: 'sendrecv' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0]
          videoRef.current.play().catch(() => undefined)
          setStreamActive(true)
          setStreamStarting(false)
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setStreamError('The Ring live view connection failed. Try starting it again.')
          setStreamActive(false)
          setStreamStarting(false)
          closePeerConnection()
        }
      }

      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve()
        const timeout = setTimeout(() => resolve(), 3000)
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        }
      })

      const res = await fetch('/api/ring/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdpOffer: pc.localDescription!.sdp, deviceId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Stream start failed')
      }

      const { sdpAnswer, sessionUrl } = await res.json()
      sessionUrlRef.current = sessionUrl
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
      setStreamActive(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream failed'
      console.error('Stream error:', err)
      setStreamError(message)
      setStreamActive(false)
      closePeerConnection()
      await releaseRingSession()
    } finally {
      startingRef.current = false
      setStreamStarting(false)
    }
  }, [closePeerConnection, deviceId, releaseRingSession, videoRef])

  const stopStream = useCallback(async () => {
    startingRef.current = false
    closePeerConnection()
    await releaseRingSession()
    setStreamActive(false)
    setStreamStarting(false)
    setStreamError(null)
  }, [closePeerConnection, releaseRingSession])

  useEffect(() => {
    return () => {
      closePeerConnection()
      void releaseRingSession()
    }
  }, [closePeerConnection, releaseRingSession])

  return { streamActive, streamStarting, streamError, startStream, stopStream }
}
