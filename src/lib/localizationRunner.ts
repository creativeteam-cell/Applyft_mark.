import OpenAI from 'openai'
import sharp from 'sharp'
import { getDriveClient, invalidateLocCache } from './googleDrive'
import { updateQueue } from './queue'

// --- Size helpers ---

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  '1.91x1': { width: 1200, height: 628 },
  '9x16':   { width: 1080, height: 1920 },
  '4x5':    { width: 1200, height: 1500 },
  '1x1':    { width: 1200, height: 1200 },
}

function getSizeFromName(name: string): { width: number; height: number } | null {
  for (const [key, dims] of Object.entries(SIZE_MAP)) {
    if (name.includes(`_${key}_`) || name.includes(`_${key}.`) || name.includes(`_${key.replace('.', ',')}`) ) {
      return dims
    }
  }
  return null
}

async function resizeToTarget(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer()
}

// --- Gemini two-pass localization ---

const SIZE_TO_ASPECT_LOC: Record<string, string> = {
  '1.91x1': '16:9',
  '9x16':   '9:16',
  '4x5':    '4:5',
  '1x1':    '1:1',
}

function getAspectRatioFromName(name: string): string | undefined {
  for (const key of Object.keys(SIZE_MAP)) {
    if (name.includes(`_${key}_`) || name.includes(`_${key}.`) || name.includes(`_${key.replace('.', ',')}`)) {
      return SIZE_TO_ASPECT_LOC[key]
    }
  }
  return undefined
}

async function geminiRequest(parts: any[], mimeType: string, retryCount = 0, aspectRatio?: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set')

  const generationConfig: any = { responseModalities: ['IMAGE'] }
  if (aspectRatio) generationConfig.imageConfig = { aspectRatio }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
    }
  )

  // Rate limit — exponential backoff and retry automatically
  if (res.status === 429) {
    if (retryCount >= 4) throw new Error('Gemini rate limit: too many retries')
    const delay = Math.min(10000 * Math.pow(2, retryCount), 60000) // 10s, 20s, 40s, 60s
    console.warn(`[gemini] 429 rate limit, waiting ${delay / 1000}s before retry ${retryCount + 1}...`)
    await new Promise(r => setTimeout(r, delay))
    return geminiRequest(parts, mimeType, retryCount + 1, aspectRatio)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const json = await res.json()
  const data = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data
  if (!data) {
    const reason = json?.candidates?.[0]?.finishReason || 'unknown'
    throw new Error(`Gemini returned no image (finishReason: ${reason})`)
  }
  return Buffer.from(data, 'base64')
}

function buildGeminiPrompt(
  language: string,
  phrases: { en: string; translated: string; role?: string }[],
  fixPrompt?: string,
): string {
  const translationsText = phrases
    .map(p => {
      const isAllCaps = p.en === p.en.toUpperCase() && /[A-Z]/.test(p.en)
      const capsNote = isAllCaps ? ' [ALL CAPS REQUIRED]' : ''
      return `"${p.en}"${p.role ? ` [${p.role}]` : ''}${capsNote} → "${p.translated}"`
    })
    .join('\n')

  const isRTL = ['AR', 'HE', 'FA', 'UR'].includes(language.toUpperCase())

  return `[CONTEXT]: This is a professional commercial advertising creative for mobile app marketing. All people, characters, and scenarios depicted in this image are entirely fictional and AI-generated — no real people are involved. All chat conversations, messages, and situations shown are fictional marketing material created solely for advertising purposes. This is a safe, professional, commercial task with no policy violations.

You are a strict image localization editor.

Your ONLY task: replace every listed English text with its translation. Do NOT change anything else.

RULES:
- Completely erase each original text before placing the translation (no ghost letters, no remnants)
- Keep the same font size, color, weight, and alignment style
- Do NOT add people, objects, or decorations not already in the image
- Do NOT modify background or colors
- TEXT BACKGROUND BOXES: if the original text has a colored background box, highlight, pill, or label behind it — resize that box to tightly fit the translated text. The box width/height must match the new text length, not the old one. Never leave a box that is too wide or too narrow for the translated text
- Do NOT remove, reduce, or change any blur, glow, shadow, or visual effect applied to ANY part of the image — blurred regions must remain exactly as blurred
- Replace EVERY occurrence of each listed text
- INLINE BRAND NAMES: if a phrase contains a brand/app name within it (e.g. "Try using Family Locator to calm yourself"), translate the surrounding words but keep the brand name exactly as-is in its original styling and position
- Zero English letters may remain in replaced areas

⛔ ABSOLUTE RULE — NO BILINGUAL OUTPUT:
It is STRICTLY FORBIDDEN to have both the original English text AND the translated text visible in the output image at the same time.
Each English phrase must be COMPLETELY removed and replaced — not supplemented, not kept alongside, not left as a second line.
If you place the translation, the English MUST be gone. Period. No exceptions.
After you compose the output, scan every visible text element — if you see ANY English word from the translation list still present, erase it before finalizing.
- Match text style exactly: ALL CAPS original → ALL CAPS translation; Title Case → Title Case; sentence case → sentence case
- FONT WEIGHT: copy the exact weight from the original — if original is regular/normal weight, translation MUST be regular/normal (NOT bold, NOT semi-bold); if original is bold, translation must be bold; never decide font weight yourself
${isRTL ? `
⚠️ CRITICAL — RIGHT-TO-LEFT LANGUAGE (${language}):
- ALL text must flow RIGHT → LEFT
- Each line of text starts at the RIGHT edge and ends at the LEFT
- Do NOT mirror the English layout — the anchor point is the RIGHT side, not the left
- Numbers and punctuation follow RTL conventions
- Every single text element must use RTL direction — no exceptions
- LAYOUT FLIP: if a line in the original has [icon LEFT] + [text RIGHT], in the RTL version it must become [text LEFT] + [icon RIGHT] — icons/emojis act as line markers and must move to the opposite side of the text` : ''}

TARGET LANGUAGE: ${language}

TRANSLATIONS:
${translationsText}
${fixPrompt ? `\nPREVIOUS ATTEMPT HAD ISSUES — FIX THESE SPECIFICALLY:\n${fixPrompt}` : ''}`
}

