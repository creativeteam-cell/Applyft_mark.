import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listElevenVoices } from '@/lib/elevenlabs'

// Список голосов ElevenLabs для выпадашек дубляжа

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  try {
    const voices = await listElevenVoices()
    return NextResponse.json({
      voices: voices.map(v => ({
        id: v.voice_id,
        // "Rachel — female, young, calm"
        label: `${v.name}${Object.keys(v.labels).length ? ' — ' + ['gender', 'age', 'descriptive', 'accent'].map(k => v.labels[k]).filter(Boolean).join(', ') : ''}`,
        previewUrl: v.preview_url || null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
