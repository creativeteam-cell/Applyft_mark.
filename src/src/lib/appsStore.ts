import { getDriveClient } from './googleDrive'

export interface App {
  code: string
  name: string
  description: string
  painPoints: string[]
  style: string
  colors: string
  restrictions: string
  active: boolean
}

export interface Marketer {
  code: string
  name: string
}

export interface ConfigData {
  apps: App[]
  marketers: Marketer[]
}

const CONFIG_FILE_NAME = 'creative-studio-config.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

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
    return JSON.parse(res.data as string)
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
      { code: 'UN', name: 'Universal Locators', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'KD', name: 'Kidden', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'LM', name: 'Looma', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'TR', name: 'Trace', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'GZ', name: 'GeoZilla', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'FA', name: 'FamLocate', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'FL', name: 'Family Locator', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'FM', name: 'Familo', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'SF', name: 'SafetyTips', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
      { code: 'RL', name: 'Refinely', description: '', painPoints: [], style: '', colors: '', restrictions: '', active: true },
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
  }
}
