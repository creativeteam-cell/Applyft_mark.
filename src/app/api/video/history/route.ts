import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const pageToken = searchParams.get('pageToken') || undefined

  try {
    const drive = getDriveClient()
    const res = await (drive.files.list as any)({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${VIDEO_FOLDER_ID}' in parents and mimeType = 'video/mp4' and trashed = false`,
      fields: 'nextPageToken, files(id, name, description, createdTime, thumbnailLink, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 50,
      pageToken,
    })

    // REF_ files are uploaded motion-control reference videos — not generated results
    const files = ((res.data.files || []) as any[]).filter((f: any) => !String(f.name || '').startsWith('REF_'))
    const nextPageToken = res.data.nextPageToken || null

    const items = files.map((f: any) => {
      let meta: any = {}
      try { meta = JSON.parse(f.description || '{}') } catch {}
      return {
        id: f.id,
        name: f.name,
        prompt: meta.prompt || '',
        model: meta.model || 'kling-v3',
        duration: meta.duration || '5',
        aspectRatio: meta.aspectRatio || '16:9',
        sound: meta.sound || 'off',
        inputType: meta.inputType || 'text',
        klingVideoId: meta.klingVideoId || '',
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
    console.error('[video/history]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
