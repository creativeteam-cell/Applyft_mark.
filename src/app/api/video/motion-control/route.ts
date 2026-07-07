import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createMotionControlTask } from '@/lib/kling'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { image_url, video_url, prompt, model_name, character_orientation, keep_original_sound, mode } = await req.json()
  if (!image_url) return NextResponse.json({ error: 'Character image required' }, { status: 400 })
  if (!video_url) return NextResponse.json({ error: 'Motion video URL required' }, { status: 400 })
  if (!character_orientation) return NextResponse.json({ error: 'character_orientation required' }, { status: 400 })

  try {
    const result = await createMotionControlTask({
      image_url,
      video_url,
      prompt,
      model_name: model_name ?? 'kling-v2-6',
      character_orientation,
      keep_original_sound: keep_original_sound ?? 'no',
      mode: mode ?? 'std',
    })
    return NextResponse.json({ task_id: result.task_id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
