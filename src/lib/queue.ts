// Queue tracking via a small JSON file in Google Drive
// Not atomic — may be off by ±1 under high concurrency, acceptable for small teams

import { getDriveClient } from './googleDrive'

const QUEUE_FILE_NAME = '_queue.json'
const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

export interface QueueState {
  gemini: number
  openai: number
}

async function findQueueFileId(): Promise<string | null> {
  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${QUEUE_FILE_NAME}' and trashed = false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return res.data.files?.[0]?.id || null
  } catch {
    return null
  }
}

export async function readQueue(): Promise<QueueState> {
  try {
    const drive = getDriveClient()
    const fileId = await findQueueFileId()
    if (!fileId) return { gemini: 0, openai: 0 }

    const res = await (drive.files.get as any)(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    ) as any

    const data = JSON.parse(typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
    return {
      gemini: Math.max(0, Number(data.gemini) || 0),
      openai: Math.max(0, Number(data.openai) || 0),
    }
  } catch {
    return { gemini: 0, openai: 0 }
  }
}

async function writeQueue(state: QueueState): Promise<void> {
  const drive = getDriveClient()
  const content = JSON.stringify(state)
  const fileId = await findQueueFileId()

  if (fileId) {
    await (drive.files.update as any)({
      fileId,
      supportsAllDrives: true,
      media: { mimeType: 'application/json', body: content },
    })
  } else {
    await (drive.files.create as any)({
      supportsAllDrives: true,
      requestBody: { name: QUEUE_FILE_NAME, parents: [FOLDER_ID] },
      media: { mimeType: 'application/json', body: content },
    })
  }
}

export async function updateQueue(model: 'gemini' | 'openai', delta: 1 | -1): Promise<void> {
  try {
    const current = await readQueue()
    await writeQueue({
      gemini: Math.max(0, current.gemini + (model === 'gemini' ? delta : 0)),
      openai: Math.max(0, current.openai + (model === 'openai' ? delta : 0)),
    })
  } catch (e) {
    console.warn('[queue] updateQueue failed:', e)
  }
}
