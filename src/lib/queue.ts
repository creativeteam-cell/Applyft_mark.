// Cross-device AI queue tracking via a heartbeat file in Google Drive.
// Each model writes a timestamp when active, 0 when idle.
// No read-modify-write race condition — each model field is independent.
// Heartbeats expire after BEAT_EXPIRE_MS for crash protection.

import { getDriveClient } from './googleDrive'

const BEAT_FILE = '_qbeat.json'
const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!
const BEAT_EXPIRE_MS = 45_000 // 45 seconds

export interface QueueState {
  gemini: number
  openai: number
}

interface BeatFile {
  gemini?: number  // unix ms timestamp (0 = idle)
  openai?: number
}

async function findBeatFileId(): Promise<string | null> {
  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${BEAT_FILE}' and trashed = false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return res.data.files?.[0]?.id ?? null
  } catch (e) {
    console.error('[queue] findBeatFileId error:', e)
    return null
  }
}

async function readBeatFile(): Promise<BeatFile> {
  try {
    const drive = getDriveClient()
    const fileId = await findBeatFileId()
    if (!fileId) return {}
    const res = await (drive.files.get as any)(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    ) as any
    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return JSON.parse(raw)
  } catch (e) {
    console.error('[queue] readBeatFile error:', e)
    return {}
  }
}

async function writeBeatFile(data: BeatFile): Promise<void> {
  try {
    const drive = getDriveClient()
    const content = JSON.stringify(data)
    const fileId = await findBeatFileId()
    if (fileId) {
      await (drive.files.update as any)({
        fileId,
        supportsAllDrives: true,
        media: { mimeType: 'application/json', body: content },
      })
    } else {
      await (drive.files.create as any)({
        supportsAllDrives: true,
        requestBody: { name: BEAT_FILE, parents: [FOLDER_ID] },
        media: { mimeType: 'application/json', body: content },
      })
    }
  } catch (e) {
    console.error('[queue] writeBeatFile error:', e)
  }
}

function beatToCount(ts: number | undefined): number {
  if (!ts || ts === 0) return 0
  return Date.now() - ts < BEAT_EXPIRE_MS ? 1 : 0
}

export async function readQueue(): Promise<QueueState> {
  const beat = await readBeatFile()
  return {
    gemini: beatToCount(beat.gemini),
    openai: beatToCount(beat.openai),
  }
}

/** Call with active=true before AI work, active=false after. */
export async function updateQueue(model: 'gemini' | 'openai', delta: 1 | -1): Promise<void> {
  try {
    const beat = await readBeatFile()
    beat[model] = delta === 1 ? Date.now() : 0
    await writeBeatFile(beat)
  } catch (e) {
    console.error('[queue] updateQueue error:', e)
  }
}
