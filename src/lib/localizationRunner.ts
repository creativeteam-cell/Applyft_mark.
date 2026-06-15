import OpenAI from 'openai'
import sharp from 'sharp'
import { getDriveClient, invalidateLocCache } from './googleDrive'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Size map ────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  '1.91x1': { width: 1200, height: 628 },
  '9x16':   { width: 1080, height: 1920 },
  '4x5':    { width: 1200, height: 1500 },
  '1x1':    { width: 1200, height: 1200 },
}

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

export interface JobSnapshot {
  status: 'running' | 'done' | 'error'
  folders: FolderProgress[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    { fileId, alt: 'media', supportsAllDrives: true } as any,
    { responseType: 'arraybuffer' }
  ) as any
  return Buffer.from(res.data)
}

async function bufferToBase64DataUrl(buffer: Buffer, mimeType = 'image/jpeg'): Promise<string> {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function pickRepresentative(images: { id: string; name: string }[]): { id: string; name: string } | null {
  return (
    images.find(f => f.name.includes('_9x16_') || f.name.includes('_9x16.')) ||
    images.find(f => f.name.includes('_4x5_') || f.name.includes('_4x5.')) ||
    images[0] ||
    null
  )
}

function extractSize(name: string): string | null {
  const match = name.match(/_(1[.,]91x1|9x16|4x5|1x1)[_.]/)
  return match ? match[1].replace(',', '.') : null
}

function buildNewName(originalName: string, lang: string, cp: string): string {
  const extMatch = originalName.match(/(\.[^.]+)$/)
  const ext = extMatch ? extMatch[1] : '.jpg'
  let base = originalName.replace(/\.[^.]+$/, '')
  base = base.replace(/_[A-Z]{2}$/, '')
  const cpPattern = /_(TMK|KZA|AHB|ASR|SMV|DDT|VTL|YKH|DKR|ASM|NBL|RSK|KIS|MMM)$/i
  base = base.replace(cpPattern, '')
  return cp ? `${base}_${cp}_${lang}${ext}` : `${base}_${lang}${ext}`
}

// ─── GPT Analyzer 1 ──────────────────────────────────────────────────────────

async function analyzeImage(imageBase64DataUrl: string): Promise<any> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a commercial image analysis engine for ad creative localization.

Return ONLY valid raw JSON. No markdown. No explanations.

Analyze the image and extract:
1. All visible text elements with their roles
2. Context, mood, audience for translation guidance
3. Proper nouns that must NOT be translated

Output schema:
{
  "texts": [
    {
      "id": "text_1",
      "text": "original text",
      "type": "headline|subheadline|body|cta|notification|chat_message|ui_label|contact_name|badge|other",
      "importance": "high|medium|low"
    }
  ],
  "context": {
    "category": "...",
    "mood": "fear|anxiety|curiosity|motivation|urgency|trust|sadness|neutral",
    "commercial_intent": "...",
    "speaker_gender": "male|female|unknown",
    "target_audience": "...",
    "visual_summary": "..."
  },
  "proper_nouns": ["list", "of", "untranslatable", "names"]
}

Rules:
- Include ALL visible text, even small UI labels
- contact_name: if it's a real name keep as-is; if generic label (Mom, BFF, Husband) → translate
- Do NOT invent texts not visible in the image
- timestamps, emojis → importance "low"
- Response must start with { and end with }`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64DataUrl, detail: 'high' } },
          { type: 'text', text: 'Analyze this ad creative and extract all text elements.' },
        ],
      },
    ],
    max_tokens: 1500,
  })

  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  return JSON.parse(clean.slice(start, end + 1))
}

// ─── GPT Translator ──────────────────────────────────────────────────────────

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
        content: `You are a strict commercial translation engine for ad creatives.

Return ONLY valid raw JSON. No markdown. No explanations.

Target languages: ${langNames}
Image analysis: ${JSON.stringify(analysis)}

Rules:
- Translate texts with importance high, medium, low
- NEVER translate proper_nouns — keep them exactly as-is
- contact_name: localize only generic labels (Mom, BFF, Husband), keep real names
- Preserve emojis and timestamps unchanged
- Match visual length as closely as possible (±20%)
- Use informal conversational tone (close friend style)
- In languages with formal/informal forms → use informal
- Gender agreement: use context.speaker_gender and context.target_audience
- Mood affects style: urgency→short direct; fear→tension; curiosity→teaser; etc.

CRITICAL: translations array length MUST equal number of requested languages.
Every requested language code MUST appear exactly once.

Output schema:
{
  "translations": [
    {
      "language": "JP",
      "phrases": [
        { "id": "text_1", "en": "original text", "translated": "translated text", "type": "headline" }
      ]
    }
  ]
}

Response must start with { and end with }`,
      },
      {
        role: 'user',
        content: `Translate into: ${targetLanguages.join(', ')}`,
      },
    ],
    max_tokens: 3000,
  })

  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  return JSON.parse(clean.slice(start, end + 1))
}

// ─── GPT Analyzer 2 — verify ─────────────────────────────────────────────────

async function verifyCreative(imageBase64DataUrl: string, expectedPhrases: { en: string; translated: string }[]): Promise<{ ok: boolean; issues: string[] }> {
  if (expectedPhrases.length === 0) return { ok: true, issues: [] }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a quality control reviewer for localized ad creatives.
Return ONLY valid raw JSON: { "ok": true|false, "issues": ["..."] }
Check: Are translated texts visible? Any layout breaks or missing text?
If all correct → ok: true, issues: []. Response must start with { and end with }`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64DataUrl, detail: 'low' } },
          {
            type: 'text',
            text: `Expected translated texts:\n${expectedPhrases.map(p => `- "${p.en}" → "${p.translated}"`).join('\n')}\n\nDoes this localized creative look correct?`,
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

// ─── Drive helpers ────────────────────────────────────────────────────────────

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
  const drive = getDriveClient()
  const { Readable } = await import('stream')
  await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  } as any)
}

