import { NextRequest, NextResponse } from 'next/server'
import { readQueue, updateQueue } from '@/lib/queue'

export const maxDuration = 15

export async function GET() {
  const queue = await readQueue()
  return NextResponse.json(queue)
}

// Client-side heartbeat: { model: 'gemini' | 'openai', active: boolean }
export async function POST(req: NextRequest) {
  try {
    const { model, active } = await req.json() as { model: 'gemini' | 'openai'; active: boolean }
    if (model !== 'gemini' && model !== 'openai') {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 })
    }
    await updateQueue(model, active ? 1 : -1)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
