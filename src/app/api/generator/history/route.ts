import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const pageToken = searchParams.get('pageToken') || undefined

  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${FOLDER_ID}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name, description, createdTime, thumbnailLink, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      pageToken,
    } as any) as any

    const files = (res.data.files || []) as any[]
    const nextPageToken = res.data.nextPageToken || null

    const items = files.map((f: any) => {
      let meta: any = {}
      try { meta = JSON.parse(f.description || '{}') } catch {}
      return {
        id: f.id,
        name: f.name,
        prompt: meta.prompt || '',
        engine: meta.engine || 'Banana',
        size: meta.size || '',
        userName: meta.userName || '',
        userEmail: meta.userEmail || '',
        userImage: meta.userImage || '',
        thumbnailLink: f.thumbnailLink || null,
        webViewLink: f.webViewLink || null,
        createdTime: f.createdTime,
      }
    })

    return NextResponse.json({ items, nextPageToken })
  } catch (e: any) {
    console.error('[generator/history]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
