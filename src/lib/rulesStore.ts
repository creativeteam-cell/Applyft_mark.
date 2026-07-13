// Стор выученных правил ("память команды").
// Фиксы СП абстрагируются GPT в общие правила и хранятся в Drive JSON —
// затем подмешиваются в промпты генерации/рекомпозиции по тегам (формат, приложение).
import { getDriveClient } from './googleDrive'

export interface LearnedRule {
  id: string
  rule: string          // обобщённое правило на английском (для промптов)
  element: string       // cta | headline | logo | background | layout | color | text | other
  sizes: string[]       // ['9x16', ...]; пустой массив = все форматы
  appCodes: string[]    // ['FL', ...]; пустой массив = все приложения
  weight: number        // сколько раз правило подкреплялось фиксами
  examples: string[]    // исходные тексты фиксов (до 5 последних)
  active: boolean       // выключенные правила не попадают в промпты
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface RulesData { rules: LearnedRule[] }

const RULES_FILE_NAME = 'creative-learned-rules.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

async function findRulesFile(): Promise<string | null> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name = '${RULES_FILE_NAME}' and '${CONFIG_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0]?.id || null
}

export async function getRules(): Promise<RulesData> {
  try {
    const drive = getDriveClient()
    const fileId = await findRulesFile()
    if (!fileId) return { rules: [] }
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true } as any,
      { responseType: 'text' }
    )
    const data = JSON.parse(res.data as string)
    return { rules: Array.isArray(data.rules) ? data.rules : [] }
  } catch (e) {
    console.error('[rulesStore] load failed:', e)
    return { rules: [] }
  }
}

// Кэш на 5 минут — чтобы не читать Drive на каждую генерацию
let rulesCache: { at: number; data: RulesData } | null = null

export async function getRulesCached(ttlMs = 5 * 60 * 1000): Promise<RulesData> {
  if (rulesCache && Date.now() - rulesCache.at < ttlMs) return rulesCache.data
  const data = await getRules()
  rulesCache = { at: Date.now(), data }
  return data
}

export async function saveRules(data: RulesData): Promise<void> {
  rulesCache = null // инвалидация кэша при записи
  const drive = getDriveClient()
  const content = JSON.stringify(data, null, 2)
  const fileId = await findRulesFile()
  if (fileId) {
    await drive.files.update({
      fileId,
      supportsAllDrives: true,
      requestBody: {},
      media: { mimeType: 'application/json', body: content },
    } as any)
  } else {
    await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: RULES_FILE_NAME, parents: [CONFIG_FOLDER_ID] },
      media: { mimeType: 'application/json', body: content },
    } as any)
  }
}

/** Отбор правил для промпта: фильтр по формату и приложению, топ по весу. */
export function selectRulesForPrompt(all: LearnedRule[], size?: string, appCode?: string, limit = 10): LearnedRule[] {
  return all
    .filter(r => r.active)
    .filter(r => r.sizes.length === 0 || (size && r.sizes.includes(size)))
    .filter(r => r.appCodes.length === 0 || (appCode && r.appCodes.includes(appCode)))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
}

/** Готовый блок для вставки в промпт (или пустая строка). */
export function buildRulesPromptBlock(rules: LearnedRule[]): string {
  if (rules.length === 0) return ''
  return `\n\nLEARNED TEAM PREFERENCES — accumulated from creative producers' past corrections. Follow these unless they conflict with an explicit instruction above:\n${rules.map(r => `- ${r.rule}`).join('\n')}`
}
