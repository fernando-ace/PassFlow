import { NextResponse } from 'next/server'
import { getAuthMode } from '@/lib/auth'

export async function GET() {
  const mode = await getAuthMode()

  if (mode === null && process.env.RING_ACCESS_TOKEN && process.env.RING_REFRESH_TOKEN) {
    return NextResponse.json(
      { error: 'Both RING_ACCESS_TOKEN and RING_REFRESH_TOKEN are set. Please use only one.' },
      { status: 400 }
    )
  }

  if (mode === null) {
    return NextResponse.json(
      { error: 'Authentication not configured. Set RING_ACCESS_TOKEN for Playground mode or complete a Ring Private App link.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ mode })
}
