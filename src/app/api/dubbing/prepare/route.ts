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
    const url = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl

    // 1. Транскрипция с диаризацией
    const transcript = await scribeTranscribe(url)
    if (!transcript.text) {
      return NextResponse.json({ error: 'No speech detected in this video' }, { status: 422 })
    }

    // 2. Перевод с подгонкой под хронометраж
    const langName = LANG_NAMES[targetLang] || targetLang
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    await updateQueue('openai', 1)
    let translated: string
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional dubbing translator for ad videos. Translate the voiceover into ${langName}.
Rules:
- The translation will be spoken aloud and must fit the SAME duration as the original — keep spoken length as close as possible (same number of syllables ± 15%)
- Natural conversational ad language, as a native voice actor would say it
- Keep brand names, app names, and numbers exactly as-is
- Return ONLY the translated text, no explanations, no quotes`,
          },
          { role: 'user', content: transcript.text },
        ],
        max_tokens: 1500,
        temperature: 0.4,
      }, { timeout: 60000 })
      translated = res.choices[0]?.message?.content?.trim() || ''
    } finally {
      await updateQueue('openai', -1)
    }
    if (!translated) throw new Error('Translation failed')

    // 3. Озвучка
    const audio = await elevenTTS(translated, voiceId)

    const speakers = new Set(transcript.segments.map(s => s.speaker)).size
    return NextResponse.json({
      sourceText: transcript.text,
      sourceLang: transcript.language,
      translatedText: translated,
      speakers, // >1 — предупредим в UI, что MVP озвучивает одним голосом
      audioBase64: audio.toString('base64'),
    })
  } catch (e: any) {
    console.error('[dubbing/prepare]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
