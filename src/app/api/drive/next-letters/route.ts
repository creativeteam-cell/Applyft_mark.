import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient } from '@/lib/googleDrive'

// Convert a 0-based index to letter sequence:
// 0→['a'], 1→['b'], ..., 25→['z'],
// 26→['a','a'], 27→['a','b'], ..., 701→['z','z'],
// 702→['a','a','a'], ...
function indexToLetters(n: number): string[] {
  if (n < 26) return [String.fromCharCode(97 + n)]
  n -= 26
  if (n < 26 * 26) {
    return [
      String.fromCharCode(97 + Math.floor(n / 26)),
      String.fromCharCode(97 + (n % 26)),
    ]
  }
  n -= 26 * 26
  return [
    String.fromCharCode(97 + Math.floor(n / (26 * 26))),
    String.fromCharCode(97 + Math.floor((n % (26 * 26)) / 26)),
    String.fromCharCode(97 + (n % 26)),
  ]
}

function lettersToIndex(letters: string[]): number {
  if (letters.length === 1) return letters[0].charCodeAt(0) - 97
  if (letters.length === 2) {
    return 26 + (letters[0].charCodeAt(0) - 97) * 26 + (letters[1].charCodeAt(0) - 97)
  }
  // 3 letters
  return (
    26 + 676 +
    (letters[0].charCodeAt(0) - 97) * 676 +
    (letters[1].charCodeAt(0) - 97) * 26 +
    (letters[2].charCodeAt(0) - 97)
  )
}

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
    const variantFolders = variantFoldersRes.data.files || []

    // Find max letter index among existing variants
    let maxIndex = -1
    const prefix = numberFolderName + '_'
    for (const f of variantFolders) {
      if (!f.name?.startsWith(prefix)) continue
      const suffix = f.name.slice(prefix.length)
      const parts = suffix.split('_')
      // Only count valid letter parts (1-3 single lowercase letters)
      if (
        parts.length >= 1 &&
        parts.length <= 3 &&
        parts.every(p => p.length === 1 && p >= 'a' && p <= 'z')
      ) {
        const idx = lettersToIndex(parts)
        if (idx > maxIndex) maxIndex = idx
      }
    }

    const nextLetters = indexToLetters(maxIndex + 1)
    const variantFolderName = `${numberFolderName}_${nextLetters.join('_')}`
    return NextResponse.json({ letters: nextLetters, variantFolderName })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
