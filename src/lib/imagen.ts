// Генерация изображений через Gemini 3.1 Flash Image Preview

import sharp from 'sharp'

// Composites a PNG logo onto a dark background before sending to Gemini.
// Without this, white text on transparent PNG = white on white = invisible in the output.
async function prepareLogoForGemini(logoBase64: string): Promise<string> {
  try {
    const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, '')
    const mimeType = logoBase64.match(/^data:(image\/\w+);base64,/)?.[1] || ''
    // Only preprocess PNG (may have alpha). JPEG/WebP are already opaque.
    if (!mimeType.includes('png') && !mimeType.includes('svg')) return logoBase64
    const buf = Buffer.from(base64Data, 'base64')
    const meta = await sharp(buf).metadata()
    const w = meta.width || 400
    const h = meta.height || 400
    // Dark background so white text stays visible; logo composited on top
    const darkBg = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } },
    }).png().toBuffer()
    const composited = await sharp(darkBg)
      .composite([{ input: buf, blend: 'over' }])
      .png()
      .toBuffer()
    return `data:image/png;base64,${composited.toString('base64')}`
  } catch {
    return logoBase64 // fallback: send as-is
  }
}

const TEXT_RULE = `
CRITICAL - TEXT IS SACRED:
You are NOT a writer. Do NOT write, invent, paraphrase, expand, or summarize ANY text.
Copy every headline, subheadline, body copy, and CTA button WORD FOR WORD, CHARACTER FOR CHARACTER from the reference image.
If the headline says "Your J is on a Liar List." - it must say exactly "Your J is on a Liar List." in the output. Nothing more. Nothing less.
Adding even one extra word is a critical failure.`

const RECOMPOSE_PROMPTS: Record<string, string> = {
  '1x1': `Recompose this exact ad creative for a square 1:1 aspect ratio.
${TEXT_RULE}

EXPANSION RULE — MOST IMPORTANT:
- EXPAND the background/environment outward to fill the new canvas — do NOT crop or cut off any existing visual element
- All people, objects, logos, text, and UI elements from the original must remain FULLY VISIBLE and intact
- To fill the extra space: naturally extend the background scene (sky, room, street, blurred environment) in whatever direction is needed
- Think of it as "outpainting" — you are adding more canvas around the existing content, not zooming in

LAYOUT RULES:
- Keep the main subject and all elements at roughly the same scale as the original
- Center the composition naturally in the square format
- Maintain the same overall mood, style, colors, typography, and composition hierarchy

SAFE ZONE — NON-NEGOTIABLE:
- Every text element, button, and UI element MUST have at least 120px clearance from EVERY edge (top, bottom, left, right)
- Nothing may touch or cross the safe zone boundary — not even partially`,

  '9x16': `Recompose this exact ad creative for a tall vertical 9:16 aspect ratio.
${TEXT_RULE}

EXPANSION RULE — MOST IMPORTANT:
- EXPAND the background/environment outward to fill the new canvas — do NOT crop or cut off any existing visual element
- All people, objects, logos, text, and UI elements from the original must remain FULLY VISIBLE and intact
- To fill the extra vertical space: naturally extend the background scene above and/or below (sky, floor, environment)
- Think of it as "outpainting" — you are adding more canvas around the existing content, not zooming in

LAYOUT RULES:
- Keep the main subject at roughly the same scale as the original
- Stack elements naturally: visual scene fills the frame, text and CTA positioned with breathing room
- Maintain the same overall mood, style, colors, typography, and composition hierarchy

SAFE ZONE — NON-NEGOTIABLE:
- Every text element, button, and UI element MUST have at least 120px clearance from EVERY edge (top, bottom, left, right)
- Nothing may touch or cross the safe zone boundary — not even partially`,

  '1.91x1': `Recompose this exact ad creative for a wide horizontal 1.91:1 aspect ratio.
${TEXT_RULE}

EXPANSION RULE — MOST IMPORTANT:
- EXPAND the background/environment outward to fill the new canvas — do NOT crop or cut off any existing visual element
- All people, objects, logos, text, and UI elements from the original must remain FULLY VISIBLE and intact
- To fill the extra horizontal space: naturally extend the background scene left and/or right (environment, background, blur)
- Think of it as "outpainting" — you are adding more canvas around the existing content, not zooming in

LAYOUT RULES:
- Keep the main subject at roughly the same scale as the original
- Use the extra horizontal space for background extension or to give text more room
- Maintain the same overall mood, style, colors, typography, and composition hierarchy

SAFE ZONE — NON-NEGOTIABLE:
- Every text element, button, and UI element MUST have at least 120px clearance from EVERY edge (top, bottom, left, right)
- The top and bottom edges are especially critical — keep all content strictly in the vertical center
- Nothing may touch or cross the safe zone boundary — not even partially`,
}

