import { getDriveClient } from './googleDrive'

export interface App {
  code: string
  name: string
  description: string
  style: string
  colors: string
  restrictions: string
  active: boolean
}

const APPS_FILE_NAME = 'creative-studio-apps.json'
const CONFIG_FOLDER_ID = process.env.GOOGLE_DRIVE_CONFIG_FOLDER_ID!

async function findAppsFile(): Promise<string | null> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name = '${APPS_FILE_NAME}' and '${CONFIG_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0]?.id || null
}

export async function getApps(): Promise<App[]> {
  try {
    const drive = getDriveClient()
    const fileId = await findAppsFile()

    if (!fileId) return getDefaultApps()

    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true } as any,
      { responseType: 'text' }
    )

    return JSON.parse(res.data as string)
  } catch (e) {
    console.error('Failed to load apps:', e)
    return getDefaultApps()
  }
}

export async function saveApps(apps: App[]): Promise<void> {
  const drive = getDriveClient()
  const content = JSON.stringify(apps, null, 2)
  const fileId = await findAppsFile()

  if (fileId) {
    await drive.files.update({
      fileId,
      supportsAllDrives: true,
      requestBody: {},
      media: {
        mimeType: 'application/json',
        body: content,
      },
    } as any)
  } else {
    await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: APPS_FILE_NAME,
        parents: [CONFIG_FOLDER_ID],
      },
      media: {
        mimeType: 'application/json',
        body: content,
      },
    } as any)
  }
}

export async function getActiveApps(): Promise<App[]> {
  const apps = await getApps()
  return apps.filter(a => a.active)
}

function getDefaultApps(): App[] {
  return [
    { code: 'UN', name: 'Universal Locators', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'KD', name: 'Kidden', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'LM', name: 'Looma', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'TR', name: 'Trace', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'GZ', name: 'GeoZilla', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'FA', name: 'FamLocate', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'FL', name: 'Family Locator', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'FM', name: 'Familo', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'SF', name: 'SafetyTips', description: '', style: '', colors: '', restrictions: '', active: true },
    { code: 'RL', name: 'Refinely', description: '', style: '', colors: '', restrictions: '', active: true },
  ]
}
