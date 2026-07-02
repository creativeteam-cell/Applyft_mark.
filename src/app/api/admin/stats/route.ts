import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, getAllUserStats, getAllLimits, checkAndResetMonth } from '@/lib/adminStats'
import { getDriveClient } from '@/lib/googleDrive'

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const drive = getDriveClient()
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${FOLDER_ID}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(description)',
    orderBy: 'createdTime desc',
    pageSize: 200,
  } as any) as any

  const files = (res.data.files || []) as any[]
  const userMap = new Map<string, { email: string; name: string; image: string }>()
  for (const f of files) {
    try {
      const meta = JSON.parse(f.description || '{}')
      if (meta.userEmail && !userMap.has(meta.userEmail)) {
        userMap.set(meta.userEmail, {
          email: meta.userEmail,
          name: meta.userName || meta.userEmail,
          image: meta.userImage || '',
        })
      }
    } catch {}
  }

  const knownEmails = Array.from(userMap.keys())
  let [stats, limits] = await Promise.all([
    getAllUserStats(knownEmails),
    getAllLimits(knownEmails),
  ])

  // Check if month rolled over — if so, snapshot was saved and counters reset
  const usersForReset = stats.map(s => ({
    email: s.email,
    name: userMap.get(s.email)?.name || s.email,
    imageCount: s.imageCount,
  }))
  const didReset = await checkAndResetMonth(usersForReset)
  if (didReset) {
    // Re-fetch counts (they are now 0)
    stats = await getAllUserStats(knownEmails)
  }

  const users = stats.map(s => ({
    ...s,
    name: userMap.get(s.email)?.name || s.email,
    image: userMap.get(s.email)?.image || '',
    limit: limits[s.email] ?? 0,
  })).sort((a, b) => b.imageCount - a.imageCount)

  return NextResponse.json({ users, adminEmails })
}
