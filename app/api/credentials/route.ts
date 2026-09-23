import { NextRequest, NextResponse } from 'next/server'
import { createPassInputSchema, createSignedCredential } from '@/lib/credentials/token'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const input = createPassInputSchema.safeParse(await request.json())
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message || 'Pass details are invalid.' },
        { status: 400 }
      )
    }

    return NextResponse.json(createSignedCredential(input.data), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Credential creation failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Credential creation failed.' },
      { status: 500 }
    )
  }
}
