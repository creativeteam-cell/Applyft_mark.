import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createTurboVideoTask } from '@/lib/kling'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { model_name, prompt, first_frame, duration, resolution, aspect_ratio } = await req.json()
  if (!prompt?.trim() && !first_frame) return NextResponse.json({ error: 'Prompt or image required' }, { status: 400 })

  try {
    const result = await createTurboVideoTask({ model_name, prompt, first_frame, duration, resolution, aspect_ratio })
    return NextResponse.json({ task_id: result.task_id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
