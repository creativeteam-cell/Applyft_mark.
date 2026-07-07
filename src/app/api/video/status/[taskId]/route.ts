import { NextRequest, NextResponse } from 'next/server'
import { getVideoTaskStatus, getTurboTaskStatus } from '@/lib/kling'

export const maxDuration = 15

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const type = req.nextUrl.searchParams.get('type') ?? 'text2video'

    // New-format models (Turbo / Omni / O1) use different polling endpoint
    if (type === 'turbo') {
      const data = await getTurboTaskStatus(params.taskId)
      // Normalize to old format so VideoPage polling works uniformly
      return NextResponse.json({
        task_status: data.status === 'succeeded' ? 'succeed' : data.status,
        task_result: data.videoUrl
          ? { videos: [{ url: data.videoUrl, id: data.videoId ?? '' }] }
          : undefined,
      })
    }

    // Old format: text2video, image2video, video-extend, motion-control, avatar
    const data = await getVideoTaskStatus(
      type as 'text2video' | 'image2video' | 'video-extend',
      params.taskId
    )
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
