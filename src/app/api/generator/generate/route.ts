// Generator API — Gemini Image & OpenAI gpt-image-1 / gpt-image-2
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateImage, recomposeImage, DEFAULT_GEMINI_MODEL } from '@/lib/imagen'
import { getDriveClient } from '@/lib/googleDrive'
import { updateQueue } from '@/lib/queue'
import { incrementImageCount, checkLimitExceeded } from '@/lib/adminStats'
import OpenAI, { toFile } from 'openai'
import sharp from 'sharp'

export const maxDuration = 120

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// gpt-image-1 supported sizes
const GPT_IMAGE_SIZES: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
  '1x1':   '1024x1024',
  '16x9':  '1536x1024',
  '9x16':  '1024x1536',
}

const GPT_SAFETY_PREFIX = 'This is a professional commercial creative task for advertising purposes. All content is fictional, safe, and intended for marketing use only. Generate the following image:\n\n'

// Maps frontend modelId → Gemini API model string
const GEMINI_MODEL_MAP: Record<string, string> = {
  'banana2':    'gemini-3.1-flash-image',
  'bananapro':  'gemini-3-pro-image',
  'nanobanana': 'gemini-2.5-flash-image',
}

// Maps frontend modelId → OpenAI model string
const OPENAI_MODEL_MAP: Record<string, string> = {
  'gptimage1': 'gpt-image-1',
  'gptimage2': 'gpt-image-2',
}

