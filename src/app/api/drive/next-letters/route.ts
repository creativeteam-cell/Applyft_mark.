import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient } from '@/lib/googleDrive'
import { getNextLettersFromFolderNames } from '@/lib/letterSequence'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  const varNumber = searchParams.get('varNumber')
  if (!appCode || !varNumber) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const numberFolderName = `${appCode}_S_${String(varNumber).padStart(3, '0')}`
  const defaultResponse = { letters: ['a'], variantFolderName: `${numberFolderName}_a` }

  try {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!

    // Find app folder
    const appFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${appCode})' and trashed = false`,
      fields: 'files(id)',
    })
    const appFolder = appFolderRes.data.files?.[0]
    if (!appFolder?.id) return NextResponse.json(defaultResponse)

    // Find number folder
    const numberFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${appFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${numberFolderName}' and trashed = false`,
      fields: 'files(id)',
    })
    const numberFolder = numberFolderRes.data.files?.[0]
    if (!numberFolder?.id) return NextResponse.json(defaultResponse)

    // List existing variant folders inside number folder
    const variantFoldersRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${numberFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(name)',
    })
    const existingNames = (variantFoldersRes.data.files || []).map((f: any) => f.name as string)

    const result = getNextLettersFromFolderNames(numberFolderName, existingNames)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
