import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import sharp from 'sharp'
import { updateQueue } from '@/lib/queue'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function shrinkImage(dataUrl: string): Promise<string> {
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buf = Buffer.from(base64Data, 'base64')
    const out = await sharp(buf)
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return dataUrl
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64 } = await req.json() as { imageBase64: string }
  if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const url = await shrinkImage(
    imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
  )

  await updateQueue('openai', 1)
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url, detail: 'high' } },
          {
            type: 'text',
            text: `You are an expert image-to-prompt converter for AI image generation (Gemini, Midjourney, DALL-E).

Analyze this image in extreme detail and write a generation prompt that would allow recreating it as close to 1:1 as possible.

Cover ALL of the following:

PEOPLE (if present):
- Approximate age, gender, ethnicity
- Facial expression and emotion
- Pose, body position, hand placement
- Clothing: exact colors, style, fabric texture, fit
- Hair: color, length, style, texture
- Accessories, jewelry, makeup

SCENE & ENVIRONMENT:
- Location/setting (interior/exterior, specific place type)
- Time of day, lighting conditions (natural/artificial, direction, intensity, shadows)
- Background elements in detail
- Depth of field, bokeh

COMPOSITION:
- Camera angle (eye level, low angle, bird's eye, etc.)
- Shot type (close-up, medium shot, wide shot, etc.)
- Subject placement (centered, rule of thirds, etc.)

COLORS & STYLE:
- Overall color palette (dominant colors, accent colors)
- Color temperature (warm/cool/neutral)
- Visual style (photorealistic, cinematic, documentary, etc.)
- Film grain, noise level, post-processing style

TEXT & UI ELEMENTS (if visible):
- Copy every text element EXACTLY word for word
- Position and styling of text

MOOD & ATMOSPHERE:
- Overall feeling/emotion conveyed
- Story being told

Write the prompt in English, in a single dense paragraph or structured list. Be extremely specific — use exact measurements, colors (hex or descriptive), specific adjectives. The goal is a prompt so precise that the output is nearly identical to this image.`,
          },
        ],
      }],
      max_tokens: 1000,
      temperature: 0.2,
    }, { timeout: 55000 })

    const description = res.choices[0]?.message?.content?.trim() || ''
    return NextResponse.json({ description })
  } finally {
    await updateQueue('openai', -1)
  }
}
