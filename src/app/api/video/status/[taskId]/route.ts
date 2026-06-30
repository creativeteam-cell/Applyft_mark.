import { NextRequest, NextResponse } from 'next/server'
import { getVideoTaskStatus } from '@/lib/kling'

export const maxDuration = 15

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const type = (req.nextUrl.searchParams.get('type') ?? 'text2video') as 'text2video' | 'image2video'
    const data = await getVideoTaskStatus(type, params.taskId)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
