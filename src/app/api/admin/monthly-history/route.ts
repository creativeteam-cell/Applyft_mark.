import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, listMonthlyStats, getMonthlyStat } from '@/lib/adminStats'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')

  if (fileId) {
    // Return a specific month's data
    const data = await getMonthlyStat(fileId)
    return NextResponse.json(data)
  }

  // Return list of available months
  const months = await listMonthlyStats()
  return NextResponse.json({ months })
}
