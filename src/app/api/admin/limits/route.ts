import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, setUserLimit, setVideoLimit } from '@/lib/adminStats'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, limit, type } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  if (type === 'video') {
    await setVideoLimit(email, Math.max(0, Number(limit) || 0))
  } else {
    await setUserLimit(email, Math.max(0, Number(limit) || 0))
  }
  return NextResponse.json({ success: true })
}
