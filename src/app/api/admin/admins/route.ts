import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, addAdminEmail, removeAdminEmail } from '@/lib/adminStats'

async function checkAdmin(email: string) {
  const admins = await getAdminEmails()
  return admins.includes(email)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await checkAdmin(session.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await req.json()
  if (!email?.includes('@')) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const updated = await addAdminEmail(email.trim().toLowerCase())
  return NextResponse.json({ adminEmails: updated })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await checkAdmin(session.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await req.json()
  try {
    const updated = await removeAdminEmail(email, session.user.email)
    return NextResponse.json({ adminEmails: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
