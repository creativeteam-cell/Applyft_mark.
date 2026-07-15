import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { scribeTranscribe } from '@/lib/elevenlabs'
import { elevenTTS } from '@/lib/elevenlabs'
import { buildPublicVideoUrl } from '@/lib/videoSign'
import { updateQueue } from '@/lib/queue'

// Дубляж, шаг 1: транскрипция (Scribe) → перевод (GPT-4o) → озвучка (ElevenLabs TTS).
// Возвращает исходный текст, перевод и mp3 в base64 — пользователь может отредактировать
// перевод и переозвучить (/api/dubbing/tts) перед запуском липсинка.
export const maxDuration = 210

const LANG_NAMES: Record<string, string> = {
  EN: 'English', SP: 'Spanish', PT: 'Portuguese', DE: 'German', FR: 'French',
  IT: 'Italian', JP: 'Japanese', KR: 'Korean', AR: 'Arabic', HI: 'Hindi',
  PL: 'Polish', UA: 'Ukrainian', RU: 'Russian', CN: 'Chinese', TW: 'Traditional Chinese',
  HE: 'Hebrew', CZ: 'Czech', ND: 'Dutch', BG: 'Bulgarian',
}

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { fileId, videoUrl, targetLang, voiceId } = await req.json()
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })
  if (!targetLang || !voiceId) return NextResponse.json({ error: 'targetLang and voiceId required' }, { status: 400 })

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!

    // 1. Транскрипция с диаризацией
    const transcript = await scribeTranscribe(url)
    if (!transcript.text) {
      return NextResponse.json({ error: 'No speech detected in this video' }, { status: 422 })
    }

    // 2. Перевод по репликам: сохраняем говорящих, добавляем эмоцию тегом
    // (eleven_v3 понимает [crying]/[serious]/[excited] прямо в тексте)
    const langName = LANG_NAMES[targetLang] || targetLang
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    await updateQueue('openai', 1)
    let segments: { speaker: string; text: string }[]
    let speakerRoles: Record<string, string> = {}
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional dubbing translator for ad videos. Translate each dialogue line into ${langName}.
Rules:
- Keep the same number of lines, same order, same speaker for each line
- Each translated line will be spoken aloud and must fit roughly the SAME duration as the original (similar syllable count ± 15%)
- Natural conversational language, as a native voice actor would say it
- Keep brand names, app names, and numbers exactly as-is
- Prepend ONE fitting emotion tag in square brackets to each line based on its tone, in English (e.g. [serious], [shocked], [crying], [excited], [calm])
- Additionally, infer WHO each speaker is from the dialogue content: a short role label in English (e.g. "Narrator (voice-over)", "Girl", "Father", "Mother"). Voice-overs/announcers usually speak in ad-copy style; characters speak conversationally.
- Respond ONLY with raw JSON object, no markdown:
{"segments":[{"speaker":"speaker_0","text":"[tag] translated line"},...],"speaker_roles":{"speaker_0":"Narrator (voice-over)","speaker_1":"Girl"}}`,
          },
          { role: 'user', content: JSON.stringify(transcript.segments.map(s => ({ speaker: s.speaker, text: s.text }))) },
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }, { timeout: 60000 })
      const raw = res.choices[0]?.message?.content?.trim() || '{}'
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
      const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
      segments = parsed.segments || []
      speakerRoles = parsed.speaker_roles || {}
    } finally {
      await updateQueue('openai', -1)
    }
    if (!segments?.length) throw new Error('Translation failed')

    const speakerIds = [...new Set(segments.map(s => s.speaker))]
    const translatedText = segments.map(s => s.text).join('\n')

    // Инфо по говорящим для UI: роль, первая фраза оригинала, тайминг для прослушивания
    const speakerInfo = speakerIds.map(id => {
      const first = transcript.segments.find(s => s.speaker === id)
      return {
        id,
        role: speakerRoles[id] || '',
        sample: first?.text.slice(0, 60) || '',
        start: first?.start ?? 0, // секунды в исходном видео — для кнопки ▶
      }
    })

    // 3. Озвучка: один говорящий — сразу TTS выбранным голосом.
    // Диалог — аудио генерится отдельным вызовом /api/dubbing/dialogue после того,
    // как пользователь раздаст голоса по говорящим в UI.
    let audioBase64: string | null = null
    if (speakerIds.length === 1) {
      const audio = await elevenTTS(translatedText, voiceId)
      audioBase64 = audio.toString('base64')
    }

    return NextResponse.json({
      sourceText: transcript.text,
      sourceLang: transcript.language,
      translatedText,
      segments,
      speakerIds,
      speakerInfo,
      speakers: speakerIds.length,
      audioBase64,
    })
  } catch (e: any) {
    console.error('[dubbing/prepare]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
