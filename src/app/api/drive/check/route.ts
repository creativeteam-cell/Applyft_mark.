import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appCode, varNumber, varLetters } = await req.json()

  try {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!

    // Находим папку приложения по коду
    const appFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${appCode})' and trashed = false`,
      fields: 'files(id, name)',
    })
    const appFolder = appFolderRes.data.files?.[0]
    if (!appFolder?.id) return NextResponse.json({ exists: false })

    // Находим числовую папку UN_S_{varNumber}
    const numberFolderName = `${appCode}_S_${varNumber}`
    const numberFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${appFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${numberFolderName}' and trashed = false`,
      fields: 'files(id, name)',
    })
    const numberFolder = numberFolderRes.data.files?.[0]
    if (!numberFolder?.id) return NextResponse.json({ exists: false })

    // Строим имя вариантной папки: UN_S_138_a или UN_S_138_a_b
    const letters = (varLetters as string[]).filter(Boolean)
    const variantFolderName = `${numberFolderName}_${letters.join('_')}`

    // Проверяем существование вариантной папки
    const variantRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${numberFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${variantFolderName}' and trashed = false`,
      fields: 'files(id)',
    })

    return NextResponse.json({ exists: (variantRes.data.files?.length || 0) > 0, variantFolderName })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
