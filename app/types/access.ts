import type { PassCredential, VerificationStatus } from '@/lib/credentials/types'

export type AccessOutcome =
  | 'waiting-for-credential'
  | 'checking-credential'
  | 'credential-verified-waiting-for-entry'
  | 'authorized-entry'
  | 'possible-tailgating'
  | 'unauthorized-entry'

export interface AccessCredentialState {
  status: VerificationStatus | 'none' | 'checking'
  message: string
  details?: PassCredential | null
}

export type AccessEventType =
  | 'credential-verified'
  | 'credential-rejected'
  | 'entry-window-opened'
  | 'entrant-counted'
  | 'authorized-entry'
  | 'unauthorized-entry'
  | 'possible-tailgating'

export interface AccessEvent {
  id: string
  type: AccessEventType
  timestamp: number
  label: string
  visitorName?: string
}

export interface AccessDecisionState {
  outcome: AccessOutcome
  credential: AccessCredentialState
  entryWindowOpenedAt: number | null
  entryWindowExpiresAt: number | null
  entryWindowActive: boolean
  entryWindowRemainingMs: number
  entrantsCounted: number
  peopleDetected: number
  lastEventAt: number | null
  events: AccessEvent[]
}
