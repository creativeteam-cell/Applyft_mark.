import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!
const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

// Полный список генеривших пользователей (как в админке): скан обеих папок Drive.
// Доступен любому авторизованному — нужен для фильтра людей в Image/Video.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const drive = getDriveClient()
    const listFolder = (folderId: string) => drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(description)',
      orderBy: 'createdTime desc',
      pageSize: 200,
    } as any) as any

    const results = await Promise.all([
      listFolder(FOLDER_ID),
      VIDEO_FOLDER_ID ? listFolder(VIDEO_FOLDER_ID) : Promise.resolve({ data: { files: [] } }),
    ])
    const files = results.flatMap((r: any) => (r.data.files || [])) as any[]

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

    return NextResponse.json({ users: Array.from(userMap.values()) }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (e: any) {
    console.error('[users]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
