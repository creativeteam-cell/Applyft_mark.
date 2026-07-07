import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAvatarTask } from '@/lib/kling'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { image, sound_file, prompt, mode } = await req.json()
  if (!image) return NextResponse.json({ error: 'Avatar image required' }, { status: 400 })
  if (!sound_file) return NextResponse.json({ error: 'Audio file required' }, { status: 400 })

  try {
    const result = await createAvatarTask({ image, sound_file, prompt, mode })
    return NextResponse.json({ task_id: result.task_id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
