import { NextRequest, NextResponse } from 'next/server'
import { verifySignedCredential } from '@/lib/credentials/token'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json(verifySignedCredential(body?.token), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(
      { valid: false, status: 'malformed', message: 'Credential request is malformed.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
