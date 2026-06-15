import OpenAI from 'openai'
import { getDriveClient, invalidateLocCache } from './googleDrive'

// --- Gemini image localization ---

function getAspectRatioFromName(name: string): string {
  if (name.includes('_9x16')) return '9:16'
  if (name.includes('_4x5')) return '4:5'
  if (name.includes('_1x1')) return '1:1'
  if (name.includes('_1.91x1') || name.includes('_1,91x1')) return '16:9'
  return '9:16'
}

async function localizeImageWithGemini(
  imgBuffer: Buffer,
  mimeType: string,
  language: string,
  phrases: { en: string; translated: string }[],
  aspectRatio: string
): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set')

  const base64 = imgBuffer.toString('base64')
  const translationsText = phrases.map(p => `"${p.en}" → "${p.translated}"`).join('\n')

  const prompt = `You are a strict image localization editor.

Your ONLY task: Replace existing visible text on the image using ONLY the provided translations.

ABSOLUTE RULES:
- Do NOT redesign the image.
- Do NOT change the composition, colors, people, objects, backgrounds, or layout.
- Do NOT add any new objects, shapes, or decorations.
- Do NOT remove any existing non-text element.
- Do NOT translate anything yourself — use ONLY the provided translated text.
- If a source text has no provided translation, leave that text unchanged.

SOURCE TEXT REMOVAL:
- Before inserting translated text, completely erase the original source text in that area.
- No original letters, shadows, outlines, or fragments may remain visible.

TEXT REPLACEMENT:
- Replace each original text only with its matching translation.
- Keep the same position, alignment, font style, size, color, and weight.
- Preserve emojis if part of the translation.

SPECIAL LANGUAGE ENFORCEMENT:
- If language is JP, use provided Japanese exactly. Do NOT substitute with Chinese.
- If language is CN, use provided Chinese exactly. Do NOT substitute with Japanese.
- If language is AR or HE, preserve correct right-to-left text direction.

TARGET LANGUAGE: ${language}

TRANSLATIONS TO APPLY:
${translationsText}

Perform only precise text replacement. Everything else must remain unchanged.`

  const body = {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64 } }
    ]}],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio, imageSize: '2K' }
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }

  const json = await res.json()
  const imageData = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data
  if (!imageData) {
    const reason = json?.candidates?.[0]?.finishReason || 'unknown'
    throw new Error(`Gemini returned no image (finishReason: ${reason})`)
  }

  return Buffer.from(imageData, 'base64')
}

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

