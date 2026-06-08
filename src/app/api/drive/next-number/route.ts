import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  if (!appCode) return NextResponse.json({ error: 'No app code' }, { status: 400 })

  try {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!

    const appFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${appCode})' and trashed = false`,
      fields: 'files(id)',
    })
    const appFolder = appFolderRes.data.files?.[0]
    if (!appFolder?.id) return NextResponse.json({ nextName: `${appCode}_S_001` })

    const foldersRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${appFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(name)',
    })

    let maxNum = 0
    for (const f of foldersRes.data.files || []) {
      const match = f.name?.match(/_S_(\d+)$/)
      if (match) {
        const num = parseInt(match[1])
        if (num > maxNum) maxNum = num
      }
    }

    const nextName = `${appCode}_S_${String(maxNum + 1).padStart(3, '0')}`
    return NextResponse.json({ nextName })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
