import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  PASSFLOW_TOKEN_PREFIX,
  type PassCredential,
  type VerificationResult,
} from './types'

const passCredentialSchema = z.object({
  version: z.literal(1),
  passId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(80),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
})

export const createPassInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a visitor name.').max(80),
  location: z.string().trim().min(1, 'Enter a door or location.').max(80),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
}).superRefine((value, context) => {
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validUntil'],
      message: 'Expiration must be after the start time.',
    })
  }
})

function getSigningSecret(): string {
  const secret = process.env.PASSFLOW_SIGNING_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('PASSFLOW_SIGNING_SECRET must be configured with at least 32 characters.')
  }
  return secret
}

function sign(value: string): Buffer {
  return createHmac('sha256', getSigningSecret()).update(value).digest()
}

export function createSignedCredential(input: z.infer<typeof createPassInputSchema>) {
  const credential: PassCredential = {
    version: 1,
    passId: randomUUID(),
    displayName: input.displayName,
    location: input.location,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  }
  const payload = Buffer.from(JSON.stringify(credential)).toString('base64url')
  const signedValue = `${PASSFLOW_TOKEN_PREFIX}.${payload}`
  const signature = sign(signedValue).toString('base64url')

  return { credential, token: `${signedValue}.${signature}` }
}

function result(
  status: VerificationResult['status'],
  message: string,
  credential?: PassCredential
): VerificationResult {
  return { valid: status === 'valid', status, message, credential }
}

export function verifySignedCredential(token: unknown, now = new Date()): VerificationResult {
  if (typeof token !== 'string' || token.length > 4096) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PASSFLOW_TOKEN_PREFIX) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const [prefix, payload, signatureValue] = parts
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signatureValue)) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const expectedSignature = sign(`${prefix}.${payload}`)
  const actualSignature = Buffer.from(signatureValue, 'base64url')
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return result('invalid-signature', 'Credential signature is invalid.')
  }

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return result('malformed', 'Credential payload is malformed.')
  }

  const parsedCredential = passCredentialSchema.safeParse(parsedPayload)
  if (!parsedCredential.success) {
    return result('malformed', 'Credential payload is malformed.')
  }

  const credential = parsedCredential.data
  const nowTime = now.getTime()
  if (nowTime < Date.parse(credential.validFrom)) {
    return result('not-yet-valid', 'Credential is not yet valid.', credential)
  }
  if (nowTime >= Date.parse(credential.validUntil)) {
    return result('expired', 'Credential has expired.', credential)
  }

  return result('valid', 'Credential is valid.', credential)
}
