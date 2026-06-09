import { google } from 'googleapis'

export const APPS = [
  { code: 'UN', name: 'Universal Locators' },
  { code: 'KD', name: 'Kidden' },
  { code: 'LM', name: 'Looma' },
  { code: 'TR', name: 'Trace' },
  { code: 'GZ', name: 'GeoZilla' },
  { code: 'FA', name: 'FamLocate' },
  { code: 'FL', name: 'Family Locator' },
  { code: 'FM', name: 'Familo' },
  { code: 'SF', name: 'SafetyTips' },
  { code: 'RL', name: 'Refinely' },
]

export const SIZES = ['1x1', '4x5', '1.91x1', '9x16']

// Кэш: appCode → { data, expiresAt }
const cache = new Map<string, { data: Creative[]; expiresAt: number }>()
const CACHE_TTL = 10 * 60 * 1000 // 10 минут

export function getAuthClient() {
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuthClient() })
}

async function listFolders(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, createdTime)',
  })
  return res.data.files || []
}

async function listFiles(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
  })
  return res.data.files || []
}

async function findAppFolder(code: string) {
  const drive = getDriveClient()
  const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${code})' and trashed = false`,
    fields: 'files(id, name)',
  })
  return res.data.files?.[0] || null
}

export interface Creative {
  id: string
  appCode: string
  variantFolder: string
  variantFolderId: string
  images: {
    size: string
    fileId: string
    fileName: string
    url: string
  }[]
}

export async function getCreativesForApp(appCode: string): Promise<Creative[]> {
  // Проверяем кэш
  const cached = cache.get(appCode)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const appFolder = await findAppFolder(appCode)
  if (!appFolder?.id) return []

  const numberFolders = await listFolders(appFolder.id)

  // Параллельно обрабатываем все числовые папки
  const creativesNested = await Promise.all(
    numberFolders.map(async (numFolder) => {
      if (!numFolder.id) return []

      const variantFolders = await listFolders(numFolder.id)

      // Параллельно обрабатываем все вариантные папки
      const variants = await Promise.all(
        variantFolders.map(async (variantFolder) => {
          if (!variantFolder.id) return null

          const langFolders = await listFolders(variantFolder.id)
          const langFolder = langFolders.find(f => f.name === 'EN') || langFolders[0]
          if (!langFolder?.id) return null

          const files = await listFiles(langFolder.id)

          const images = SIZES.map(size => {
            const file = files.find(f => f.name?.includes(`_${size}_`))
            if (!file?.id) return null
            return {
              size,
              fileId: file.id,
              fileName: file.name || '',
              url: `/api/image?id=${file.id}`,
            }
          }).filter(Boolean) as Creative['images']

          if (images.length === 0) return null

          return {
            createdTime: (variantFolder as any).createdTime as string || '0',
            creative: {
              id: variantFolder.name || '',
              appCode,
              variantFolder: variantFolder.name || '',
              variantFolderId: variantFolder.id || '',
              images,
            } as Creative,
          }
        })
      )

      return variants.filter(Boolean) as { createdTime: string; creative: Creative }[]
    })
  )

  // Сортируем все варианты по дате создания (новые первые)
  const creatives = creativesNested
    .flat()
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
    .map(item => item.creative)

  // Сохраняем в кэш
  cache.set(appCode, { data: creatives, expiresAt: Date.now() + CACHE_TTL })

  return creatives
}

// Принудительно сбросить кэш для приложения (если нужно)
export function invalidateCache(appCode?: string) {
  if (appCode) cache.delete(appCode)
  else cache.clear()
}
