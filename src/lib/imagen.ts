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

LAYOUT RULES (the ONLY thing you may change):
- Reposition and rescale existing elements to fit naturally in a square format
- Center the main subject and headline text horizontally and vertically
- Ensure all text is fully visible within safe zones (at least 10% padding from all edges)
- Maintain the same overall mood, style, colors, typography, and composition hierarchy`,

  '9x16': `Recompose this exact ad creative for a tall vertical 9:16 aspect ratio.
${TEXT_RULE}

LAYOUT RULES (the ONLY thing you may change):
- Reposition and rescale existing elements to fit naturally in a tall vertical format
- Stack elements vertically: main visual in upper portion, headline in the middle, CTA button near the bottom
- Ensure all text is fully visible within safe zones (at least 10% padding from all edges)
- Maintain the same overall mood, style, colors, typography, and composition hierarchy`,

  '1.91x1': `Recompose this exact ad creative for a wide horizontal 1.91:1 aspect ratio.
${TEXT_RULE}

LAYOUT RULES (the ONLY thing you may change):
- Reposition and rescale existing elements to fit naturally in a wide horizontal format
- Place main visual on one side, text hierarchy (headline + subheadline + CTA) on the other side
- Ensure all text is fully visible within safe zones (at least 10% padding from all edges)
- Maintain the same overall mood, style, colors, typography, and composition hierarchy`,
}

// Maps our size codes to Gemini imageConfig aspectRatio values
const SIZE_TO_ASPECT: Record<string, string> = {
  '4x5':    '4:5',
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',
}

async function tryGenerate(prompt: string, referenceBase64?: string, logoBase64?: string, timeoutMs = 100000, size = '4x5'): Promise<string> {
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

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Imagen API error: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const responseParts = data.candidates?.[0]?.content?.parts || []
    const imagePart = responseParts.find((p: any) => p.inlineData)
    if (!imagePart) throw new Error('No image in response')

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
  } catch (e: any) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('TIMEOUT')
    throw e
  }
}

async function withRetry(prompt: string, referenceBase64?: string, logoBase64?: string, maxAttempts = 3, size = '4x5'): Promise<string> {
  const retryableErrors = ['TIMEOUT', 'No image in response']

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await tryGenerate(prompt, referenceBase64, logoBase64, 100000, size)
    } catch (e: any) {
      const isRetryable = retryableErrors.includes(e.message)
      if (!isRetryable || attempt === maxAttempts) {
        if (e.message === 'TIMEOUT') {
          throw new Error('Image generation timed out. Gemini is under heavy load, please try again in a moment.')
        }
        throw e
      }
      console.log(`Gemini attempt ${attempt} failed (${e.message}), retrying...`)
    }
  }

  throw new Error('Image generation failed after all retries.')
}

// Always appended so Gemini never hallucinates logos or rewrites reference text.
const NO_LOGO_RULE = '\n\n[CRITICAL - LOGOS]: Do NOT generate, draw, or reproduce any logo, brand mark, icon badge, or watermark. If the reference image contains a logo, IGNORE it — do not include it. A logo will be provided separately as an explicit instruction if one is needed.'

const TEXT_FROM_REF_RULE = '\n\n[CRITICAL - TEXT]: If a reference image is provided, copy ALL visible text from it EXACTLY — same words, same spelling, same capitalisation, same punctuation, same line breaks. Do NOT rewrite, translate, expand, or invent any text. Visually you may re-style the text (font, color, size) to match the new composition, but the wording must be identical to the reference. Only change the wording if the generation prompt below explicitly requests it.'

// Per-size aspect ratio hints so Gemini composes natively at the right ratio.
// Without these, Gemini defaults to square/landscape and Sharp cover-crops heavily.
const SIZE_HINTS: Record<string, string> = {
  '4x5':    '\n\n[CRITICAL - OUTPUT FORMAT]: PORTRAIT image, taller than wide, aspect ratio 4:5 (4 wide by 5 tall, like a phone held vertically). Do not generate landscape or square. Compose the scene for a tall vertical frame.',
  '1x1':    '\n\n[CRITICAL - OUTPUT FORMAT]: SQUARE image, equal width and height, aspect ratio 1:1. Do not generate landscape or portrait. Compose the scene for a perfect square frame.',
  '9x16':   '\n\n[CRITICAL - OUTPUT FORMAT]: TALL PORTRAIT image, much taller than wide, aspect ratio 9:16 (9 wide by 16 tall, like a phone screen). Do not generate landscape or square. Compose the scene for a very tall vertical frame.',
  '1.91x1': '\n\n[CRITICAL - OUTPUT FORMAT]: LANDSCAPE image, wider than tall, aspect ratio 1.91:1 (almost 2 wide by 1 tall, like a cinema screen). Do not generate portrait or square. Compose the scene for a wide horizontal frame.',
}

export async function generateImage(prompt: string, referenceBase64?: string, logoBase64?: string, size = '4x5'): Promise<string> {
  const hint = SIZE_HINTS[size] || SIZE_HINTS['4x5']
  // Only add NO_LOGO_RULE when no logo is provided — otherwise it contradicts the logo placement instruction
  const logoRule = logoBase64 ? '' : NO_LOGO_RULE
  return withRetry(prompt + TEXT_FROM_REF_RULE + logoRule + hint, referenceBase64, logoBase64, 3, size)
}

export async function recomposeImage(imageBase64: string, targetSize: string): Promise<string> {
  const prompt = RECOMPOSE_PROMPTS[targetSize]
  if (!prompt) throw new Error(`Unknown target size: ${targetSize}`)
  return withRetry(prompt, imageBase64, undefined, 3, targetSize)
}
