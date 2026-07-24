import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails } from '@/lib/adminStats'

// Лёгкая проверка админ-статуса (без сканирования Drive) — от неё зависит
// показ админ-панели. Не должна падать из-за тяжёлой статистики.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ isAdmin: false })
  try {
    const adminEmails = await getAdminEmails()
    return NextResponse.json({ isAdmin: adminEmails.includes(session.user.email), adminEmails })
  } catch (e: any) {
    console.error('[admin/check]', e)
    return NextResponse.json({ isAdmin: false, error: e.message })
  }
}
