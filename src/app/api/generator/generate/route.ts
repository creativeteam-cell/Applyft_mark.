// Generator API — Gemini Image & OpenAI gpt-image-1
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateImage, recomposeImage } from '@/lib/imagen'
import { getDriveClient } from '@/lib/googleDrive'
import { updateQueue } from '@/lib/queue'
import { incrementImageCount, checkLimitExceeded } from '@/lib/adminStats'
import OpenAI, { toFile } from 'openai'

export const maxDuration = 120

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
    res = await (openai.images.edit as any)({
      model,
      image: imageFile,
      prompt: fullPrompt,
      n: 1,
      size: apiSize,
    })
  } else {
    // Generate from scratch
    res = await (openai.images.generate as any)({
      model,
      prompt: fullPrompt,
      n: 1,
      size: apiSize,
    })
  }

  const b64 = res.data?.[0]?.b64_json
  if (b64) return `data:image/png;base64,${b64}`
  const url = res.data?.[0]?.url
  if (!url) throw new Error('No image in gpt-image-1 response')
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error('Failed to fetch image from URL')
  const buf2 = await imgRes.arrayBuffer()
  return `data:image/png;base64,${Buffer.from(buf2).toString('base64')}`
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
  const { prompt, engine, modelId, size, referenceBase64: referenceBase64Body, referenceFileId, aiPrompt, recomposeFileId, recomposeBase64, targetSize } = body

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
      const result = await recomposeImage(imageBase64, sizeCode)

      const userToken = (session as any).accessToken
      let fileId: string | null = null
      let webViewLink: string | null = null
      if (userToken) {
        const saved = await saveToDrive(result, {
          prompt: `[Recompose to ${targetSize}]`,
          engine: 'Banana',
          size: targetSize,
          userName: session.user.name || '',
          userEmail: session.user.email || '',
          userImage: session.user.image || '',
        }, userToken)
        fileId = saved.fileId
        webViewLink = saved.webViewLink
      }

      return NextResponse.json({ imageBase64: result, fileId, webViewLink })
    } catch (e: any) {
      console.error('[generator/recompose]', e)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // Check generation limit
  if (session.user?.email) {
    const exceeded = await checkLimitExceeded(session.user.email)
    if (exceeded) {
      return NextResponse.json({
        error: 'Generation limit reached. Please contact your administrator.',
      }, { status: 429 })
    }
  }

  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })

  try {
    // Enhance prompt with GPT-4o mini — always output English
    let finalPrompt = prompt.trim()
    if (aiPrompt) {
      try {
        const enhanced = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert at writing prompts for AI image generation (Midjourney, DALL-E, Gemini).
Your task: take the user's rough idea and rewrite it into a detailed, vivid image generation prompt.
Rules:
- Keep the core idea and intent exactly as the user intended
- Add specific details: lighting, style, mood, camera angle, colors, composition
- Use concise descriptive language (no full sentences needed)
- Do NOT add any text overlays, captions, or UI elements unless explicitly requested
- ALWAYS write the output prompt in English, regardless of the input language
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
    const queueModel = engine === 'dalle' ? 'openai' : 'gemini'
    await updateQueue(queueModel, 1)

    try {
      if (engine === 'dalle') {
        const openaiModel = OPENAI_MODEL_MAP[modelId as string] || 'gpt-image-1'
        imageBase64 = await generateWithGptImage(finalPrompt, size, referenceBase64, openaiModel)
      } else {
        const sizeMap: Record<string, string> = {
          '4x5': '4x5', '1x1': '1x1', '9x16': '9x16', '1.91x1': '1.91x1',
        }
        const sizeKey = (size as string).replace(/[^\dx.]/g, 'x')
        const sizeCode = sizeMap[sizeKey] || '4x5'
        const geminiModel = GEMINI_MODEL_MAP[modelId as string] || 'gemini-3.1-flash-image-preview'
        try {
          imageBase64 = await generateImage(finalPrompt, referenceBase64, undefined, sizeCode, undefined, true, geminiModel)
        } catch (genErr: any) {
          console.error('[generator] generateImage failed:', genErr.message)
          const msg = genErr.message || 'Unknown error'
          const { message, status } = friendlyError(msg)
          return NextResponse.json({ error: message }, { status })
        }
      }
    } finally {
      await updateQueue(queueModel, -1)
    }

    const userToken = (session as any).accessToken
    let webViewLink: string | null = null
    try {
      const saved = await saveToDrive(imageBase64, {
        prompt: finalPrompt,
        engine: engine === 'dalle' ? 'GPT' : 'Gemini',
        size: (size as string) || '4x5',
        userName: session.user?.name || '',
        userEmail: session.user?.email || '',
        userImage: session.user?.image || '',
      }, userToken)
      webViewLink = saved.webViewLink
    } catch (driveErr: any) {
      console.warn('[generator] Drive save failed:', driveErr.message)
    }

    // Increment persistent generation counter
    if (session.user?.email) {
      incrementImageCount(session.user.email).catch(() => {})
    }

    return NextResponse.json({ success: true, webViewLink })
  } catch (e: any) {
    console.error('[generator/generate]', e)
    const { message, status } = friendlyError(e.message || '')
    return NextResponse.json({ error: message }, { status })
  }
}
