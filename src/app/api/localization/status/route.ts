import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Use SSE stream from /api/localization/run' }, { status: 410 })
}