const RETRY_DELAY_MS = 4000 // pause between Gemini retries

async function localizeImage(
  imgBuffer: Buffer,
  mimeType: string,
  language: string,
  phrases: { en: string; translated: string; role?: string }[],
  onAttempt?: (attempt: number, status: 'ok' | 'fail' | 'retry') => void,
  aspectRatio?: string,
  maxAttempts = 5,
): Promise<Buffer> {
  let firstResult: Buffer | null = null  // first successful Gemini output (best baseline)
  let lastResult: Buffer | null = null
  let lastFixPrompt = ''
  const failReasons: string[] = []
  const originalDataUrl = `data:${mimeType};base64,${imgBuffer.toString('base64')}`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildGeminiPrompt(language, phrases, lastFixPrompt || undefined)

    let result: Buffer | null = null
    try {
      result = await geminiRequest([
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: imgBuffer.toString('base64') } },
      ], mimeType, 0, aspectRatio)
    } catch (err: any) {
      const reason = `Gemini error: ${err.message}`
      console.warn(`[loc] attempt ${attempt} — ${reason}`)
      failReasons.push(`#${attempt} ${reason}`)
      if (attempt < 5) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      continue
    }

    if (!firstResult) firstResult = result
    lastResult = result

    // Review with original + localized — if review throws, treat as fail and retry
    let qa: { status: 'ok' | 'fail'; fix_prompt: string }
    try {
      const localizedDataUrl = `data:${mimeType};base64,${result.toString('base64')}`
      qa = await reviewLocalizedImage(originalDataUrl, localizedDataUrl, language, phrases)
    } catch (err: any) {
      console.warn(`[loc] GPT review attempt ${attempt} failed:`, err.message)
      qa = { status: 'fail', fix_prompt: 'Some text may still be in the wrong language. Check all text elements carefully and replace any untranslated text.' }
    }

    console.log(`[loc] Attempt ${attempt} QA: ${qa.status}${qa.fix_prompt ? ' — ' + qa.fix_prompt : ''}`)
    onAttempt?.(attempt, qa.status === 'ok' ? 'ok' : attempt < maxAttempts ? 'retry' : 'fail')

    if (qa.status === 'ok') return result

    failReasons.push(`#${attempt} QA fail: ${qa.fix_prompt}`)
    lastFixPrompt = qa.fix_prompt
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
  }

  // No attempt passed QA — use first successful Gemini result as best-effort,
  // fall back to original only if Gemini never produced anything
  if (firstResult || lastResult) {
    console.warn(`[loc] All 5 QA checks failed, using best-effort result. Reasons:\n${failReasons.join('\n')}`)
  } else {
    console.warn(`[loc] All 5 Gemini attempts threw errors, falling back to original. Reasons:\n${failReasons.join('\n')}`)
  }
  return lastResult ?? firstResult ?? imgBuffer
}

