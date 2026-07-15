import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { identifyFace } from '@/lib/kling'
import { buildPublicVideoUrl } from '@/lib/videoSign'

// Лица в исходном видео (с миниатюрами) — чтобы пользователь глазами привязал
// говорящих к лицам. Эвристика "кто дольше в кадре" ломается, когда в кадре двое.

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { fileId, videoUrl } = await req.json()
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!
    const { faces } = await identifyFace(url)
    return NextResponse.json({
      faces: faces.map(f => ({
        image: f.face_image,
        startMs: f.start_time,
        endMs: f.end_time,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