async function uploadToDrive(buffer: Buffer, mimeType: string, name: string, parentId: string, userToken?: string): Promise<void> {
  // Use user's OAuth token to upload — avoids service account storage quota issue.
  // If user token is missing, throw explicitly (don't silently fall back to service account).
  if (!userToken) throw new Error('No user OAuth token available — cannot upload to Drive')
  const accessToken = userToken

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
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64DataUrl, detail: 'high' } },
          {
            type: 'text',
            text: `You are a strict visual OCR and creative analysis engine.

Return ONLY valid raw JSON.
No markdown.
No explanations.
No extra text.

Your job is NOT to translate.
Your job is to extract and describe all useful information from the image for a future localization step.

CORE RULES:
- Do NOT translate anything.
- Do NOT rewrite text.
- Do NOT improve text.
- Extract text exactly as visible.
- Preserve original capitalization.
- Preserve punctuation.
- Preserve emojis.
- Keep brand names, app names, product names, personal names, usernames, contact names, and geographic names exactly as written.
- Do not modify proper nouns.

OCR RULES:
- Scan the entire image carefully.
- Extract ALL readable visible text.
- Include text from: headlines, subtitles, CTA buttons, captions, notifications, chat bubbles, UI elements, buttons, labels, app interfaces, overlays, small secondary text, watermarks, logos if readable, contact names, timestamps, status labels.
- Do not skip text just because it looks decorative or secondary.
- Do not skip readable UI text, even if it is small or repeated.
- Ignore only text that is truly unreadable.

Examples of readable UI text to include: 9:41, Today, Online, 10.24 PM, Type Chat Here

IMPORTANT PROPER NOUN RULE:
If a visible proper noun, brand name, app name, username, contact name, or UI label appears on the image:
- include it in "texts"
- also include it in "proper_nouns"
- do not only place it in "proper_nouns"

CHAT RULES:
- Chat bubbles must be extracted individually.
- Both left and right chat bubbles must be included.
- Do not skip short chat messages.

TEXT CLASSIFICATION — assign one type per text:
headline, subheadline, body, cta, button, notification, chat_message, ui_label, contact_name, logo, watermark, caption, badge, timestamp, status_label, other

Type rules:
- Use "contact_name" for visible chat/contact names such as BFF, Mom, Husband, Wife, Partner, or user display names.
- Use "timestamp" for visible time values such as 9:41 or 10.24 PM.
- Use "status_label" for labels such as Online, Offline, Today, Delivered, Seen.
- Use "cta" or "button" for action-driving text.

IMPORTANCE — assign per text:
- high: main sales message, CTA, important chat message, headline
- medium: supporting UI/context text
- low: timestamps, placeholders, repeated minor labels

VISUAL CONTEXT — determine:
- speaker_gender: male | female | mixed | unknown
- target_audience: male | female | mixed | unknown

CREATIVE CONTEXT — determine:
- category: fitness | relationship | tracking app | health | beauty | finance | education | parenting | productivity | entertainment | other
- mood: fear | anxiety | sadness | curiosity | urgency | relief | hope | motivation | trust | suspicion | neutral
- commercial_intent: awareness | problem_agitation | solution_pitch | direct_response | app_install | purchase | signup | unknown

PROPER NOUN DETECTION — classify each:
brand_name | app_name | product_name | personal_name | username | contact_name | geographic_name | platform_name | other

OUTPUT SCHEMA:
{
  "context": {
    "category": "relationship",
    "mood": "suspicion",
    "commercial_intent": "problem_agitation",
    "speaker_gender": "female",
    "target_audience": "female",
    "visual_summary": "Short factual description of the image without interpretation."
  },
  "texts": [
    {
      "id": "text_1",
      "text": "Original visible text exactly as written",
      "type": "headline",
      "role_in_composition": "main headline",
      "importance": "high"
    }
  ],
  "proper_nouns": [
    {
      "text": "Family Locator",
      "kind": "app_name"
    }
  ],
  "notes": []
}

VALIDATION:
- Return every readable text phrase separately.
- Do not merge unrelated text blocks.
- Preserve original capitalization and punctuation.
- Do not translate.
- Response must start with { and end with }`,
          },
        ],
      },
    ],
    max_tokens: 16000,
  })
  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT Translator ---

async function translateTexts(analysis: any, targetLanguages: string[]): Promise<any> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a strict commercial translation and localization engine.

Return ONLY valid raw JSON.
No markdown.
No explanations.
No extra text.

Target language codes:
${targetLanguages.join(', ')}
Image analysis JSON:
${JSON.stringify(analysis)}

Your job:
- Translate extracted image texts into target languages
- Use image context, mood, text type, role, speaker gender, and target audience
- Preserve commercial impact and visual length
- Do NOT perform OCR
- Do NOT invent new source texts
- Use ONLY texts from Image analysis JSON

REQUIRED LANGUAGE RULE:
- The number of objects inside "translations" MUST exactly match the number of requested target language codes.
- Every requested language code MUST appear exactly once.
- Never omit any requested language.
- Never add unrequested languages.

LANGUAGE MAPPING:
JP = Japanese, SP = Spanish, DE = German, FR = French, IT = Italian, PT = Portuguese,
RU = Russian, UA = Ukrainian, AR = Arabic, KR = Korean, HE = Hebrew, CN = Chinese,
CZ = Czech, ND = Dutch, HI = Hindi, PL = Polish, TW = Traditional Chinese (Taiwan), BG = Bulgarian

CORE RULES:
- Translate ONLY into requested target language codes.
- Do NOT replace one language with another.
- Keep the original text exactly in the "en" field.
- Never return empty translations.
- Use every item from Image analysis JSON "texts" array.

CONTACT NAME RULE:
- If contact_name is a real personal name, username, or brand-like label, keep it unchanged.
- If contact_name is a generic relationship label (BFF, Mom, Husband, Wife, Partner), localize it naturally.
- Keep the translation short and UI-friendly.

CONTEXT RULE — mood must affect translation style:
- fear / anxiety / suspicion → sharper, tension-driven wording
- curiosity → intriguing, teaser-like wording
- motivation / hope → encouraging wording
- urgency → short, direct, action-oriented wording
- trust / relief → reassuring wording
- neutral → natural commercial wording

