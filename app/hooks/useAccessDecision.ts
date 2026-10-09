'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccessDecisionState } from '@/app/types/access'
import type { VerificationResult } from '@/lib/credentials/types'
import { AccessDecisionEngine } from '@/lib/access/decisionCore.mjs'
import type { ProcessorResult } from '@/lib/video-processors/types'

interface CrossingData {
  trackId: number
  direction: 'entering'
  timestamp: number
  evidence?: 'inferred' | 'boundary'
  confirmedAt?: number
}

function readCrossings(result: ProcessorResult): CrossingData[] {
  const value = result.data?.crossings
  if (!Array.isArray(value)) return []
  return value.filter((item): item is CrossingData => (
    typeof item === 'object'
    && item !== null
    && typeof item.trackId === 'number'
    && item.direction === 'entering'
    && typeof item.timestamp === 'number'
  ))
}

export function useAccessDecision() {
  const [engine] = useState(() => new AccessDecisionEngine())
  const [decision, setDecision] = useState<AccessDecisionState>(
    () => engine.snapshot() as AccessDecisionState,
  )

  const credentialChecking = useCallback(() => {
    setDecision(engine.credentialChecking() as AccessDecisionState)
  }, [engine])

  const credentialVerified = useCallback((verification: VerificationResult) => {
    setDecision(engine.credentialVerified(verification) as AccessDecisionState)
  }, [engine])

  const processPeopleResult = useCallback((result: ProcessorResult) => {
    const detectedValue = result.data?.peopleDetected
    let next = engine.updatePeopleDetected(
      typeof detectedValue === 'number' ? detectedValue : 0,
      result.timestamp,
    )
    for (const crossing of readCrossings(result)) {
      next = engine.recordEntrant(crossing.trackId, crossing.timestamp, crossing.evidence, crossing.confirmedAt)
    }
    setDecision(next as AccessDecisionState)
  }, [engine])

  const resetDecision = useCallback(() => {
    setDecision(engine.reset() as AccessDecisionState)
  }, [engine])

  const setEntryWindowMs = useCallback((durationMs: number) => {
    setDecision(engine.setEntryWindowMs(durationMs) as AccessDecisionState)
  }, [engine])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDecision((current) => (
        current.entryWindowActive ? engine.snapshot() as AccessDecisionState : current
      ))
    }, 250)
    return () => window.clearInterval(timer)
  }, [engine])

  return {
    decision,
    credentialChecking,
    credentialVerified,
    processPeopleResult,
    resetDecision,
    setEntryWindowMs,
  }
}
