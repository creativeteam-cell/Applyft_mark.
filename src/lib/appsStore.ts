import { getDriveClient } from './googleDrive'

export interface App {
  code: string
  name: string
  description: string
  painPoints: string[]
  hooks?: string[]
  active: boolean
  logoBase64?: string  // legacy, kept for backward compat
  logos?: string[]     // multiple logos (base64 array)
}

export interface Marketer {
  code: string
  name: string
}

export interface Language {
  code: string
  name: string
}

export interface CreativeConcept {
  id: string
  emoji: string
  concept: string // текстовое описание концепта от GPT
  createdAt: string
}

export interface ConfigData {
  apps: App[]
  marketers: Marketer[]
  languages: Language[]
  concepts: Record<string, CreativeConcept[]> // appCode → concepts
}

const CONFIG_FILE_NAME = 'creative-studio-config.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

const CONCEPT_EMOJIS = ['🔥', '💡', '🎯', '⚡', '🌊', '🎪', '🔮', '💎', '🦋', '🌪️', '🎭', '🧨', '💥', '🌙', '🔑']

export function getNextEmoji(existingConcepts: CreativeConcept[]): string {
  const used = existingConcepts.map(c => c.emoji)
  const available = CONCEPT_EMOJIS.filter(e => !used.includes(e))
  if (available.length === 0) return '✨' // fallback
  return available[Math.floor(Math.random() * available.length)]
}

async function findConfigFile(): Promise<string | null> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name = '${CONFIG_FILE_NAME}' and '${CONFIG_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0]?.id || null
}

export async function getConfig(): Promise<ConfigData> {
  try {
    const drive = getDriveClient()
    const fileId = await findConfigFile()
    if (!fileId) return getDefaultConfig()

    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true } as any,
      { responseType: 'text' }
    )
    const data = JSON.parse(res.data as string)
    if (!data.concepts) data.concepts = {}
    if (!data.languages) data.languages = getDefaultConfig().languages
    return data
  } catch (e) {
    console.error('Failed to load config:', e)
    return getDefaultConfig()
  }
}

export async function saveConfig(config: ConfigData): Promise<void> {
  const drive = getDriveClient()
  const content = JSON.stringify(config, null, 2)
  const fileId = await findConfigFile()

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
      requestBody: { name: CONFIG_FILE_NAME, parents: [CONFIG_FOLDER_ID] },
      media: { mimeType: 'application/json', body: content },
    } as any)
  }
}

function getDefaultConfig(): ConfigData {
  return {
    apps: [
      { code: 'UN', name: 'Universal Locators', description: '', painPoints: [], active: true },
      { code: 'KD', name: 'Kidden', description: '', painPoints: [], active: true },
      { code: 'LM', name: 'Looma', description: '', painPoints: [], active: true },
      { code: 'TR', name: 'Trace', description: '', painPoints: [], active: true },
      { code: 'GZ', name: 'GeoZilla', description: '', painPoints: [], active: true },
      { code: 'FA', name: 'FamLocate', description: '', painPoints: [], active: true },
      { code: 'FL', name: 'Family Locator', description: '', painPoints: [], active: true },
      { code: 'FM', name: 'Familo', description: '', painPoints: [], active: true },
      { code: 'SF', name: 'SafetyTips', description: '', painPoints: [], active: true },
      { code: 'RL', name: 'Refinely', description: '', painPoints: [], active: true },
    ],
    marketers: [
      { code: 'TMK', name: 'Tetiana Melnyk' },
      { code: 'KZA', name: 'Kseniia Zadoia' },
      { code: 'AHB', name: 'Anhelina Halbul' },
      { code: 'ASR', name: 'Artem Sierov' },
      { code: 'SMV', name: 'Sofiia Matviikiv' },
      { code: 'DDT', name: 'Diana Drobotey' },
      { code: 'VTL', name: 'Vladyslava Tsymbal' },
      { code: 'YKH', name: 'Yuliia Khomukha' },
      { code: 'DKR', name: 'Danylo Kyrylov' },
      { code: 'ASM', name: 'Antonina Samoliuk' },
      { code: 'NBL', name: 'Nataliia Bielousova' },
      { code: 'RSK', name: 'Romana Skrabut' },
      { code: 'KIS', name: 'Kseniia Ilienko' },
      { code: 'MMM', name: 'Mariia Minaieva' },
    ],
    languages: [
      { code: 'EN', name: 'English' },
      { code: 'PT', name: 'Portuguese' },
      { code: 'SP', name: 'Spanish' },
      { code: 'FR', name: 'French' },
      { code: 'DE', name: 'German' },
      { code: 'IT', name: 'Italian' },
      { code: 'RU', name: 'Russian' },
      { code: 'UA', name: 'Ukrainian' },
      { code: 'AR', name: 'Arabic' },
      { code: 'JP', name: 'Japanese' },
      { code: 'KR', name: 'Korean' },
      { code: 'HE', name: 'Hebrew' },
      { code: 'BG', name: 'Bulgarian' },
      { code: 'CN', name: 'Chinese' },
      { code: 'CZ', name: 'Czech' },
      { code: 'ND', name: 'Dutch' },
      { code: 'HI', name: 'Hindi' },
      { code: 'PL', name: 'Polish' },
      { code: 'TW', name: 'Taiwan' },
    ],
    concepts: {},
  }
}
