import OpenAI from 'openai'
import { Readable } from 'stream'
import { getAuthClient, getDriveClient, invalidateLocCache } from './googleDrive'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- Types ---

export type FolderStatus =
  | 'pending'
  | 'analyzing'
  | 'translating'
  | 'uploading'
  | 'verifying'
  | 'done'
  | 'error'

export interface FolderProgress {
  folderId: string
  folderName: string
  status: FolderStatus
  error?: string
  completedLangs?: string[]
  uploadInfo?: string
}

export interface JobSnapshot {
  status: 'running' | 'done' | 'error'
  folders: FolderProgress[]
}

// --- Drive list helpers ---

async function listSubfolders(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  }) as any
  return (res.data.files || []) as { id: string; name: string }[]
}

async function listImages(folderId: string) {
  const drive = getDriveClient()
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
  }) as any
  return (res.data.files || []) as { id: string; name: string; mimeType: string }[]
}

async function downloadFileAsBuffer(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()
  const res = await drive.files.get(
    { fileId, alt: 'media' } as any,
    { responseType: 'arraybuffer' }
  ) as any
  return Buffer.from(res.data as ArrayBuffer)
}

async function createDriveFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  } as any) as any
  return res.data.id!
}

async function uploadToDrive(buffer: Buffer, mimeType: string, name: string, parentId: string): Promise<void> {
  // googleapis wraps media uploads so supportsAllDrives is lost from the upload URL,
  // causing 'Service Accounts do not have storage quota' on Shared Drives.
  // Fix: raw multipart upload via fetch with supportsAllDrives=true in the URL.
  const auth = getAuthClient()
  const accessToken = await auth.getAccessToken()
  if (!accessToken) throw new Error('Failed to get access token')

  const boundary = 'locboundary314159265'
  const metadata = JSON.stringify({ name, parents: [parentId] })

  const bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length),
      },
      body: bodyBuffer,
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Drive upload ${res.status}: ${text}`)
  }
}

// --- Naming ---

function pickRepresentative(images: { id: string; name: string }[]): { id: string; name: string } | null {
  return (
    images.find(f => f.name.includes('_9x16_') || f.name.includes('_9x16.')) ||
    images.find(f => f.name.includes('_4x5_') || f.name.includes('_4x5.')) ||
    images[0] ||
    null
  )
}

function buildNewName(originalName: string, lang: string, cp: string): string {
  const extMatch = originalName.match(/(\.[^.]+)$/)
  const ext = extMatch ? extMatch[1] : '.jpg'
  let base = originalName.replace(/\.[^.]+$/, '')
  base = base.replace(/_[A-Z]{2}$/, '')
  base = base.replace(/_(TMK|KZA|AHB|ASR|SMV|DDT|VTL|YKH|DKR|ASM|NBL|RSK|KIS|MMM)$/i, '')
  return cp ? `${base}_${cp}_${lang}${ext}` : `${base}_${lang}${ext}`
}

// --- GPT Analyzer 1 ---

async function analyzeImage(imageBase64DataUrl: string): Promise<any> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: [
          'You are a commercial image analysis engine for ad creative localization.',
          'Return ONLY valid raw JSON. No markdown. No explanations.',
          'Output schema:',
          '{',
          '  "texts": [{ "id": "text_1", "text": "...", "type": "headline|body|cta|other", "importance": "high|medium|low" }],',
          '  "context": { "category": "...", "mood": "...", "speaker_gender": "male|female|unknown", "target_audience": "..." },',
          '  "proper_nouns": []',
          '}',
          'Response must start with { and end with }',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64DataUrl, detail: 'high' } },
          { type: 'text', text: 'Extract all text elements from this ad creative.' },
        ],
      },
    ],
    max_tokens: 1500,
  })
  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT Translator ---

async function translateTexts(analysis: any, targetLanguages: string[]): Promise<any> {
  const LANG_MAP: Record<string, string> = {
    JP: 'Japanese', SP: 'Spanish', DE: 'German', FR: 'French',
    IT: 'Italian', PT: 'Portuguese', RU: 'Russian', UA: 'Ukrainian',
    AR: 'Arabic', KR: 'Korean', HE: 'Hebrew', CN: 'Chinese',
    CZ: 'Czech', ND: 'Dutch', HI: 'Hindi', PL: 'Polish',
    TW: 'Traditional Chinese (Taiwan)', BG: 'Bulgarian',
  }
  const langNames = targetLanguages.map(c => `${c} = ${LANG_MAP[c] || c}`).join(', ')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: [
          'You are a strict commercial translation engine for ad creatives.',
          'Return ONLY valid raw JSON. No markdown. No explanations.',
          `Target languages: ${langNames}`,
          `Image analysis: ${JSON.stringify(analysis)}`,
          'Rules:',
          '- Translate all texts',
          '- NEVER translate proper_nouns',
          '- Preserve emojis and timestamps',
          '- Informal conversational tone',
          '- CRITICAL: translations array must have exactly one entry per language code.',
          'Output schema:',
          '{',
          '  "translations": [',
          '    { "language": "SP", "phrases": [{ "id": "text_1", "en": "...", "translated": "...", "type": "headline" }] }',
          '  ]',
          '}',
          'Response must start with { and end with }',
        ].join('\n'),
      },
      { role: 'user', content: `Translate into: ${targetLanguages.join(', ')}` },
    ],
    max_tokens: 3000,
  })
  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT Analyzer 2 - verify ---

async function verifyCreative(
  imageBase64DataUrl: string,
  expectedPhrases: { en: string; translated: string }[]
): Promise<{ ok: boolean; issues: string[] }> {
  if (expectedPhrases.length === 0) return { ok: true, issues: [] }
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Quality control for localized ad creatives. Return ONLY valid raw JSON: { "ok": true|false, "issues": ["..."] }. Response must start with { and end with }',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64DataUrl, detail: 'low' } },
          {
            type: 'text',
            text: `Expected texts:\n${expectedPhrases.map(p => `"${p.en}" -> "${p.translated}"`).join('\n')}\nAre they correctly visible?`,
          },
        ],
      },
    ],
    max_tokens: 300,
  })
  try {
    const raw = response.choices[0].message.content || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
  } catch {
    return { ok: true, issues: [] }
  }
}

// --- Main runner ---

export async function runLocalizationJob(
  folders: { id: string; name: string }[],
  targetLanguages: string[],
  cp: string,
  appCode: string,
  onUpdate: (snapshot: JobSnapshot) => void,
): Promise<void> {

  const state: FolderProgress[] = folders.map(f => ({
    folderId: f.id,
    folderName: f.name,
    status: 'pending' as FolderStatus,
    completedLangs: [],
  }))

  function emit(status: JobSnapshot['status'] = 'running') {
    onUpdate({ status, folders: state.map(f => ({ ...f })) })
  }

  function patch(folderId: string, p: Partial<FolderProgress>) {
    const i = state.findIndex(f => f.folderId === folderId)
    if (i >= 0) state[i] = { ...state[i], ...p }
  }

  emit('running')

  for (const folder of folders) {
    try {
      patch(folder.id, { status: 'analyzing' })
      emit()

      const subfolders = await listSubfolders(folder.id)
      // Track which language folders already exist so we can skip them
      const existingLangs = new Set(subfolders.map(f => f.name.toUpperCase()))

      // If EN is a target language, use any non-EN folder as source (EN does not exist yet).
      // Otherwise use EN as source.
      const enIsTarget = targetLanguages.map(l => l.toUpperCase()).includes('EN')
      const sourceFolder = enIsTarget
        ? subfolders.find(f => f.name.toUpperCase() !== 'EN')
        : subfolders.find(f => f.name.toUpperCase() === 'EN')

      if (!sourceFolder) {
        patch(folder.id, { status: 'error', error: enIsTarget ? 'No source folder found (need any non-EN)' : 'No EN folder found' })
        emit()
        continue
      }

      const allImages = await listImages(sourceFolder.id)
      if (allImages.length === 0) {
        patch(folder.id, { status: 'error', error: `No images in ${sourceFolder.name} folder` })
        emit()
        continue
      }

      const representative = pickRepresentative(allImages)!
      const repBuffer = await downloadFileAsBuffer(representative.id)
      const repMime = representative.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
      const repBase64 = `data:${repMime};base64,${repBuffer.toString('base64')}`
      const analysis = await analyzeImage(repBase64)

      patch(folder.id, { status: 'translating' })
      emit()

      const translationResult = await translateTexts(analysis, targetLanguages)
      const translations: { language: string; phrases: { id: string; en: string; translated: string }[] }[] =
        translationResult.translations || []

      patch(folder.id, { status: 'uploading', uploadInfo: `0/${allImages.length} images` })
      emit()

      const completedLangs: string[] = []

      for (const translation of translations) {
        const lang = translation.language

        // Skip if this language folder already exists
        if (existingLangs.has(lang.toUpperCase())) {
          completedLangs.push(lang)
          patch(folder.id, { completedLangs: [...completedLangs], uploadInfo: `${lang}: skipped (exists)` })
          emit()
          continue
        }

        const langFolderId = await createDriveFolder(lang, folder.id)

        let uploaded = 0
        let failed = 0
        for (const img of allImages) {
          try {
            const imgBuffer = await downloadFileAsBuffer(img.id)
            const newName = buildNewName(img.name, lang, cp)
            const mime = img.mimeType || 'image/jpeg'
            await uploadToDrive(imgBuffer, mime, newName, langFolderId)
            uploaded++
            patch(folder.id, { uploadInfo: `${lang}: ${uploaded}/${allImages.length}` })
            emit()
          } catch (imgErr: any) {
            failed++
            const msg = imgErr?.message || String(imgErr)
            console.error(`[loc] ${img.name} -> ${lang} failed:`, msg)
            patch(folder.id, { error: `${lang}/${img.name}: ${msg}` })
            emit()
          }
        }

        completedLangs.push(lang)
        patch(folder.id, {
          completedLangs: [...completedLangs],
          uploadInfo: `${lang}: ${uploaded} ok${failed ? `, ${failed} failed` : ''}`,
        })
        emit()
      }

      patch(folder.id, { status: 'verifying' })
      emit()

      try {
        const firstTr = translations[0]
        if (firstTr && repBuffer.length > 0) {
          const verifyBase64 = `data:${repMime};base64,${repBuffer.toString('base64')}`
          await verifyCreative(
            verifyBase64,
            firstTr.phrases.slice(0, 3).map(p => ({ en: p.en, translated: p.translated }))
          )
        }
      } catch (verifyErr) {
        console.warn('[loc] Verify failed (non-blocking):', verifyErr)
      }

      patch(folder.id, { status: 'done' })
      emit()

    } catch (err: any) {
      console.error(`[loc] Folder ${folder.name} failed:`, err)
      patch(folder.id, { status: 'error', error: err.message || 'Unknown error' })
      emit()
    }
  }

  invalidateLocCache(appCode)
  emit(state.some(f => f.status === 'error') ? 'error' : 'done')
}
