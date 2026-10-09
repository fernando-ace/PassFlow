export const PASSFLOW_TOKEN_PREFIX = 'pf2'

export interface PassCredential {
  version: 1
  passId: string
  displayName: string
  location: string
  validFrom: string
  validUntil: string
}

export type VerificationStatus =
  | 'valid'
  | 'expired'
  | 'not-yet-valid'
  | 'malformed'
  | 'invalid-signature'

export interface VerificationResult {
  valid: boolean
  status: VerificationStatus
  message: string
  credential?: PassCredential
}
