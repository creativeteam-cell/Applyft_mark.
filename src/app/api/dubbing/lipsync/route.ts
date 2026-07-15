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

  const { fileId, videoUrl, audioBase64, audioDurationMs, window, originalAudioVolume, faceRef } = await req.json() as {
    fileId?: string; videoUrl?: string; audioBase64: string; audioDurationMs: number
    // Окно: из аудио режется [soundStartMs..soundEndMs] и вставляется в видео
    // на insertMs (позиция может отличаться — озвучка выравнивается по паузам оригинала)
    window?: { soundStartMs: number; soundEndMs: number; insertMs: number }
    // 0 на первом проходе (глушим оригинал), 1 на последующих (сохраняем
    // уже вставленные куски из предыдущих проходов)
    originalAudioVolume?: number
    // Интервал видимости лица, выбранного пользователем на исходнике (мс) —
    // на каждом проходе ищем лицо с максимальным пересечением с этим интервалом
    faceRef?: { startMs: number; endMs: number }
  }
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })
  if (!audioBase64 || !audioDurationMs) return NextResponse.json({ error: 'audioBase64 and audioDurationMs required' }, { status: 400 })

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!

    const { session_id, faces } = await identifyFace(url)
    if (!faces.length) {
      return NextResponse.json({ error: 'No face detected in this video — lip-sync is not possible' }, { status: 422 })
    }

    // Выбор лица, по приоритету:
    // 1. faceRef — привязка, сделанная пользователем по миниатюрам (самая надёжная)
    // 2. при окне — лицо, дольше всех видимое внутри окна вставки
    // 3. без окна — самое долгое в кадре
    const overlap = (f: { start_time: number; end_time: number }, s: number, e: number) =>
      Math.max(0, Math.min(f.end_time, e) - Math.max(f.start_time, s))
    const insertStart = Math.round(window?.insertMs ?? 0)
    const insertEnd = insertStart + Math.round((window ? window.soundEndMs - window.soundStartMs : audioDurationMs))
    const face = faceRef
      ? faces.reduce((best, f) => overlap(f, faceRef.startMs, faceRef.endMs) > overlap(best, faceRef.startMs, faceRef.endMs) ? f : best, faces[0])
      : window
        ? faces.reduce((best, f) => overlap(f, insertStart, insertEnd) > overlap(best, insertStart, insertEnd) ? f : best, faces[0])
        : faces.reduce((best, f) => (f.end_time - f.start_time) > (best.end_time - best.start_time) ? f : best, faces[0])

    if (window && overlap(face, insertStart, insertEnd) < 2000) {
      return NextResponse.json({ error: `Selected face is not visible for ≥2s in window ${Math.round(insertStart / 1000)}–${Math.round(insertEnd / 1000)}s` }, { status: 422 })
    }

    const result = await createLipSyncTask({
      session_id,
      face_id: face.face_id,
      sound_file: String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''),
      sound_start_time: Math.round(window?.soundStartMs ?? 0),
      sound_end_time: Math.round(window?.soundEndMs ?? audioDurationMs),
      sound_insert_time: insertStart,
      sound_volume: 1,
      original_audio_volume: originalAudioVolume ?? 0,
    })

    return NextResponse.json({ task_id: result.task_id, faces: faces.length })
  } catch (e: any) {
    console.error('[dubbing/lipsync]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
