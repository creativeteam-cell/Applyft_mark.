import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createOmniVideoTask } from '@/lib/kling'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { model_name, prompt, first_frame, duration, mode, aspect_ratio, sound, multi_shot, multi_prompt } = await req.json()
  if (!prompt?.trim() && !first_frame && !multi_prompt?.length) {
    return NextResponse.json({ error: 'Prompt or image required' }, { status: 400 })
  }

  try {
    // O1 supports 3-10s, Omni 3-15s
    const maxDur = model_name === 'kling-video-o1' ? 10 : 15
    const dur = duration ? String(Math.min(Number(duration), maxDur)) : undefined

    const result = await createOmniVideoTask({
      model_name, prompt, first_frame,
      duration: dur,
      mode, aspect_ratio, sound, multi_shot, multi_prompt,
    })
    return NextResponse.json({ task_id: result.task_id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
