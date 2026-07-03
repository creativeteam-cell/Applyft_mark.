import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extendVideo } from '@/lib/kling'

export const maxDuration = 15

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { klingVideoId, prompt, negative_prompt } = await req.json()
    if (!klingVideoId) return NextResponse.json({ error: 'klingVideoId required' }, { status: 400 })

    const result = await extendVideo({ video_id: klingVideoId, prompt, negative_prompt })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
