// Заготовки промптов ("скилы", общие для всех). Большой детальный пред-промт,
// который смешивается с коротким промптом пользователя по команде /<command>.
// Хранится JSON в конфиг-папке Drive.
import { getDriveClient } from './googleDrive'

export interface PromptTemplate {
  id: string
  name: string           // человекочитаемое имя
  command: string        // тег без слэша (напр. "mipromt") — вызов через /mipromt
  body: string           // большой пред-промт со всеми деталями
  uses: number           // счётчик использований (для сортировки)
  createdBy: string      // email автора — только он редактирует/удаляет
  createdByName: string
  createdAt: string
}

export interface TemplatesData { templates: PromptTemplate[] }

const FILE_NAME = 'creative-prompt-templates.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

// Нормализация команды: без слэша, нижний регистр, только [a-z0-9_-]
export function normalizeCommand(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32)
}

async function findFile(): Promise<string | null> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name = '${FILE_NAME}' and '${CONFIG_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0]?.id || null
}

let cache: { at: number; data: TemplatesData } | null = null

export async function getTemplates(): Promise<TemplatesData> {
  try {
    const drive = getDriveClient()
    const fileId = await findFile()
    if (!fileId) return { templates: [] }
    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true } as any, { responseType: 'text' })
    const data = JSON.parse(res.data as string)
    return { templates: Array.isArray(data.templates) ? data.templates : [] }
  } catch (e) {
    console.error('[promptTemplatesStore] load failed:', e)
    return { templates: [] }
  }
}

export async function getTemplatesCached(ttlMs = 60_000): Promise<TemplatesData> {
  if (cache && Date.now() - cache.at < ttlMs) return cache.data
  const data = await getTemplates()
  cache = { at: Date.now(), data }
  return data
}

export async function saveTemplates(data: TemplatesData): Promise<void> {
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
