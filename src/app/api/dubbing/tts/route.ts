import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { elevenTTS } from '@/lib/elevenlabs'

// Переозвучка отредактированного перевода (шаг между prepare и lipsync)
export const maxDuration = 60

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { text, voiceId } = await req.json()
  if (!text?.trim() || !voiceId) return NextResponse.json({ error: 'text and voiceId required' }, { status: 400 })

  try {
    const audio = await elevenTTS(text.trim(), voiceId)
    return NextResponse.json({ audioBase64: audio.toString('base64') })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
