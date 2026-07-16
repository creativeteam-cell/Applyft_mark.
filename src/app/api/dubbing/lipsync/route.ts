import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { identifyFace, createLipSyncTask, KlingFace } from '@/lib/kling'
import { buildPublicVideoUrl } from '@/lib/videoSign'

// Дубляж, шаг 2: поиск лица в видео + запуск advanced-lip-sync с новой дорожкой.
// Оригинальный звук глушится (original_audio_volume: 0).
export const maxDuration = 120

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

// Находит среди лиц то же, что на эталонной картинке (GPT-4o vision).
// Возвращает лицо или null, если не удалось определить.
async function matchFaceByImage(refUrl: string, faces: KlingFace[]): Promise<KlingFace | null> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const content: any[] = [
      { type: 'text', text: 'REFERENCE face:' },
      { type: 'image_url', image_url: { url: refUrl, detail: 'low' } },
      { type: 'text', text: 'Candidate faces (numbered from 0):' },
    ]
    faces.forEach((f, i) => {
      content.push({ type: 'text', text: `#${i}:` })
      content.push({ type: 'image_url', image_url: { url: f.face_image, detail: 'low' } })
    })
    content.push({ type: 'text', text: 'Which candidate number is the SAME person as the reference? Respond ONLY with the number.' })
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 5, temperature: 0,
    }, { timeout: 30000 })
    const idx = parseInt((res.choices[0]?.message?.content || '').match(/\d+/)?.[0] ?? '', 10)
    return Number.isInteger(idx) && faces[idx] ? faces[idx] : null
  } catch (e: any) {
    console.warn('[lipsync] face match failed:', e.message)
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { fileId, videoUrl, audioBase64, audioDurationMs, window, originalAudioVolume, faceRef, faceImageUrl } = await req.json() as {
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
    // Картинка выбранного лица (эталон): если в куске несколько лиц — GPT-vision
    // находит среди них то же лицо и берёт его свежий face_id. Самый надёжный способ.
    faceImageUrl?: string
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
    let face = faces[0]
    if (faces.length === 1) {
      face = faces[0] // одно лицо в куске — выбирать нечего
    } else if (faceImageUrl) {
      // Несколько лиц: GPT-vision находит то же лицо, что на эталоне
      const matched = await matchFaceByImage(faceImageUrl, faces)
      face = matched || faces[0]
    } else if (faceRef) {
      face = faces.reduce((best, f) => overlap(f, faceRef.startMs, faceRef.endMs) > overlap(best, faceRef.startMs, faceRef.endMs) ? f : best, faces[0])
    } else if (window) {
      face = faces.reduce((best, f) => overlap(f, insertStart, insertEnd) > overlap(best, insertStart, insertEnd) ? f : best, faces[0])
    } else {
      face = faces.reduce((best, f) => (f.end_time - f.start_time) > (best.end_time - best.start_time) ? f : best, faces[0])
    }

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
