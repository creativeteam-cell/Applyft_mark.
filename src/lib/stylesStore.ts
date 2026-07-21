// Кастомные стили генератора (общие для всех). Стиль = текст-суффикс к промпту.
// Хранится JSON в конфиг-папке Drive. Картинка-превью опциональна (base64, сжатая).
import { getDriveClient } from './googleDrive'

export interface CustomStyle {
  id: string
  name: string
  suffix: string          // текст, дописываемый к промпту
  image: string | null    // base64 превью (data:...) или null → плейсхолдер
  uses: number            // счётчик использований (для сортировки)
  createdBy: string       // email автора — только он редактирует/удаляет
  createdByName: string
  createdAt: string
}

export interface StylesData { styles: CustomStyle[] }

const FILE_NAME = 'creative-custom-styles.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

async function findFile(): Promise<string | null> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name = '${FILE_NAME}' and '${CONFIG_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0]?.id || null
}

let cache: { at: number; data: StylesData } | null = null

export async function getStyles(): Promise<StylesData> {
  try {
    const drive = getDriveClient()
    const fileId = await findFile()
    if (!fileId) return { styles: [] }
    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true } as any, { responseType: 'text' })
    const data = JSON.parse(res.data as string)
    return { styles: Array.isArray(data.styles) ? data.styles : [] }
  } catch (e) {
    console.error('[stylesStore] load failed:', e)
    return { styles: [] }
  }
}

export async function getStylesCached(ttlMs = 60_000): Promise<StylesData> {
  if (cache && Date.now() - cache.at < ttlMs) return cache.data
  const data = await getStyles()
  cache = { at: Date.now(), data }
  return data
}

export async function saveStyles(data: StylesData): Promise<void> {
  cache = null
  const drive = getDriveClient()
  const content = JSON.stringify(data, null, 2)
  const fileId = await findFile()
  if (fileId) {
    await drive.files.update({ fileId, supportsAllDrives: true, requestBody: {}, media: { mimeType: 'application/json', body: content } } as any)
  } else {
    await drive.files.create({ supportsAllDrives: true, requestBody: { name: FILE_NAME, parents: [CONFIG_FOLDER_ID] }, media: { mimeType: 'application/json', body: content } } as any)
  }
}