// ─── Main runner — uses callback instead of global Map ───────────────────────

export async function runLocalizationJob(
  folders: { id: string; name: string }[],
  targetLanguages: string[],
  cp: string,
  appCode: string,
  onUpdate: (snapshot: JobSnapshot) => void,
): Promise<void> {

  // Local mutable state
  const state: FolderProgress[] = folders.map(f => ({
    folderId: f.id,
    folderName: f.name,
    status: 'pending' as FolderStatus,
    completedLangs: [],
  }))

  function emit(status: JobSnapshot['status'] = 'running') {
    onUpdate({ status, folders: state.map(f => ({ ...f })) })
  }

  function patchFolder(folderId: string, patch: Partial<FolderProgress>) {
    const idx = state.findIndex(f => f.folderId === folderId)
    if (idx >= 0) state[idx] = { ...state[idx], ...patch }
  }

  emit('running')

  for (const folder of folders) {
    try {
      // ── Analyzing ──
      patchFolder(folder.id, { status: 'analyzing' })
      emit()

      const subfolders = await listSubfolders(folder.id)
      const enFolder = subfolders.find(f => f.name.toUpperCase() === 'EN')
      if (!enFolder) {
        patchFolder(folder.id, { status: 'error', error: 'No EN folder found' })
        emit()
        continue
      }

      const allImages = await listImages(enFolder.id)
      if (allImages.length === 0) {
        patchFolder(folder.id, { status: 'error', error: 'No images in EN folder' })
        emit()
        continue
      }

      const representative = pickRepresentative(allImages)
      if (!representative) {
        patchFolder(folder.id, { status: 'error', error: 'Could not pick representative image' })
        emit()
        continue
      }

      const repBuffer = await downloadFileAsBuffer(representative.id)
      const repBase64 = await bufferToBase64DataUrl(repBuffer)
      const analysis = await analyzeImage(repBase64)

      // ── Translating ──
      patchFolder(folder.id, { status: 'translating' })
      emit()

      const translationResult = await translateTexts(analysis, targetLanguages)
      const translations: { language: string; phrases: { id: string; en: string; translated: string; type: string }[] }[] =
        translationResult.translations || []

      // ── Uploading ──
      patchFolder(folder.id, { status: 'uploading' })
      emit()

      const completedLangs: string[] = []

      for (const translation of translations) {
        const lang = translation.language
        const langFolderId = await createDriveFolder(lang, folder.id)

        for (const img of allImages) {
          try {
            const imgBuffer = await downloadFileAsBuffer(img.id)
            const sizeKey = extractSize(img.name)
            const dims = sizeKey ? SIZE_MAP[sizeKey] : null

            let finalBuffer: Buffer
            if (dims) {
              finalBuffer = await sharp(imgBuffer)
                .resize(dims.width, dims.height, { fit: 'fill' })
                .jpeg({ quality: 92 })
                .toBuffer()
            } else {
              finalBuffer = imgBuffer
            }

            const newName = buildNewName(img.name, lang, cp)
            await uploadToDrive(finalBuffer, 'image/jpeg', newName, langFolderId)
          } catch (imgErr) {
            console.error(`Failed to process image ${img.name} for lang ${lang}:`, imgErr)
          }
        }

        completedLangs.push(lang)
        patchFolder(folder.id, { completedLangs: [...completedLangs] })
        emit()
      }

      // ── Verifying ──
      patchFolder(folder.id, { status: 'verifying' })
      emit()

      try {
        const firstTranslation = translations[0]
        if (firstTranslation) {
          const verifyBuffer = await sharp(repBuffer)
            .resize(600, 750, { fit: 'fill' })
            .jpeg({ quality: 70 })
            .toBuffer()
          const verifyBase64 = await bufferToBase64DataUrl(verifyBuffer)
          await verifyCreative(verifyBase64, firstTranslation.phrases.slice(0, 3).map((p: any) => ({ en: p.en, translated: p.translated })))
        }
      } catch (verifyErr) {
        console.warn('Verification step failed (non-blocking):', verifyErr)
      }

      patchFolder(folder.id, { status: 'done' })
      emit()

    } catch (err: any) {
      console.error(`Folder ${folder.name} failed:`, err)
      patchFolder(folder.id, { status: 'error', error: err.message || 'Unknown error' })
      emit()
    }
  }

  invalidateLocCache(appCode)

  const anyError = state.some(f => f.status === 'error')
  emit(anyError ? 'error' : 'done')
}
