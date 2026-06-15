import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

// Simple in-memory cache: folderId → fileId (survives warm instances)
const previewCache = new Map<string, string>()

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get('folderId')
  if (!folderId) return NextResponse.json({ error: 'folderId required' }, { status: 400 })

  const cached = previewCache.get(folderId)
  if (cached) return NextResponse.json({ fileId: cached })

  try {
    const drive = getDriveClient()

    // 1. List language subfolders of the variant folder
    const subRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    })
    const subfolders = subRes.data.files || []

    // 2. Prefer EN, fall back to first available language folder
    const enFolder = subfolders.find(f => f.name?.toUpperCase() === 'EN')
    const targetFolder = enFolder || subfolders[0]
    if (!targetFolder?.id) return NextResponse.json({ fileId: null })

    // 3. List image files in that language folder
    const filesRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${targetFolder.id}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name)',
    })
    const files = filesRes.data.files || []
    if (files.length === 0) return NextResponse.json({ fileId: null })

    // 4. Prefer 4x5, fall back to any image
    const file4x5 = files.find(f => f.name?.includes('4x5'))
    const chosen = file4x5 || files[0]

    previewCache.set(folderId, chosen.id!)
    return NextResponse.json({ fileId: chosen.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
