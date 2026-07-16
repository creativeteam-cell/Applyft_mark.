import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deleteVoice } from '@/lib/elevenlabs'

// Удаление клонированных голосов после дубляжа — чтобы не забивать слоты аккаунта
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { voiceIds } = await req.json() as { voiceIds: string[] }
  if (Array.isArray(voiceIds)) {
    await Promise.all(voiceIds.map(id => deleteVoice(id)))
  }
  return NextResponse.json({ ok: true })
}
