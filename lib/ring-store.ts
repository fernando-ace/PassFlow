import 'server-only'
import postgres from 'postgres'

export type RingCredentialRecord = {
  accountId: string
  accessTokenCiphertext: string
  refreshTokenCiphertext: string
  accessTokenExpiresAt: Date
  linkState: 'unclaimed' | 'linking' | 'awaiting' | 'completed'
  partnerIdentifier: string | null
  nonceDigest: string | null
  nonceTimeMs: string | null
}

let client: ReturnType<typeof postgres> | undefined

function db() {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL is required for durable Ring account linking')
  client ??= postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false })
  return client
}

function map(row: any): RingCredentialRecord {
  return {
    accountId: row.account_id,
    accessTokenCiphertext: row.access_token_ciphertext,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
    accessTokenExpiresAt: new Date(row.access_token_expires_at),
    linkState: row.link_state,
    partnerIdentifier: row.partner_identifier,
    nonceDigest: row.nonce_digest,
    nonceTimeMs: row.nonce_time_ms,
  }
}

export async function saveUnclaimedRingCredentials(input: {
  accountId: string
  accessTokenCiphertext: string
  refreshTokenCiphertext: string
  accessTokenExpiresAt: Date
}) {
  await db()`
    INSERT INTO ring_credentials (
      account_id, access_token_ciphertext, refresh_token_ciphertext,
      access_token_expires_at, link_state, partner_identifier, nonce_digest,
      nonce_time_ms, updated_at
    ) VALUES (
      ${input.accountId}, ${input.accessTokenCiphertext}, ${input.refreshTokenCiphertext},
      ${input.accessTokenExpiresAt}, 'unclaimed', NULL, NULL, NULL, NOW()
    )
    ON CONFLICT (account_id) DO UPDATE SET
      access_token_ciphertext = EXCLUDED.access_token_ciphertext,
      refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      link_state = 'unclaimed', partner_identifier = NULL, nonce_digest = NULL,
      nonce_time_ms = NULL, updated_at = NOW()
  `
}

export async function listUnclaimedRingCredentials() {
  const rows = await db()`
    SELECT * FROM ring_credentials
    WHERE link_state = 'unclaimed'
    ORDER BY created_at ASC
  `
  return rows.map(map)
}

export async function claimRingCredential(input: {
  accountId: string
  partnerIdentifier: string
  nonceDigest: string
  nonceTimeMs: string
}) {
  const rows = await db()`
    UPDATE ring_credentials SET
      link_state = 'linking', partner_identifier = ${input.partnerIdentifier},
      nonce_digest = ${input.nonceDigest}, nonce_time_ms = ${input.nonceTimeMs}, updated_at = NOW()
    WHERE account_id = ${input.accountId} AND link_state = 'unclaimed'
    RETURNING *
  `
  return rows[0] ? map(rows[0]) : null
}

export async function setRingCredentialLinkState(accountId: string, state: RingCredentialRecord['linkState']) {
  await db()`
    UPDATE ring_credentials SET link_state = ${state}, updated_at = NOW()
    WHERE account_id = ${accountId}
  `
}

export async function getLatestLinkedRingCredential() {
  const rows = await db()`
    SELECT * FROM ring_credentials
    WHERE link_state = 'completed'
    ORDER BY updated_at DESC LIMIT 1
  `
  return rows[0] ? map(rows[0]) : null
}

export async function updateRingCredentialTokens(input: {
  accountId: string
  accessTokenCiphertext: string
  refreshTokenCiphertext: string
  accessTokenExpiresAt: Date
}) {
  const rows = await db()`
    UPDATE ring_credentials SET
      access_token_ciphertext = ${input.accessTokenCiphertext},
      refresh_token_ciphertext = ${input.refreshTokenCiphertext},
      access_token_expires_at = ${input.accessTokenExpiresAt}, updated_at = NOW()
    WHERE account_id = ${input.accountId} AND link_state = 'completed'
    RETURNING account_id
  `
  if (!rows[0]) throw new Error('Linked Ring credentials could not be updated')
}