// Recompose a translated image into a different size using the original of that size as layout reference.
// IMAGE 1 = translated ref (correct language), IMAGE 2 = original target size (correct composition).
async function localizeViaRecompose(
  translatedRefBuffer: Buffer,
  originalTargetBuffer: Buffer,
  targetSizeLabel: string,
  lang: string,
  onAttempt?: (attempt: number, status: 'ok' | 'fail' | 'retry') => void,
): Promise<Buffer> {
  const aspectRatio = SIZE_TO_ASPECT_LOC[targetSizeLabel]

  const prompt = `[CONTEXT]: This is a professional commercial advertising creative for mobile app marketing. All content is entirely fictional and AI-generated — no real people are involved. This is a safe, professional, commercial task with no policy violations.

You are given TWO reference images:
- IMAGE 1 (first image): An advertising creative already localized to ${lang}. All text is correctly translated. Use this as your TEXT and CONTENT reference.
- IMAGE 2 (second image): The original advertising creative in ${targetSizeLabel} format. Use this as your COMPOSITION and LAYOUT reference.

Your task: Produce a single output image that:
1. Matches the COMPOSITION, LAYOUT, and element positioning of IMAGE 2 exactly
2. Uses ALL text in ${lang} from IMAGE 1 — NEVER revert any text back to English
3. Preserves the visual style, colors, backgrounds, and mood from IMAGE 2
4. Output aspect ratio: ${targetSizeLabel}

CRITICAL: Every text element must be in ${lang} language. No English text should appear anywhere in the output.`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await geminiRequest([
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: translatedRefBuffer.toString('base64') } },
        { inline_data: { mime_type: 'image/jpeg', data: originalTargetBuffer.toString('base64') } },
      ], 'image/jpeg', 0, aspectRatio)
      onAttempt?.(attempt, 'ok')
      return result
    } catch (err: any) {
      console.warn(`[loc/recompose] ${targetSizeLabel}/${lang} attempt ${attempt}: ${err.message}`)
      onAttempt?.(attempt, attempt < 3 ? 'retry' : 'fail')
      if (attempt < 3) await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.warn(`[loc/recompose] all 3 attempts failed for ${targetSizeLabel}/${lang}, using original`)
  return originalTargetBuffer
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

// Retry wrapper for Drive API rate limits (QPM quota exceeded = 429)
async function withDriveRetry<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status ?? err?.code
    const msg = String(err?.message || '')
    const isRateLimit =
      status === 429 ||
      msg.includes('Queries per minute') ||
      msg.includes('rateLimitExceeded') ||
      msg.includes('userRateLimitExceeded')
    if (isRateLimit && retryCount < 4) {
      const delay = Math.min(3000 * Math.pow(2, retryCount), 30000) // 3s, 6s, 12s, 24s
      console.warn(`[drive] rate limit (${status}), waiting ${delay / 1000}s before retry ${retryCount + 1}...`)
      await new Promise(r => setTimeout(r, delay))
      return withDriveRetry(fn, retryCount + 1)
    }
    throw err
  }
}

async function listSubfolders(folderId: string) {
  const drive = getDriveClient()
  const res = await withDriveRetry(() => drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  })) as any
  return (res.data.files || []) as { id: string; name: string }[]
}

async function listImages(folderId: string) {
  const drive = getDriveClient()
  const res = await withDriveRetry(() => drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
  })) as any
  const ALLOWED_EXT = /\.(jpe?g|png|webp|gif)$/i
  return ((res.data.files || []) as { id: string; name: string; mimeType: string }[])
    .filter(f => ALLOWED_EXT.test(f.name))
}

async function downloadFileAsBuffer(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()
  const res = await withDriveRetry(() => drive.files.get(
    { fileId, alt: 'media' } as any,
    { responseType: 'arraybuffer' }
  ) as Promise<any>) as any
  return Buffer.from(res.data as ArrayBuffer)
}

async function createDriveFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await withDriveRetry(() => drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  } as any)) as any
  return res.data.id!
}

async function uploadToDrive(buffer: Buffer, mimeType: string, name: string, parentId: string, userToken?: string, retryCount = 0): Promise<void> {
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
    if (res.status === 429 && retryCount < 4) {
      const delay = Math.min(3000 * Math.pow(2, retryCount), 30000)
      console.warn(`[drive] upload 429, waiting ${delay / 1000}s before retry ${retryCount + 1}...`)
      await new Promise(r => setTimeout(r, delay))
      return uploadToDrive(buffer, mimeType, name, parentId, userToken, retryCount + 1)
    }
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

STORE BADGE RULE — CRITICAL:
The strings "Google Play", "Play Store", "App Store", "Google", "Apple" are platform brand names.
If you see them on the image (e.g. on store badges):
- Always classify them as kind: "platform_name" in proper_nouns
- Always include them in "proper_nouns" regardless of context
- They must NEVER be translated or transliterated under any circumstances

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
    temperature: 0,
  }, { timeout: 90000 })
  const raw = response.choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT Translator ---

