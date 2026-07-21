import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, setUserLimit, setVideoLimit, setDefaultLimit, getDefaultLimits } from '@/lib/adminStats'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ defaults: await getDefaultLimits() })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, limit, type, scope } = await req.json()

  // scope: 'default' — меняем дефолт для ВСЕХ новых; иначе личный лимит юзера
  if (scope === 'default') {
    await setDefaultLimit(type === 'video' ? 'video' : 'image', Math.max(0, Number(limit) || 0))
    return NextResponse.json({ success: true })
  }

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
  if (type === 'video') {
    await setVideoLimit(email, Math.max(0, Number(limit) || 0))
  } else {
    await setUserLimit(email, Math.max(0, Number(limit) || 0))
  }
  return NextResponse.json({ success: true })
}
