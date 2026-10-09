import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const PASSFLOW_TOKEN_PREFIX = 'pf2'

const passCredentialSchema = z.object({
  version: z.literal(1),
  passId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(80),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
}).refine((value) => Date.parse(value.validUntil) > Date.parse(value.validFrom), {
  message: 'Expiration must be after the start time.',
})

const compactCredentialSchema = z.tuple([
  z.string().uuid(), z.string().trim().min(1).max(80), z.string().trim().min(1).max(80),
  z.number().int().min(0).max(253402300799999), z.number().int().min(0).max(253402300799999),
])

export const createPassInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a visitor name.').max(80),
  location: z.string().trim().min(1, 'Choose a door or location.').max(80),
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

function getSigningSecret() {
  const secret = process.env.PASSFLOW_SIGNING_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('PASSFLOW_SIGNING_SECRET must be configured with at least 32 characters.')
  }
  return secret
}

function sign(value) {
  return createHmac('sha256', getSigningSecret()).update(value).digest()
}

/** @param {{ displayName: string, location: string, validFrom: string, validUntil: string }} input */
export function createSignedCredential(input) {
  const credential = {
    version: /** @type {const} */ (1),
    passId: randomUUID(),
    displayName: input.displayName,
    location: input.location,
    validFrom: new Date(input.validFrom).toISOString(),
    validUntil: new Date(input.validUntil).toISOString(),
  }
  const payload = Buffer.from(JSON.stringify([
    credential.passId, credential.displayName, credential.location,
    Date.parse(credential.validFrom), Date.parse(credential.validUntil),
  ])).toString('base64url')
  const signedValue = `${PASSFLOW_TOKEN_PREFIX}.${payload}`
  const signature = sign(signedValue).toString('base64url')

  return { credential, token: `${signedValue}.${signature}` }
}

/**
 * @param {'valid' | 'expired' | 'not-yet-valid' | 'malformed' | 'invalid-signature'} status
 * @param {string} message
 * @param {import('./types').PassCredential} [credential]
 * @returns {import('./types').VerificationResult}
 */
function result(status, message, credential) {
  return { valid: status === 'valid', status, message, credential }
}

/**
 * @param {unknown} token
 * @param {Date} [now]
 * @returns {import('./types').VerificationResult}
 */
export function verifySignedCredential(token, now = new Date()) {
  if (typeof token !== 'string' || token.length > 4096) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const parts = token.split('.')
  if (parts.length !== 3 || !['pf1', 'pf2'].includes(parts[0])) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const [prefix, payload, signatureValue] = parts
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signatureValue)) {
    return result('malformed', 'Credential format is not recognized.')
  }

  const expectedSignature = sign(`${prefix}.${payload}`)
  const actualSignature = Buffer.from(signatureValue, 'base64url')
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return result('invalid-signature', 'Credential signature is invalid.')
  }

  let parsedPayload
  try {
    parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return result('malformed', 'Credential payload is malformed.')
  }

  if (prefix === 'pf2') {
    const compact = compactCredentialSchema.safeParse(parsedPayload)
    if (!compact.success) return result('malformed', 'Credential payload is malformed.')
    const [passId, displayName, location, validFrom, validUntil] = compact.data
    parsedPayload = { version: 1, passId, displayName, location,
      validFrom: new Date(validFrom).toISOString(), validUntil: new Date(validUntil).toISOString() }
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
