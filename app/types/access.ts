import type { VerificationResult } from '@/lib/credentials/types'

export type AccessDecisionState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'result'; result: VerificationResult }