// Maps our size codes to Gemini imageConfig aspectRatio values
const SIZE_TO_ASPECT: Record<string, string> = {
  '4x5':    '4:5',
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',
}

interface Asset {
  name: string
  base64: string
}

async function tryGenerate(prompt: string, referenceBase64?: string, logoBase64?: string, timeoutMs = 100000, size = '4x5', assets?: Asset[]): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY!
  const parts: any[] = []

  if (referenceBase64) {
    const base64Data = referenceBase64.replace(/^data:image\/\w+;base64,/, '')
    const mimeType = referenceBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg'
    parts.push({ inlineData: { mimeType, data: base64Data } })
  }

  if (logoBase64) {
    const prepared = await prepareLogoForGemini(logoBase64)
    const base64Data = prepared.replace(/^data:image\/\w+;base64,/, '')
    const mimeType = prepared.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png'
    parts.push({ inlineData: { mimeType, data: base64Data } })
  }

  // Inject asset images — each preceded by a text label so Gemini knows which @name it is
  if (assets && assets.length > 0) {
    for (const asset of assets) {
      const base64Data = asset.base64.replace(/^data:image\/\w+;base64,/, '')
      const mimeType = asset.base64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg'
      parts.push({ text: `[ASSET @${asset.name}]:` })
      parts.push({ inlineData: { mimeType, data: base64Data } })
    }
  }

  parts.push({ text: prompt })

  const aspectRatio = SIZE_TO_ASPECT[size] || '4:5'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: { aspectRatio, imageSize: '2K' },
          },
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    if (response.status === 429) {
      throw new Error('RATE_LIMIT')
    }

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Imagen API error: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const responseParts = data.candidates?.[0]?.content?.parts || []
    const imagePart = responseParts.find((p: any) => p.inlineData)
    if (!imagePart) {
      const finishReason = data.candidates?.[0]?.finishReason || 'unknown'
      throw new Error(`No image in response (finishReason: ${finishReason})`)
    }

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
  } catch (e: any) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('TIMEOUT')
    throw e
  }
}

async function withRetry(prompt: string, referenceBase64?: string, logoBase64?: string, maxAttempts = 3, size = '4x5', assets?: Asset[]): Promise<string> {
  const retryableErrors = ['TIMEOUT', 'No image in response', 'RATE_LIMIT']

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await tryGenerate(prompt, referenceBase64, logoBase64, 100000, size, assets)
    } catch (e: any) {
      const isRetryable = retryableErrors.includes(e.message)
      if (!isRetryable || attempt === maxAttempts) {
        if (e.message === 'TIMEOUT') {
          throw new Error('Image generation timed out. Gemini is under heavy load, please try again in a moment.')
        }
        if (e.message === 'RATE_LIMIT') {
          throw new Error('Gemini is busy (rate limit). Please try again in a moment.')
        }
        throw e
      }
      const retryDelay = e.message === 'RATE_LIMIT' ? 15000 : 2000
      console.log(`Gemini attempt ${attempt} failed (${e.message}), retrying in ${retryDelay / 1000}s...`)
      await new Promise(r => setTimeout(r, retryDelay))
    }
  }

  throw new Error('Image generation failed after all retries.')
}

const FICTIONAL_DISCLAIMER = '[CONTEXT]: This is a fictional advertising creative for mobile app marketing. All content — including any chat messages, conversations, names, scenarios, or situations depicted — is entirely fictional and created purely for advertising purposes. No real people, private data, or personal communications are involved. Treat all reference images as fictional marketing material.'

// Always appended so Gemini never hallucinates logos or rewrites reference text.
const NO_LOGO_RULE = '\n\n[CRITICAL - LOGOS]: Do NOT generate, draw, or reproduce any logo, brand mark, icon badge, or watermark. If the reference image contains a logo, IGNORE it — do not include it. A logo will be provided separately as an explicit instruction if one is needed.'