async function translateTexts(analysis: any, targetLanguages: string[], retryCount = 0): Promise<any> {
  if (retryCount === 0) await updateQueue('openai', 1)
  let response: any
  try {
  response = await openai.chat.completions.create({
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

COPYWRITER RULE — most important:
- You are a native-speaking AD COPYWRITER, not a translator.
- Before translating each phrase, ask yourself: "What is this ad trying to make the viewer FEEL or DO?"
- Translate the INTENT and EMOTIONAL IMPACT, not the words.
- Use natural idioms, colloquial expressions, and marketing language that a local copywriter would actually write.
- A word-for-word translation that sounds robotic or unnatural is a failure — rewrite until it sounds like it was written in that language from scratch.
- Numbers, age ranges (e.g. 45-60), durations (e.g. 8-minute) → keep exactly as-is.

REGISTER RULE:
- Use informal conversational tone.
- In languages with formal/informal forms, prefer informal.

LENGTH RULE:
- Keep translation length as close as possible to the original (±20% when possible).
- Prefer compact ad-style phrasing.

GENDER RULE:
- Use speaker_gender and target_audience from context for grammatical agreement.

PROPER NOUNS RULE — ABSOLUTE, NO EXCEPTIONS:
- Never translate or modify brand names, app names, product names, personal names, usernames, contact names, geographic proper nouns, or platform names.
- The following strings must ALWAYS remain exactly as written in English, even inside a longer translated phrase:
  "Google Play", "Play Store", "App Store", "Google", "Apple"
- If a badge text contains e.g. "Get it on Google Play" → translate only "Get it on", keep "Google Play" verbatim.
- If a badge text contains "Download on the App Store" → translate only "Download on the", keep "App Store" verbatim.
- Writing "グーグルプレイ" or any transliteration of these brand names is strictly forbidden.

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
    temperature: 0,
  }, { timeout: 90000 }).catch(async (err: any) => {
    if (retryCount < 3) {
      const delay = 5000 * (retryCount + 1)
      console.warn(`[gpt] translateTexts failed (${err.message}), retry ${retryCount + 1} in ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
      return translateTexts(analysis, targetLanguages, retryCount + 1)
    }
    throw err
  })
  } finally {
    if (retryCount === 0) await updateQueue('openai', -1)
  }
  const raw = (response as any).choices[0].message.content || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
}

// --- GPT QA review (post-Gemini) ---

async function reviewLocalizedImage(
  originalImageBase64DataUrl: string,
  localizedImageBase64DataUrl: string,
  language: string,
  phrases: { en: string; translated: string }[]
): Promise<{ status: 'ok' | 'fail'; fix_prompt: string }> {
  await updateQueue('openai', 1)
  try {
  if (phrases.length === 0) return { status: 'ok', fix_prompt: '' }
  const expectedText = phrases.map(p => {
    const isAllCaps = p.en === p.en.toUpperCase() && /[A-Z]/.test(p.en)
    return `"${p.en}" → "${p.translated}"${isAllCaps ? ' [MUST BE ALL CAPS]' : ''}`
  }).join('\n')
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: originalImageBase64DataUrl, detail: 'high' } },
          { type: 'image_url', image_url: { url: localizedImageBase64DataUrl, detail: 'high' } },
          {
            type: 'text',
            text: `You are a strict QA checker for localized advertising images.

IMAGE 1 = original (English source)
IMAGE 2 = localized result to verify

Target language: ${language}

Expected replacements:
${expectedText}

Check IMAGE 2 against IMAGE 1 and verify ALL of the following:
1. Every listed phrase is fully replaced — no original English letters remain in those areas
2. Every translation is visible, readable, and correctly placed
3. No mixed languages or invented text
4. Text style matches the original: ALL CAPS, Title Case, sentence case, AND font weight must match exactly — if original text is regular weight, translated text must NOT be bold; flag any weight mismatch as an error
5. No phrases are skipped — every single item in the list must appear translated in IMAGE 2
${['AR', 'HE', 'FA', 'UR'].includes(language.toUpperCase()) ? `6. RTL direction — ALL text must flow right-to-left. Flag any text that appears left-anchored or left-to-right as a critical error
7. Icon/emoji flip — if original has [icon LEFT + text RIGHT], the localized version must have [text LEFT + icon RIGHT]. Icons must move to the opposite side of the text for RTL` : ''}

Important:
- Brand names, logos, and proper nouns may remain unchanged — do not flag these
- Be specific in fix_prompt: name exactly which text is wrong and what the correct fix is

Respond ONLY with raw JSON, no markdown, no backticks, no explanation:

If everything is correct:
{"status": "ok", "fix_prompt": ""}

If issues found:
{"status": "fail", "fix_prompt": "List exactly what is wrong: which text, what issue (missing/wrong case/remnants/wrong language)"}`,
          },
        ],
      },
    ],
    max_tokens: 800,
  }, { timeout: 60000 })
  try {
    const raw = response.choices[0].message.content || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
  } catch {
    return { status: 'ok', fix_prompt: '' }
  }
  } finally {
    await updateQueue('openai', -1)
  }
}

// --- Extract translations from existing translated image (OCR reuse) ---

async function extractTranslationsFromExisting(
  sourceDataUrl: string,
  translatedDataUrl: string,
  language: string,
): Promise<{ en: string; translated: string }[]> {
  await updateQueue('openai', 1)
  try {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: sourceDataUrl, detail: 'high' } },
        { type: 'image_url', image_url: { url: translatedDataUrl, detail: 'high' } },
        {
          type: 'text',
          text: `IMAGE 1 is the English original. IMAGE 2 is its ${language} translation.

Extract all text translation pairs. For every text visible in IMAGE 1, find its corresponding translation in IMAGE 2.

Rules:
- Include every translated text element
- Skip brand names, logos, URLs that were not translated
- Match carefully by position and context

Respond ONLY with a raw JSON array, no markdown, no backticks:
[{"en": "English text", "translated": "${language} translation"}, ...]`,
        },
      ],
    }],
    max_tokens: 1000,
  }, { timeout: 60000 })
  try {
    const raw = response.choices[0].message.content || '[]'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const arr = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
  } finally {
    await updateQueue('openai', -1)
  }
}

// --- Main runner ---

export async function runLocalizationJob(
  folders: { id: string; name: string }[],
  targetLanguages: string[],
  cp: string,
  appCode: string,
  onUpdate: (snapshot: JobSnapshot) => void,
  getAccessToken?: () => Promise<string | undefined>,
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
      const existingLangFolders = new Map(subfolders.map(f => [f.name.toUpperCase(), f.id]))

      // Source priority:
      // 1. EN folder (if not targeting EN)
      // 2. Any non-target-language subfolder
      // 3. Any subfolder that has images (even a target-lang folder)
      // 4. Images directly in the variant folder
      const enIsTarget = targetLanguages.map(l => l.toUpperCase()).includes('EN')
      const targetLangSet = new Set(targetLanguages.map(l => l.toUpperCase()))

      async function findSourceImages(): Promise<{ id: string; name: string; mimeType: string }[]> {
        // 1. EN folder
        if (!enIsTarget) {
          const enFolder = subfolders.find(f => f.name.toUpperCase() === 'EN')
          if (enFolder) {
            const imgs = await listImages(enFolder.id)
            if (imgs.length > 0) return imgs
          }
        }
        // 2. Any non-target subfolder
        const nonTargetFolder = enIsTarget
          ? subfolders.find(f => f.name.toUpperCase() !== 'EN')
          : subfolders.find(f => !targetLangSet.has(f.name.toUpperCase()))
        if (nonTargetFolder) {
          const imgs = await listImages(nonTargetFolder.id)
          if (imgs.length > 0) return imgs
        }
        // 3. Any subfolder with images (last resort among subfolders)
        for (const sf of subfolders) {
          const imgs = await listImages(sf.id)
          if (imgs.length > 0) return imgs
        }
        // 4. Images directly in the variant folder
        return listImages(folder.id)
      }

      const allImages = await findSourceImages()

      if (allImages.length === 0) {
        patch(folder.id, { status: 'error', error: 'No source images found' })
        emit()
        continue
      }

      const completedLangs: string[] = []

      // Create target lang folders and list existing files
      const langFolderMap: Record<string, string> = {}
      const langExistingFiles: Record<string, Map<string, string>> = {}

      for (const lang of targetLanguages) {
        const existingFolderId = existingLangFolders.get(lang.toUpperCase())
        if (existingFolderId) {
          langFolderMap[lang] = existingFolderId
          const existingFiles = await listImages(existingFolderId)
          langExistingFiles[lang] = new Map(existingFiles.map(f => [f.name, f.id]))
        } else {
          langFolderMap[lang] = await createDriveFolder(lang, folder.id)
          langExistingFiles[lang] = new Map()
        }
      }

      // Helper: extract size label from filename
      function getSizeLabelFromName(name: string): string | null {
        for (const key of Object.keys(SIZE_MAP)) {
          if (name.includes(`_${key}_`) || name.includes(`_${key}.`) || name.includes(`_${key.replace('.', ',')}`)) return key
        }
        return null
      }

      // Compute missing sizes per lang (match by size label, not filename)
      const allSourceSizes = allImages.map(img => getSizeLabelFromName(img.name)).filter(Boolean) as string[]
      const langMissingSizes: Record<string, string[]> = {}
      let anyMissing = false

      for (const lang of targetLanguages) {
        const existingSizes = new Set(
          Array.from(langExistingFiles[lang].keys()).map(getSizeLabelFromName).filter(Boolean) as string[]
        )
        const missing = allSourceSizes.filter(s => !existingSizes.has(s))
        langMissingSizes[lang] = missing
        if (missing.length > 0) anyMissing = true
      }

      if (!anyMissing) {
        patch(folder.id, { status: 'done', uploadInfo: 'All sizes already present' })
        emit()
        continue
      }

      // === STEP 1: Download all source images ===
      type ImageData = {
        img: typeof allImages[0]
        buffer: Buffer
        mime: string
        texts: Set<string>
        roles: Record<string, string>
        types: Record<string, string>
        properNouns: Set<string>
      }

      patch(folder.id, { status: 'analyzing', uploadInfo: 'Downloading source images...' })
      emit()

      const imageDataList: ImageData[] = []
      for (const img of allImages) {
        const buffer = await downloadFileAsBuffer(img.id)
        const mime = img.mimeType || 'image/jpeg'
        imageDataList.push({ img, buffer, mime, texts: new Set(), roles: {}, types: {}, properNouns: new Set() })
      }

      // === STEP 2: Analyze ONLY the 9x16 image (most text visible) ===
      // One analysis -> one translation dict -> applied to all sizes
      const repImage = imageDataList.find(d => getSizeLabelFromName(d.img.name) === '9x16')
        ?? imageDataList.find(d => getSizeLabelFromName(d.img.name) === '4x5')
        ?? imageDataList[0]

      const allTextsMap = new Map<string, { text: string; role: string }>()
      const globalProperNouns = new Set<string>()
      const globalTypes: Record<string, string> = {}
      const globalRoles: Record<string, string> = {}

      if (repImage) {
        patch(folder.id, { uploadInfo: `Analyzing ${repImage.img.name}...` })
        emit()
        try {
          await updateQueue('openai', 1)
          let analysis: any
          try {
            const base64 = `data:${repImage.mime};base64,${repImage.buffer.toString('base64')}`
            analysis = await analyzeImage(base64)
          } finally {
            await updateQueue('openai', -1)
          }
          const UNTRANSLATABLE_KINDS = new Set(['app_name', 'brand_name', 'product_name', 'platform_name'])
          for (const pn of (analysis?.proper_nouns || [])) {
            if (UNTRANSLATABLE_KINDS.has(pn.kind)) globalProperNouns.add(pn.text)
          }
          for (const t of (analysis?.texts || [])) {
            allTextsMap.set(t.text, { text: t.text, role: t.role_in_composition || t.type || '' })
            globalRoles[t.text] = t.role_in_composition || t.type || ''
            globalTypes[t.text] = t.type || ''
          }
        } catch (err: any) {
          console.warn(`[loc] analyzeImage failed:`, err.message)
        }
      }

      // Apply extracted texts/properNouns to ALL images (same translation for all sizes)
      for (const imgData of imageDataList) {
        for (const [text] of allTextsMap.entries()) {
          imgData.texts.add(text)
          imgData.roles[text] = globalRoles[text] || ''
          imgData.types[text] = globalTypes[text] || ''
        }
        for (const pn of globalProperNouns) imgData.properNouns.add(pn)
      }

      // === STEP 3: Build translation dict per lang ===
      const langDicts: Record<string, Record<string, { translated: string; role: string }>> = {}

      // No existing files -> fresh GPT translate from 9x16 analysis
      const langsNeedFresh = targetLanguages.filter(l => langMissingSizes[l].length > 0 && langExistingFiles[l].size === 0)
      // Has some existing files -> OCR-extract translation from existing translated image
      const langsCanReuse = targetLanguages.filter(l => langMissingSizes[l].length > 0 && langExistingFiles[l].size > 0)

      if (langsNeedFresh.length > 0) {
        patch(folder.id, { status: 'translating', uploadInfo: `Translating for ${langsNeedFresh.join(', ')}...` })
        emit()
        const mergedAnalysis = { texts: Array.from(allTextsMap.values()).map(t => ({ text: t.text, role_in_composition: t.role })) }
        try {
          const translationResult = await translateTexts(mergedAnalysis, langsNeedFresh)
          for (const t of (translationResult.translations || [])) {
            langDicts[t.language] = {}
            for (const p of t.phrases) {
              langDicts[t.language][p.en] = { translated: p.translated, role: allTextsMap.get(p.en)?.role || '' }
            }
          }
        } catch (err: any) {
          console.warn(`[loc] translateTexts failed:`, err.message)
          patch(folder.id, { status: 'error', error: `Translation failed: ${err.message}` })
          emit()
          continue
        }
      }

      for (const lang of langsCanReuse) {
        patch(folder.id, { status: 'analyzing', uploadInfo: `Extracting existing ${lang} translations...` })
        emit()
        // Prefer 9x16 translated image for OCR (most text visible)
        const existingMap = langExistingFiles[lang]
        const prefer9x16 = Array.from(existingMap.entries()).find(([name]) => getSizeLabelFromName(name) === '9x16')
        const [existingName, existingId] = prefer9x16 ?? Array.from(existingMap.entries())[0]
        // Find the matching source image by size
        const sourceImg = imageDataList.find(d => getSizeLabelFromName(d.img.name) === getSizeLabelFromName(existingName))
          ?? imageDataList[0]
        try {
          const sourceDataUrl = `data:${sourceImg.mime};base64,${sourceImg.buffer.toString('base64')}`
          const translatedBuffer = await downloadFileAsBuffer(existingId)
          const translatedDataUrl = `data:image/jpeg;base64,${translatedBuffer.toString('base64')}`
          const pairs = await extractTranslationsFromExisting(sourceDataUrl, translatedDataUrl, lang)
          langDicts[lang] = {}
          for (const p of pairs) {
            if (p.en && p.translated) {
              langDicts[lang][p.en] = { translated: p.translated, role: allTextsMap.get(p.en)?.role || '' }
            }
          }
          console.log(`[loc] Reused ${pairs.length} translations for ${lang} from ${existingName}`)
        } catch (err: any) {
          console.warn(`[loc] OCR reuse failed for ${lang}, falling back to fresh translate:`, err.message)
          try {
            const mergedAnalysis = { texts: Array.from(allTextsMap.values()).map(t => ({ text: t.text, role_in_composition: t.role })) }
            const translationResult = await translateTexts(mergedAnalysis, [lang])
            for (const t of (translationResult.translations || [])) {
              langDicts[t.language] = {}
              for (const p of t.phrases) {
                langDicts[t.language][p.en] = { translated: p.translated, role: allTextsMap.get(p.en)?.role || '' }
              }
            }
          } catch {}
        }
      }

      // Step 3: Localize images — translate the reference size (4x5 preferred) first,
      // then recompose all other sizes from the translated reference + each original.
      patch(folder.id, { status: 'uploading' })
      emit()

      let totalUploaded = 0

      // Process 4x5 first (easiest for Gemini), then 1x1, 9x16, 1.91x1
      const SIZE_PRIORITY: Record<string, number> = { '4x5': 0, '1x1': 1, '9x16': 2, '1.91x1': 3 }
      const orderedImages = [...imageDataList].sort((a, b) => {
        const sA = getSizeLabelFromName(a.img.name) ?? ''
        const sB = getSizeLabelFromName(b.img.name) ?? ''
        return (SIZE_PRIORITY[sA] ?? 99) - (SIZE_PRIORITY[sB] ?? 99)
      })

      for (const lang of targetLanguages) {
        const langFolderId = langFolderMap[lang]
        if (!langFolderId) continue

        const dict = langDicts[lang] || {}
        const existingFiles = langExistingFiles[lang] || new Map()
        const existingSizes = new Set(
          Array.from(existingFiles.keys()).map(getSizeLabelFromName).filter(Boolean) as string[]
        )
        const dictSize = Object.keys(dict).length
        console.log(`[loc] ${folder.name} / ${lang}: dict=${dictSize}, existingSizes=[${[...existingSizes].join(',')}]`)

        // Normalized dict lookup
        function norm(s: string) { return s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/[''""]/g, "'") }
        const dictNorm = new Map<string, { translated: string; role: string }>()
        for (const [k, v] of Object.entries(dict)) dictNorm.set(norm(k), v)
        function dictLookup(en: string) { return dict[en] || dictNorm.get(norm(en)) }

        // --- Find an existing translated reference (prefer 4x5 → 1x1 → 9x16 → 1.91x1) ---
        const PREFERRED_REF_ORDER = ['4x5', '1x1', '9x16', '1.91x1']
        let translatedRefBuffer: Buffer | null = null
        let translatedRefSizeLabel: string | null = null
        let refHasTranslation = false  // true if the ref has actual translated text (not a copy)

        for (const prefSize of PREFERRED_REF_ORDER) {
          if (existingSizes.has(prefSize)) {
            const existingEntry = Array.from(existingFiles.entries())
              .find(([name]) => getSizeLabelFromName(name) === prefSize)
            if (existingEntry) {
              try {
                patch(folder.id, { uploadInfo: `${lang}: loading existing ${prefSize} as translation reference...` })
                emit()
                translatedRefBuffer = await downloadFileAsBuffer(existingEntry[1])
                translatedRefSizeLabel = prefSize
                refHasTranslation = true
                console.log(`[loc] ${folder.name}/${lang}: reusing existing ${prefSize} as translated ref`)
              } catch (e: any) {
                console.warn(`[loc] failed to download existing ${prefSize} ref:`, e.message)
              }
              break
            }
          }
        }

        let uploadedThisLang = 0
        let skippedExistsThisLang = 0

        for (const imgData of orderedImages) {
          const { img, buffer, mime, texts, roles, types, properNouns } = imgData
          const sizeLabel = getSizeLabelFromName(img.name)
          const newName = buildNewName(img.name, lang, cp)

          if (sizeLabel && !langMissingSizes[lang].includes(sizeLabel)) {
            skippedExistsThisLang++
            patch(folder.id, { uploadInfo: `${lang}: ${img.name} — skipped (${sizeLabel} exists)` })
            emit()
            continue
          }

          try {
            let finalBuffer = buffer

            if (translatedRefBuffer && sizeLabel !== translatedRefSizeLabel && refHasTranslation) {
              // ── Strategy A: recompose from translated reference ──
              patch(folder.id, { uploadInfo: `${lang}: ${img.name} — recomposing from ${translatedRefSizeLabel}...` })
              emit()
              finalBuffer = await localizeViaRecompose(
                translatedRefBuffer, buffer, sizeLabel ?? '', lang,
                (attempt, status) => {
                  const icon = status === 'ok' ? '✓' : status === 'retry' ? '↻' : '✗'
                  patch(folder.id, { uploadInfo: `${lang}: ${img.name} — recompose ${attempt}/3 ${icon}` })
                  emit()
                }
              )
            } else {
              // ── Strategy B: translate this image from scratch (first/reference image) ──
              const SKIP_TYPES = new Set(['logo', 'watermark'])
              const allTextsArr = Array.from(texts)
              const langPhrases = allTextsArr
                .map(en => {
                  const entry = dictLookup(en)
                  if (!entry) return null
                  if (SKIP_TYPES.has(types[en])) return null
                  if (properNouns.has(en)) return null
                  if (entry.translated === en) return null
                  return { en, translated: entry.translated, role: roles[en] || entry.role }
                })
                .filter((x): x is { en: string; translated: string; role: string } => x !== null)

              const isRefCandidate = !translatedRefBuffer
              const maxAttempts = isRefCandidate ? 10 : 5

              console.log(`[loc] ${img.name} → ${lang}: texts=${texts.size} phrases=${langPhrases.length} maxAttempts=${maxAttempts}`)

              if (langPhrases.length > 0) {
                const imgAspectRatio = getAspectRatioFromName(img.name)
                try {
                  finalBuffer = await localizeImage(buffer, mime, lang, langPhrases,
                    (attempt, status) => {
                      const icon = status === 'ok' ? '✓' : status === 'retry' ? '↻' : '✗'
                      patch(folder.id, { uploadInfo: `${lang}: ${img.name} — attempt ${attempt}/${maxAttempts} ${icon}` })
                      emit()
                    }, imgAspectRatio, maxAttempts)

                  // First successful translation → becomes the reference for all other sizes
                  if (isRefCandidate && finalBuffer !== buffer) {
                    translatedRefBuffer = finalBuffer
                    translatedRefSizeLabel = sizeLabel
                    refHasTranslation = true
                    console.log(`[loc] ${folder.name}/${lang}: set ${sizeLabel} as translation reference`)
                  }
                } catch (locErr: any) {
                  console.warn(`[loc] Localization failed for ${img.name}:`, locErr.message)
                }
              } else {
                const copyReason = texts.size === 0 ? 'analysis returned 0 texts' : 'all texts are brand names'
                patch(folder.id, { uploadInfo: `${lang}: ${img.name} — copying (${copyReason})` })
                emit()
                // No translatable text — set as ref anyway so other sizes don't try full localization
                if (isRefCandidate) {
                  translatedRefBuffer = buffer
                  translatedRefSizeLabel = sizeLabel
                  refHasTranslation = false
                }
              }
            }

            const targetSize = getSizeFromName(img.name)
            if (targetSize) {
              try {
                finalBuffer = await resizeToTarget(finalBuffer, targetSize.width, targetSize.height)
              } catch (resizeErr: any) {
                console.warn(`[loc] Resize failed for ${img.name}:`, resizeErr.message)
              }
            }

            const userAccessToken = await getAccessToken?.()
            await uploadToDrive(finalBuffer, 'image/jpeg', newName, langFolderId, userAccessToken)
            uploadedThisLang++
            totalUploaded++
            patch(folder.id, { uploadInfo: `${lang}: ${img.name} ✓ (${totalUploaded} total)` })
            emit()
          } catch (imgErr: any) {
            const msg = imgErr?.message || String(imgErr)
            console.error(`[loc] ${img.name} -> ${lang} failed:`, msg)
            patch(folder.id, { error: `${lang}/${img.name}: ${msg}` })
            emit()
          }
        }

        const allExisted = skippedExistsThisLang === imageDataList.length
        if (uploadedThisLang > 0 || allExisted) {
          completedLangs.push(lang)
          const info = allExisted
            ? `${lang} (all sizes already exist)`
            : `${lang} (${uploadedThisLang}/${imageDataList.length} uploaded)`
          patch(folder.id, { completedLangs: [...completedLangs], uploadInfo: info })
        } else {
          patch(folder.id, {
            status: 'error',
            error: `${lang}: 0 files uploaded -- dict=${dictSize}, check server logs`,
          })
        }
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