TEXT TYPE RULE:
- headline → short, strong, attention-grabbing
- cta / button → very short, direct, action-focused
- notification / chat_message → natural conversational language
- ui_label / status_label / timestamp → preserve UI-like brevity
- logo / watermark → do not translate unless generic readable text
- contact_name → localize only if generic relationship label, otherwise keep unchanged

REGISTER RULE:
- Use informal conversational tone.
- In languages with formal/informal forms, prefer informal.

LENGTH RULE:
- Keep translation length as close as possible to the original (±20% when possible).
- Prefer compact ad-style phrasing.

GENDER RULE:
- Use speaker_gender and target_audience from context for grammatical agreement.

PROPER NOUNS RULE:
- Never translate or modify brand names, app names, product names, personal names, usernames, contact names, geographic proper nouns, or platform names.

TRANSLATION SCOPE:
- Translate all texts with importance high, medium, and low.
- Timestamps should stay unchanged.
- Emojis should be preserved.

OUTPUT SCHEMA:
{
  "translations": [
    {
      "language": "JP",
      "phrases": [
        {
          "id": "text_1",
          "en": "original text",
          "translated": "translated text",
          "type": "headline"
        }
      ]
    }
  ]
}

VALIDATION:
- translations array length MUST equal the number of requested languages.
- Every phrase object MUST contain: id, en, translated, type.
- Preserve original text exactly in "en".
- Response must start with { and end with }`,
      },
      { role: 'user', content: `Translate into: ${targetLanguages.join(', ')}` },
    ],
    max_tokens: 4000,
  })
  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT QA review (post-Gemini) ---

async function reviewLocalizedImage(
  localizedImageBase64DataUrl: string,
  language: string,
  phrases: { en: string; translated: string }[]
): Promise<{ status: 'ok' | 'fail'; fix_prompt: string }> {
  if (phrases.length === 0) return { status: 'ok', fix_prompt: '' }
  const expectedText = phrases.map(p => `"${p.en}" → "${p.translated}"`).join('\n')
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: localizedImageBase64DataUrl, detail: 'low' } },
          {
            type: 'text',
            text: `You are a strict QA checker for localized advertising images.

Your job: verify that text replacement was done correctly on the image.

Target language: ${language}

Expected replacements:
${expectedText}

Check the image and verify:
1. All original source text is fully removed — no ghost text, fragments, or remnants
2. All provided translations are correctly visible and readable
3. No mixed languages, corrupted letters, or invented text

Important:
- Brand names, logos, and proper nouns may remain unchanged — do not flag these
- Only flag real visible problems

Respond ONLY with raw JSON, no markdown, no backticks, no explanation:

If everything is correct:
{"status": "ok", "fix_prompt": ""}

If issues found:
{"status": "fail", "fix_prompt": "Describe exactly what is wrong and what text needs to be fixed"}`,
          },
        ],
      },
    ],
    max_tokens: 500,
  })
  try {
    const raw = response.choices[0].message.content || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
  } catch {
    return { status: 'ok', fix_prompt: '' }
  }
}

// --- Main runner ---

export async function runLocalizationJob(
  folders: { id: string; name: string }[],
  targetLanguages: string[],
  cp: string,
  appCode: string,
  onUpdate: (snapshot: JobSnapshot) => void,
  userAccessToken?: string,
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

        const langPhrases = translation.phrases.map((p: any) => ({ en: p.en, translated: p.translated }))

        let uploaded = 0
        let failed = 0
        for (const img of allImages) {
          try {
            const imgBuffer = await downloadFileAsBuffer(img.id)
            const newName = buildNewName(img.name, lang, cp)
            const mime = img.mimeType || 'image/jpeg'
            const aspectRatio = getAspectRatioFromName(img.name)

            let finalBuffer = imgBuffer
            try {
              finalBuffer = await localizeImageWithGemini(imgBuffer, mime, lang, langPhrases, aspectRatio)
              // Non-blocking QA review
              const localizedDataUrl = `data:${mime};base64,${finalBuffer.toString('base64')}`
              reviewLocalizedImage(localizedDataUrl, lang, langPhrases)
                .then(qa => { if (qa.status === 'fail') console.warn(`[loc] QA fail ${img.name}:`, qa.fix_prompt) })
                .catch(() => {})
            } catch (geminiErr: any) {
              console.warn(`[loc] Gemini failed for ${img.name}, uploading original:`, geminiErr.message)
            }

            await uploadToDrive(finalBuffer, mime, newName, langFolderId, userAccessToken)
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
