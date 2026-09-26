import 'server-only'
import { decryptRingToken, encryptRingToken, refreshRingAccessToken } from '@/lib/ring-auth-core.mjs'
import {
  getLatestLinkedRingCredential,
  updateRingCredentialTokens,
} from '@/lib/ring-store'

export type AuthMode = 'playground_access_token' | 'playground_refresh_token' | 'ring_private_app' | null
let playgroundCache: { token: string; expiresAt: number } | null = null

function getEnvironmentMode(): Exclude<AuthMode, 'ring_private_app' | null> | null {
  if (process.env.RING_ACCESS_TOKEN && process.env.RING_REFRESH_TOKEN) return null
  if (process.env.RING_ACCESS_TOKEN) return 'playground_access_token'
  if (process.env.RING_REFRESH_TOKEN) return 'playground_refresh_token'
  return null
}

export async function getAuthMode(): Promise<AuthMode> {
  const mode = getEnvironmentMode()
  if (mode || (process.env.RING_ACCESS_TOKEN && process.env.RING_REFRESH_TOKEN)) return mode
  if (!process.env.POSTGRES_URL) return null
  return (await getLatestLinkedRingCredential()) ? 'ring_private_app' : null
}

async function getPlaygroundRefreshToken() {
  if (!process.env.RING_CLIENT_ID || !process.env.RING_CLIENT_SECRET) {
    throw new Error('RING_CLIENT_ID and RING_CLIENT_SECRET are required for RING_REFRESH_TOKEN')
  }
  if (playgroundCache && Date.now() < playgroundCache.expiresAt) return playgroundCache.token
  try {
    const tokens = await refreshRingAccessToken(process.env.RING_REFRESH_TOKEN!, {
      clientId: process.env.RING_CLIENT_ID,
      clientSecret: process.env.RING_CLIENT_SECRET,
    })
    playgroundCache = { token: tokens.accessToken, expiresAt: tokens.expiresAt - 60_000 }
    return tokens.accessToken
  } catch {
    throw new Error('Ring Playground token refresh failed; check credentials and try again.')
  }
}

async function getLinkedRingAccessToken() {
  const record = await getLatestLinkedRingCredential()
  if (!record) throw new Error('No completed Ring Private App account link is stored.')
  const key = process.env.RING_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('RING_TOKEN_ENCRYPTION_KEY is not configured')

  let accessToken: string
  let refreshToken: string
  try {
    accessToken = decryptRingToken(record.accessTokenCiphertext, key)
    refreshToken = decryptRingToken(record.refreshTokenCiphertext, key)
  } catch {
    throw new Error('Stored Ring credentials are invalid or corrupted; relink the Ring account.')
  }
  if (record.accessTokenExpiresAt.getTime() > Date.now() + 5 * 60_000) return accessToken

  if (!process.env.RING_CLIENT_ID || !process.env.RING_CLIENT_SECRET) {
    throw new Error('Ring Private App client credentials are not configured')
  }
  let refreshed
  try {
    refreshed = await refreshRingAccessToken(refreshToken, {
      clientId: process.env.RING_CLIENT_ID,
      clientSecret: process.env.RING_CLIENT_SECRET,
    })
  } catch {
    throw new Error('Ring access-token refresh failed; relink the account if refresh credentials have expired.')
  }
  await updateRingCredentialTokens({
    accountId: record.accountId,
    accessTokenCiphertext: encryptRingToken(refreshed.accessToken, key),
    refreshTokenCiphertext: encryptRingToken(refreshed.refreshToken, key),
    accessTokenExpiresAt: new Date(refreshed.expiresAt),
  })
  return refreshed.accessToken
}

export async function getAccessToken(): Promise<string> {
  const mode = getEnvironmentMode()
  if (process.env.RING_ACCESS_TOKEN && process.env.RING_REFRESH_TOKEN) {
    throw new Error('Both RING_ACCESS_TOKEN and RING_REFRESH_TOKEN are set. Please use only one.')
  }
  if (mode === 'playground_access_token') return process.env.RING_ACCESS_TOKEN!
  if (mode === 'playground_refresh_token') return getPlaygroundRefreshToken()
  return getLinkedRingAccessToken()
}
