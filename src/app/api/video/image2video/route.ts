import { NextRequest, NextResponse } from 'next/server'
import { createImage2VideoTask } from '@/lib/kling'

export const maxDuration = 15

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await createImage2VideoTask(body)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
