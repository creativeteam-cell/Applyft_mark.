import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateImage } from '@/lib/imagen'
import { getDriveClient } from '@/lib/googleDrive'
import OpenAI from 'openai'
import { Readable } from 'stream'

export const maxDuration = 120

const FOLDER_ID = process.env.GENERATOR_DRIVE_FOLDER_ID!

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const DALLE_SIZES: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
  '1×1':   '1024x1024',
  '16×9':  '1792x1024',
  '9×16':  '1024x1792',
}

async function generateWithDalle(prompt: string): Promise<string> {
  const res = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
  })
  const url = res.data?.[0]?.url
  if (!url) throw new Error('No image URL in DALL-E response')
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error('Failed to fetch DALL-E image')
  const buf = await imgRes.arrayBuffer()
  return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
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
  const fileName = `GEN_${metadata.engine}_${metadata.size.replace('×', 'x')}_${safeName}_${ts}.${ext}`

  const buf = Buffer.from(base64Data, 'base64')

  // Use user OAuth token for upload
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, engine, size, referenceBase64, aiPrompt } = await req.json()
  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })

  try {
    // Enhance prompt with GPT-4o mini if AI prompt is enabled
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
        // fallback to original prompt
      }
    }

    let imageBase64: string

    if (engine === 'dalle') {
      imageBase64 = await generateWithDalle(finalPrompt)
    } else {
      const sizeMap: Record<string, string> = { '4×5': '4x5', '1×1': '1x1', '9×16': '9x16', '1.91×1': '1.91x1' }
      const sizeCode = sizeMap[size] || '4x5'
      try {
        imageBase64 = await generateImage(finalPrompt, referenceBase64, undefined, sizeCode, undefined, true)
      } catch (genErr: any) {
        console.error('[generator] generateImage failed:', genErr.message)
        const msg = genErr.message || 'Unknown error'
        if (msg.includes('finishReason') || msg.includes('No image in response')) return NextResponse.json({ error: `Gemini blocked the request (content filter). Try rephrasing the prompt. Details: ${msg}` }, { status: 422 })
        if (msg.includes('RATE_LIMIT') || msg.includes('rate limit')) return NextResponse.json({ error: 'Gemini is busy, please try again in a moment.' }, { status: 429 })
        if (msg.includes('TIMEOUT') || msg.includes('timed out')) return NextResponse.json({ error: 'Generation timed out. Please try again.' }, { status: 504 })
        return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 })
      }
    }

    // Save to Drive if user token available
    const userToken = (session as any).accessToken
    let fileId: string | null = null
    let webViewLink: string | null = null

    if (userToken) {
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

    return NextResponse.json({ imageBase64, fileId, webViewLink })
  } catch (e: any) {
    console.error('[generator/generate]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