const TEXT_FROM_REF_RULE = '\n\n[CRITICAL - TEXT]: If a reference image is provided, copy ALL visible text from it EXACTLY — same words, same spelling, same capitalisation, same punctuation, same line breaks. Do NOT rewrite, translate, expand, or invent any text. Visually you may re-style the text (font, color, size) to match the new composition, but the wording must be identical to the reference. Only change the wording if the generation prompt below explicitly requests it.'

// Per-size aspect ratio hints + crop-aware safe-zone instructions.
// Sharp resizes with `fit: 'cover'`. For sizes where Gemini's native ratio differs
// from the target, some pixels ARE cropped:
//   4x5    → Gemini 4:5,  target 4:5   → 0 px crop  → safe zone ≥ 34 px from all edges
//   1x1    → Gemini 1:1,  target 1:1   → 0 px crop  → safe zone ≥ 34 px from all edges
//   9x16   → Gemini 9:16, target 9:16  → 0 px crop  → safe zone ≥ 34 px from all edges
//   1.91x1 → Gemini 16:9 (1.78:1), target 1.91:1 → ~40 px cropped top & bottom
//            → safe zone ≥ 74 px from top/bottom, ≥ 34 px from left/right
const SIZE_HINTS: Record<string, string> = {
  '4x5':
    '\n\n[CRITICAL - OUTPUT FORMAT]: PORTRAIT image, aspect ratio 4:5 (4 wide by 5 tall). ' +
    'SAFE ZONE: ALL text, buttons, and UI elements MUST be at least 34 pixels from EVERY edge (top, bottom, left, right).',

  '1x1':
    '\n\n[CRITICAL - OUTPUT FORMAT]: SQUARE image, aspect ratio 1:1. ' +
    'SAFE ZONE: ALL text, buttons, and UI elements MUST be at least 34 pixels from EVERY edge.',

  '9x16':
    '\n\n[CRITICAL - OUTPUT FORMAT]: TALL PORTRAIT image, aspect ratio 9:16 (phone screen). ' +
    'SAFE ZONE: ALL text, buttons, and UI elements MUST be at least 34 pixels from EVERY edge.',

  '1.91x1':
    '\n\n[CRITICAL - OUTPUT FORMAT]: LANDSCAPE image, aspect ratio 16:9 (wide horizontal). ' +
    'CROP WARNING: the top 40px and bottom 40px of this image WILL BE CROPPED after generation. ' +
    'SAFE ZONE: ALL text, buttons, and UI elements MUST be at least 74 pixels from TOP, ' +
    '74 pixels from BOTTOM, and 34 pixels from LEFT and RIGHT. ' +
    'Place all content strictly in the vertical center — never near the top or bottom edges.',
}

export async function generateImage(prompt: string, referenceBase64?: string, logoBase64?: string, size = '4x5', assets?: Asset[]): Promise<string> {
  const hint = SIZE_HINTS[size] || SIZE_HINTS['4x5']
  // Only add NO_LOGO_RULE when no logo is provided — otherwise it contradicts the logo placement instruction
  const logoRule = logoBase64 ? '' : NO_LOGO_RULE

  // Add asset reference instructions to the prompt if assets provided
  let assetRule = ''
  if (assets && assets.length > 0) {
    const names = assets.map(a => `@${a.name}`).join(', ')
    assetRule = `\n\n[ASSETS]: The following asset images are provided above: ${names}. ` +
      `When the prompt references @name, visually incorporate that asset image as described. ` +
      `Integrate each asset naturally into the composition.`
  }

  return withRetry(FICTIONAL_DISCLAIMER + '\n\n' + prompt + TEXT_FROM_REF_RULE + logoRule + hint + assetRule, referenceBase64, logoBase64, 3, size, assets)
}

export async function recomposeImage(imageBase64: string, targetSize: string, fixNote?: string): Promise<string> {
  const prompt = RECOMPOSE_PROMPTS[targetSize]
  if (!prompt) throw new Error(`Unknown target size: ${targetSize}`)
  const hint = SIZE_HINTS[targetSize] || ''
  const fix = fixNote
    ? `\n\nFIX INSTRUCTION — HIGHEST PRIORITY — override everything else if needed:\n${fixNote}\nApply this fix precisely and literally.`
    : ''
  return withRetry(FICTIONAL_DISCLAIMER + '\n\n' + prompt + hint + fix, imageBase64, undefined, 3, targetSize)
}