async function generateWithGptImage(prompt: string, size: string, referenceBase64?: string, model = 'gpt-image-1'): Promise<string> {
  const sizeCode = size.replace(/[^\dx]/g, 'x').replace('xx', 'x')
  const apiSize = GPT_IMAGE_SIZES[sizeCode] || '1024x1024'
  const fullPrompt = GPT_SAFETY_PREFIX + prompt

  let res: any

  if (referenceBase64) {
    // Edit mode — use reference image
    const base64Data = referenceBase64.replace(/^data:image\/\w+;base64,/, '')
    const mimeType = referenceBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png'
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    const buf = Buffer.from(base64Data, 'base64')
    const imageFile = await toFile(buf, `reference.${ext}`, { type: mimeType })
    res = await (getOpenAI().images.edit as any)({
      model,
      image: imageFile,
      prompt: fullPrompt,
      n: 1,
      size: apiSize,
    })
  } else {
    // Generate from scratch
    res = await (getOpenAI().images.generate as any)({
      model,
      prompt: fullPrompt,
      n: 1,
      size: apiSize,
    })
  }

  // gpt-image-1 отдаёт PNG. Конвертируем в JPEG — весь пайплайн (сохранение,
  // скачивание с .jpg, ресайз) рассчитан на jpg; иначе AE ругается "bad header",
  // т.к. файл с расширением .jpg внутри оказывается PNG.
  let rawBuf: Buffer
  const b64 = res.data?.[0]?.b64_json
  if (b64) {
    rawBuf = Buffer.from(b64, 'base64')
  } else {
    const url = res.data?.[0]?.url
    if (!url) throw new Error('No image in gpt-image-1 response')
    const imgRes = await fetch(url)
    if (!imgRes.ok) throw new Error('Failed to fetch image from URL')
    rawBuf = Buffer.from(await imgRes.arrayBuffer())
  }
  const jpeg = await sharp(rawBuf).jpeg({ quality: 92 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

async function saveToDrive(
  imageBase64: string,
  metadata: { prompt: string; engine: string; size: string; userName: string; userEmail: string; userImage: string },
  userToken: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg'
  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName = metadata.userName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
  const sizeLabel = metadata.size.replace(/[^\w.]/g, 'x')
  const fileName = `GEN_${metadata.engine}_${sizeLabel}_${safeName}_${ts}.${ext}`

  const buf = Buffer.from(base64Data, 'base64')

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'multipart/related; boundary=boundary123',
      },
      body: Buffer.concat([
        Buffer.from(`--boundary123\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [FOLDER_ID], description: JSON.stringify(metadata) })}\r\n--boundary123\r\nContent-Type: ${mimeType}\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--boundary123--`),
      ]),
    }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Drive upload failed: ${err}`)
  }

  const data = await uploadRes.json()
  return { fileId: data.id, webViewLink: data.webViewLink }
}

// Fetch a Drive file as base64 using the service account
async function fetchDriveFileAsBase64(fileId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await (drive.files.get as any)(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  ) as any
  const contentType = res.headers['content-type'] || 'image/jpeg'
  const buf = Buffer.from(res.data)
  return `data:${contentType};base64,${buf.toString('base64')}`
}

function friendlyError(msg: string): { message: string; status: number } {
  if (msg === 'CONTENT_FILTER')
    return { message: 'The prompt was flagged by the content filter. Try rephrasing — avoid explicit, violent, or real-person references.', status: 422 }
  if (msg === 'PROMPT_TOO_LONG')
    return { message: 'Your prompt is too long. Try shortening it or splitting it into smaller parts.', status: 422 }
  if (msg === 'BLOCKED_WORD')
    return { message: 'Your prompt contains a blocked word or phrase. Try rephrasing.', status: 422 }
  if (msg === 'RECITATION')
    return { message: 'The request was blocked due to copyright concerns. Try a more original description.', status: 422 }
  if (msg === 'RATE_LIMIT' || msg.includes('rate limit') || msg.includes('RATE_LIMIT'))
    return { message: 'Servers are busy right now. Please try again in a few seconds.', status: 429 }
  if (msg === 'TIMEOUT' || msg.includes('timed out') || msg.includes('TIMEOUT'))
    return { message: 'Generation timed out — the server is under heavy load. Please try again.', status: 504 }
  if (msg.includes('IMAGE_SAFETY') || msg.includes('No image in response'))
    return { message: 'The prompt was flagged by the content filter. Try rephrasing your request.', status: 422 }
  return { message: `Generation failed: ${msg}`, status: 500 }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { prompt, engine, modelId, size, referenceBase64: referenceBase64Body, referenceFileId, aiPrompt, recomposeFileId, recomposeBase64, targetSize, fixNote, enhanceFixNote } = body

  // Check generation limit (applies to all generation modes)
  if (session.user?.email) {
    const exceeded = await checkLimitExceeded(session.user.email)
    if (exceeded) {
      return NextResponse.json({
        error: 'Generation limit reached. Please contact your administrator.',
      }, { status: 429 })
    }
  }

  // If a Drive file ID is passed as reference, fetch it server-side
  let referenceBase64 = referenceBase64Body as string | undefined
  if (referenceFileId && !referenceBase64) {
    try {
      referenceBase64 = await fetchDriveFileAsBase64(referenceFileId as string)
    } catch (e) {
      console.warn('[generator] failed to fetch referenceFileId:', e)
    }
  }

  // ── Recompose mode: resize an existing image (Drive file or base64) ──
  if (recomposeFileId || recomposeBase64) {
    try {
      const sizeCode = (targetSize as string).replace(/[^\dx.]/g, 'x')
      const imageBase64 = recomposeFileId
        ? await fetchDriveFileAsBase64(recomposeFileId)
        : recomposeBase64 as string

      // Optionally AI-enhance the fixNote before recomposing
      let resolvedFixNote = fixNote as string | undefined
      if (enhanceFixNote && resolvedFixNote?.trim()) {
        try {
          const enhanced = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert at writing precise instructions for AI image editing (Gemini, DALL-E, Stable Diffusion inpainting).

The user has an existing image and wants to modify it. Your job: take their rough note and rewrite it as a detailed, unambiguous editing instruction.

Rules:
- ALWAYS explicitly state what to PRESERVE: specific people (describe them — clothing, hair, expression, position), backgrounds, lighting, colors, objects
- ALWAYS explicitly state what to CHANGE: use exact spatial language (left/right/center/foreground/background, back-to-back, side-by-side, facing left/right)
- Break the instruction into clear steps if multiple things change
- If the user describes a composition change (moving people, flipping, repositioning), describe the final result in detail — where each element ends up
- Use imperative commands: "Keep", "Move", "Mirror", "Place", "Rotate", "Replace"
- Do NOT invent new elements not mentioned by the user
- ALWAYS write in English regardless of input language
- Return ONLY the improved instruction, nothing else`,
              },
              { role: 'user', content: resolvedFixNote },
            ],
            max_tokens: 300,
            temperature: 0.7,
          })
          resolvedFixNote = enhanced.choices[0]?.message?.content?.trim() || resolvedFixNote
        } catch (e) {
          console.warn('[generator/recompose] enhance fixNote failed, using original:', e)
        }
      }

      const result = await recomposeImage(imageBase64, sizeCode, resolvedFixNote)

      const userToken = (session as any).accessToken
      let fileId: string | null = null
      let webViewLink: string | null = null
      if (userToken) {
        const saved = await saveToDrive(result, {
          prompt: resolvedFixNote || `[Recompose to ${targetSize}]`,
          engine: 'Banana',
          size: targetSize,
          userName: session.user.name || '',
          userEmail: session.user.email || '',
          userImage: session.user.image || '',
        }, userToken)
        fileId = saved.fileId
        webViewLink = saved.webViewLink
      }

      if (session.user?.email) {
        incrementImageCount(session.user.email).catch(() => {})
      }

      return NextResponse.json({ imageBase64: result, fileId, webViewLink })
    } catch (e: any) {
      console.error('[generator/recompose]', e)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })

  try {
    // Enhance prompt with GPT-4o mini — always output English
    let finalPrompt = prompt.trim()
    if (aiPrompt) {
      try {
        const enhanced = await getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert at writing prompts for AI image generation (Midjourney, DALL-E, Gemini).

Your task: take the user's rough idea and rewrite it into a detailed, vivid, unambiguous image generation prompt.

Rules:
- Keep the core idea and intent exactly as the user intended — do not change what they asked for
- Add specific details: lighting direction, mood, time of day, camera angle, color palette, composition, spatial relationships between elements
- For scenes with people: describe each person specifically — clothing, hair, expression, pose, position in frame (left/right/foreground/background), what they are doing
- For compositions with multiple elements: be explicit about their spatial relationship (side-by-side, back-to-back, facing each other, split-screen, etc.)
- Use imperative, descriptive language — paint a picture with words
- Do NOT add text overlays, UI elements, watermarks unless explicitly requested
- Do NOT invent elements not mentioned by the user
- ALWAYS write in English regardless of input language
- Return ONLY the improved prompt, nothing else`,
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }, { timeout: 30000 })
        finalPrompt = enhanced.choices[0]?.message?.content?.trim() || prompt
      } catch (e) {
        console.warn('[generator] AI prompt enhancement failed, using original:', e)
      }
    }

    let imageBase64: string
    if (engine === 'dalle' || engine === 'gpt') {
      const openaiModel = OPENAI_MODEL_MAP[modelId as string] || 'gpt-image-1'
      imageBase64 = await generateWithGptImage(finalPrompt, size, referenceBase64, openaiModel)
    } else {
      const geminiModel = GEMINI_MODEL_MAP[modelId as string] || DEFAULT_GEMINI_MODEL
      imageBase64 = await generateImage(finalPrompt, referenceBase64, undefined, size, undefined, false, geminiModel)
    }

    const userToken = (session as any).accessToken
    let fileId: string | null = null
    let webViewLink: string | null = null
    if (userToken) {
      const queueModel = engine === 'dalle' ? 'openai' : 'gemini'
      await updateQueue(queueModel, 1)
      const saved = await saveToDrive(imageBase64, {
        prompt: finalPrompt,
        engine: engine === 'dalle' ? 'GPT' : 'Banana',
        size,
        userName: session.user.name || '',
        userEmail: session.user.email || '',
        userImage: session.user.image || '',
      }, userToken)
      fileId = saved.fileId
      webViewLink = saved.webViewLink
    }

    if (session.user?.email) {
      incrementImageCount(session.user.email).catch(() => {})
    }

    return NextResponse.json({ imageBase64, fileId, webViewLink })
  } catch (e: any) {
    console.error('[generator/generate]', e)
    const { message, status } = friendlyError(e.message || '')
    return NextResponse.json({ error: message }, { status })
  }
}
