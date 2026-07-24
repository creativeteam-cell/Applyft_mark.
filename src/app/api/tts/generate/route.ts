import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const maxDuration = 60

// Генерация озвучки через ElevenLabs TTS → возвращаем mp3 в base64 (без префикса),
// чтобы клиент мог сразу положить в слот аудио аватара.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 })

  const { voiceId, text, modelId } = await req.json() as { voiceId: string; text: string; modelId?: string }
  if (!voiceId || !text?.trim()) return NextResponse.json({ error: 'voiceId and text required' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: modelId || 'eleven_multilingual_v2',
        }),
      }
    )
    if (!res.ok) throw new Error(`ElevenLabs: ${res.status} ${await res.text()}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return NextResponse.json({ audioBase64: buf.toString('base64') })
  } catch (e: any) {
    console.error('[tts/generate]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
