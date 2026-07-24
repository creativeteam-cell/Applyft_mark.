import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Список голосов из аккаунта ElevenLabs (id, имя, превью-сэмпл, метки языка/пола).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 })

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    })
    if (!res.ok) throw new Error(`ElevenLabs: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const voices = (data.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url || null,
      labels: v.labels || {},
      category: v.category || '',
    }))
    return NextResponse.json({ voices }, { headers: { 'Cache-Control': 'private, max-age=600' } })
  } catch (e: any) {
    console.error('[tts/voices]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
