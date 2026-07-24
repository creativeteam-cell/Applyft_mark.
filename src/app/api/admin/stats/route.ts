import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminEmails, getAllUserStats, getAllLimits, checkAndResetMonth, getAllVideoStats, getAllVideoLimits } from '@/lib/adminStats'
import { getDriveClient } from '@/lib/googleDrive'

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!
const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = await getAdminEmails()
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
  const drive = getDriveClient()
  // Собираем пользователей из ОБЕИХ папок — картинок и видео, иначе тот, кто
  // делал только видео (без картинок), не попадёт в список
  const listFolder = (folderId: string) => drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(description)',
    orderBy: 'createdTime desc',
    pageSize: 200,
  } as any) as any

  // allSettled: если одна из папок не отдалась — не роняем весь список
  const results = await Promise.allSettled([
    listFolder(FOLDER_ID),
    VIDEO_FOLDER_ID ? listFolder(VIDEO_FOLDER_ID) : Promise.resolve({ data: { files: [] } }),
  ])
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(`[admin/stats] folder ${i} list failed:`, r.reason?.message) })
  const files = results.flatMap((r: any) => (r.status === 'fulfilled' ? (r.value?.data?.files || []) : [])) as any[]

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
  let [stats, limits, videoStats, videoLimits] = await Promise.all([
    getAllUserStats(knownEmails),
    getAllLimits(knownEmails),
    getAllVideoStats(knownEmails),
    getAllVideoLimits(knownEmails),
  ])

  // Месячный снапшот — некритичен для отображения; изолируем, чтобы его сбой
  // не обнулял всю статистику.
  try {
    const usersForReset = stats.map(s => ({
      email: s.email,
      name: userMap.get(s.email)?.name || s.email,
      imageCount: s.imageCount,
    }))
    const didReset = await checkAndResetMonth(usersForReset)
    if (didReset) stats = await getAllUserStats(knownEmails)
  } catch (e: any) {
    console.error('[admin/stats] checkAndResetMonth failed:', e?.message)
  }

  const videoStatsMap = Object.fromEntries(videoStats.map(v => [v.email, v.videoUnits]))

  const users = stats.map(s => ({
    ...s,
    name: userMap.get(s.email)?.name || s.email,
    image: userMap.get(s.email)?.image || '',
    limit: limits[s.email] ?? 0,
    videoUnits: videoStatsMap[s.email] ?? 0,
    videoLimit: videoLimits[s.email] ?? 50,
  })).sort((a, b) => b.imageCount - a.imageCount)

  return NextResponse.json({ users, adminEmails })
  } catch (e: any) {
    console.error('[admin/stats]', e)
    // Не роняем панель: отдаём хотя бы список админов, статистика подтянется позже
    return NextResponse.json({ users: [], adminEmails, error: e.message }, { status: 200 })
  }
}
