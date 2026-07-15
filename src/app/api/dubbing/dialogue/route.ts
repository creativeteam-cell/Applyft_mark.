import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { elevenDialogueTimed } from '@/lib/elevenlabs'

// Озвучка диалога: реплики → text-to-dialogue (eleven_v3) → один mp3.
// voiceMap: { speaker_0: voiceId, speaker_1: voiceId, ... }
export const maxDuration = 120

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { segments, voiceMap } = await req.json() as {
    segments: { speaker: string; text: string }[]
    voiceMap: Record<string, string>
  }
  if (!segments?.length || !voiceMap) return NextResponse.json({ error: 'segments and voiceMap required' }, { status: 400 })

  const totalChars = segments.reduce((s, seg) => s + seg.text.length, 0)
  if (totalChars > 2000) {
    return NextResponse.json({ error: `Dialogue too long for one request (${totalChars}/2000 chars)` }, { status: 422 })
  }

  try {
    // Порядок inputs = порядок segments — timings[i] соответствует segments[i]
    const inputs = segments.map(s => ({
      text: s.text.trim() || '...',
      voice_id: voiceMap[s.speaker] || Object.values(voiceMap)[0],
    }))
    const { audio, timings } = await elevenDialogueTimed(inputs)
    return NextResponse.json({ audioBase64: audio.toString('base64'), timings })
  } catch (e: any) {
    console.error('[dubbing/dialogue]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
