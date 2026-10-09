import { PASSFLOW_TOKEN_PREFIX, type VerificationResult } from './types'

const verificationStatuses = new Set<VerificationResult['status']>([
  'valid',
  'expired',
  'not-yet-valid',
  'malformed',
  'invalid-signature',
])

export function isPassFlowQrValue(value: string) {
  return value.startsWith(`${PASSFLOW_TOKEN_PREFIX}.`) || value.startsWith('pf1.')
}

export async function verifyQrCredential(
  value: string,
  signal?: AbortSignal
): Promise<VerificationResult> {
  if (!isPassFlowQrValue(value)) {
    return {
      valid: false,
      status: 'malformed',
      message: 'This QR code is not a PassFlow credential.',
    }
  }

  const response = await fetch('/api/credentials/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: value }),
    signal,
  })
  const result: unknown = await response.json()

  if (
    !response.ok
    || typeof result !== 'object'
    || result === null
    || !('valid' in result)
    || typeof result.valid !== 'boolean'
    || !('status' in result)
    || typeof result.status !== 'string'
    || !verificationStatuses.has(result.status as VerificationResult['status'])
    || !('message' in result)
    || typeof result.message !== 'string'
  ) {
    throw new Error('Credential verification returned an invalid response.')
  }

  return result as VerificationResult
}
