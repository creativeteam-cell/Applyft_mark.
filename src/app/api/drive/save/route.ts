import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient, invalidateCache } from '@/lib/googleDrive'
import { getNextLettersFromFolderNames } from '@/lib/letterSequence'
async function createFolder(drive: any, name: string, parentId: string): Promise<string> {
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  } as any)
  return res.data.id!
}

async function uploadImage(token: string, name: string, base64: string, parentId: string) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
  const imageBuffer = Buffer.from(base64Data, 'base64')

  const boundary = 'applyft_boundary_314159'
  const metadata = JSON.stringify({ name, parents: [parentId] })

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(body.length),
      },
      body,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Image upload failed: ${err}`)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appCode, marketerCode, images, mode, varNumber, varLetters } = await req.json()
  // images: Record<size, base64> — { '4x5': '...', '1x1': '...', '9x16': '...', '1.91x1': '...' }

  try {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!
    const userToken = (session as any).accessToken as string
    if (!userToken) throw new Error('No access token in session. Please sign out and sign in again.')

    // Находим папку приложения
    const appFolderRes = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${appCode})' and trashed = false`,
      fields: 'files(id, name)',
    })
    const appFolder = appFolderRes.data.files?.[0]
    if (!appFolder?.id) throw new Error(`App folder for ${appCode} not found on Drive`)

    let variantFolderName: string
    let enParentId: string

    if (mode === 'new') {
      // Находим все числовые папки, берём максимальный номер
      const numberFoldersRes = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `'${appFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        orderBy: 'name desc',
      })
      const numberFolders = numberFoldersRes.data.files || []

      // Парсим номера из имён вида UN_S_138
      let maxNum = 0
      for (const f of numberFolders) {
        const match = f.name?.match(/_S_(\d+)$/)
        if (match) {
          const num = parseInt(match[1])
          if (num > maxNum) maxNum = num
        }
      }

      const nextNum = maxNum + 1
      variantFolderName = `${appCode}_S_${String(nextNum).padStart(3, '0')}`

      // Создаём: numberFolder → variantFolder (то же имя) → EN
      const numberFolderId = await createFolder(drive, variantFolderName, appFolder.id)
      const variantFolderId = await createFolder(drive, variantFolderName, numberFolderId)
      enParentId = await createFolder(drive, 'EN', variantFolderId)

    } else {
      // Var mode — ищем существующую числовую папку
      const numberFolderName = `${appCode}_S_${String(varNumber).padStart(3, '0')}`
      const numberFolderRes = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `'${appFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${numberFolderName}' and trashed = false`,
        fields: 'files(id)',
      })
      const numberFolder = numberFolderRes.data.files?.[0]
      if (!numberFolder?.id) throw new Error(`Folder ${numberFolderName} not found on Drive`)

      // List existing variant folders to detect conflicts and ensure we use the freshest next name
      const existingVarFoldersRes = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `'${numberFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(name)',
      })
      const existingVarNames = (existingVarFoldersRes.data.files || []).map((f: any) => f.name as string)

      // Compute the actual next-available name (handles conflict if another user saved simultaneously)
      const proposedLetters = (varLetters as string[]).filter(Boolean)
      const proposedName = `${numberFolderName}_${proposedLetters.join('_')}`
      if (existingVarNames.includes(proposedName)) {
        // Conflict — recalculate
        const fresh = getNextLettersFromFolderNames(numberFolderName, existingVarNames)
        variantFolderName = fresh.variantFolderName
      } else {
        variantFolderName = proposedName
      }

      const variantFolderId = await createFolder(drive, variantFolderName, numberFolder.id)
      enParentId = await createFolder(drive, 'EN', variantFolderId)
    }

    // Загружаем все картинки
    const sizeMap: Record<string, string> = {
      '4x5': '4x5',
      '1x1': '1x1',
      '9x16': '9x16',
      '1.91x1': '1.91x1',
    }

    await Promise.all(
      Object.entries(images).map(async ([size, base64]) => {
        if (!base64) return
        const sizeName = sizeMap[size] || size
        const fileName = `${variantFolderName}_${sizeName}_${marketerCode}_EN.jpg`
        await uploadImage(userToken, fileName, base64 as string, enParentId)
      })
    )

    // Сбрасываем кэш чтоб новый креатив появился в гриде
    invalidateCache(appCode)

    return NextResponse.json({ success: true, folderName: variantFolderName })
  } catch (e: any) {
    console.error('Drive save error:', e)
    return NextResponse.json({ error: e.message || 'Failed to save' }, { status: 500 })
  }
}
