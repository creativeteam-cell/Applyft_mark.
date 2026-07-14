import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { identifyFace, createLipSyncTask } from '@/lib/kling'
import { buildPublicVideoUrl } from '@/lib/videoSign'

// Дубляж, шаг 2: поиск лица в видео + запуск advanced-lip-sync с новой дорожкой.
// Оригинальный звук глушится (original_audio_volume: 0).
export const maxDuration = 60

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { fileId, videoUrl, audioBase64, audioDurationMs } = await req.json()
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })
  if (!audioBase64 || !audioDurationMs) return NextResponse.json({ error: 'audioBase64 and audioDurationMs required' }, { status: 400 })

  try {
    const url = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl

    // Лицо для липсинка: берём то, что дольше всех в кадре
    const { session_id, faces } = await identifyFace(url)
    if (!faces.length) {
      return NextResponse.json({ error: 'No face detected in this video — lip-sync is not possible' }, { status: 422 })
    }
    const face = faces.reduce((best, f) =>
      (f.end_time - f.start_time) > (best.end_time - best.start_time) ? f : best, faces[0])

    const result = await createLipSyncTask({
      session_id,
      face_id: face.face_id,
      sound_file: String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''),
      sound_start_time: 0,
      sound_end_time: Math.round(audioDurationMs),
      sound_insert_time: 0,
      sound_volume: 1,
      original_audio_volume: 0,
    })

    return NextResponse.json({ task_id: result.task_id, faces: faces.length })
  } catch (e: any) {
    console.error('[dubbing/lipsync]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
