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

  const { fileId, videoUrl, audioBase64, audioDurationMs, window, originalAudioVolume } = await req.json() as {
    fileId?: string; videoUrl?: string; audioBase64: string; audioDurationMs: number
    // Окно (мс): синкаем губы только в этом диапазоне; звук режется из полной
    // дорожки [startMs..endMs] и вставляется на ту же позицию видео.
    window?: { startMs: number; endMs: number }
    // 0 на первом проходе (глушим оригинал), 1 на последующих (сохраняем
    // уже вставленные куски из предыдущих проходов)
    originalAudioVolume?: number
  }
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })
  if (!audioBase64 || !audioDurationMs) return NextResponse.json({ error: 'audioBase64 and audioDurationMs required' }, { status: 400 })

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!

    const { session_id, faces } = await identifyFace(url)
    if (!faces.length) {
      return NextResponse.json({ error: 'No face detected in this video — lip-sync is not possible' }, { status: 422 })
    }

    // Выбор лица: при окне — то, что дольше всех видно ВНУТРИ окна
    // (говорящий в этот момент и есть лицо в кадре); без окна — самое долгое в целом
    const overlap = (f: { start_time: number; end_time: number }, s: number, e: number) =>
      Math.max(0, Math.min(f.end_time, e) - Math.max(f.start_time, s))
    const face = window
      ? faces.reduce((best, f) => overlap(f, window.startMs, window.endMs) > overlap(best, window.startMs, window.endMs) ? f : best, faces[0])
      : faces.reduce((best, f) => (f.end_time - f.start_time) > (best.end_time - best.start_time) ? f : best, faces[0])

    if (window && overlap(face, window.startMs, window.endMs) < 2000) {
      return NextResponse.json({ error: `No face visible for ≥2s in window ${Math.round(window.startMs / 1000)}–${Math.round(window.endMs / 1000)}s` }, { status: 422 })
    }

    const result = await createLipSyncTask({
      session_id,
      face_id: face.face_id,
      sound_file: String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''),
      sound_start_time: Math.round(window?.startMs ?? 0),
      sound_end_time: Math.round(window?.endMs ?? audioDurationMs),
      sound_insert_time: Math.round(window?.startMs ?? 0),
      sound_volume: 1,
      original_audio_volume: originalAudioVolume ?? 0,
    })

    return NextResponse.json({ task_id: result.task_id, faces: faces.length })
  } catch (e: any) {
    console.error('[dubbing/lipsync]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
