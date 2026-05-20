import { google } from 'googleapis'

// Список приложений в нужном порядке
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

// Размеры в нужном порядке
export const SIZES = ['1x1', '4x5', '1.91x1', '9x16']

function getAuthClient() {
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  
  return new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
}

export function getDriveClient() {
  const auth = getAuthClient()
  return google.drive({ version: 'v3', auth })
}

// Получить список папок внутри папки
export async function listFolders(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'name desc',
  })
  return res.data.files || []
}

// Получить список файлов внутри папки
export async function listFiles(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
  })
  return res.data.files || []
}

// Найти папку приложения по коду (UN, KD, etc.)
export async function findAppFolder(code: string) {
  const drive = getDriveClient()
  const rootFolderId = process.env.GOOGLE_DRIVE_STATICS_FOLDER_ID!
  
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '(${code})' and trashed = false`,
    fields: 'files(id, name)',
  })
  
  return res.data.files?.[0] || null
}

export interface Creative {
  id: string          // ST_S_051_b
  appCode: string     // ST
  variantFolder: string // ST_S_051_b
  images: {
    size: string      // 1x1, 4x5, etc.
    fileId: string
    fileName: string
    url: string
  }[]
}

// Получить креативы для одного приложения
export async function getCreativesForApp(appCode: string, limit = 20): Promise<Creative[]> {
  const appFolder = await findAppFolder(appCode)
  if (!appFolder?.id) return []

  // Папки с номерами (ST_S_052, ST_S_051, ...)
  const numberFolders = await listFolders(appFolder.id)
  
  const creatives: Creative[] = []

  for (const numFolder of numberFolders.slice(0, limit)) {
    if (!numFolder.id) continue
    
    // Папки с вариантами (ST_S_051_b, ST_S_051_a, ST_S_051)
    const variantFolders = await listFolders(numFolder.id)
    
    for (const variantFolder of variantFolders) {
      if (!variantFolder.id) continue
      
      // Папки с языками (EN, UA, SP, ...)
      const langFolders = await listFolders(variantFolder.id)
      
      // Берём EN или первый попавшийся
      const langFolder = langFolders.find(f => f.name === 'EN') || langFolders[0]
      if (!langFolder?.id) continue
      
      // Файлы с картинками
      const files = await listFiles(langFolder.id)
      
      // Сортируем по размерам
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

      if (images.length > 0) {
        creatives.push({
          id: `${variantFolder.name}`,
          appCode,
          variantFolder: variantFolder.name || '',
          images,
        })
      }
    }
  }

  return creatives
}
