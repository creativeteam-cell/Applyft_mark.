import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, referenceBase64, assets } = await req.json() as {
    prompt: string
    referenceBase64?: string
    assets?: { name: string; base64: string }[]
  }

  const content: OpenAI.Chat.ChatCompletionContentPart[] = []

  // Add reference image first
  if (referenceBase64) {
    const url = referenceBase64.startsWith('data:') ? referenceBase64 : `data:image/jpeg;base64,${referenceBase64}`
    content.push({ type: 'text', text: '[REFERENCE IMAGE — the base image to edit/extend:]' })
    content.push({ type: 'image_url', image_url: { url, detail: 'high' } })
  }

  // Add assets
  if (assets && assets.length > 0) {
    for (const asset of assets) {
      const url = asset.base64.startsWith('data:') ? asset.base64 : `data:image/jpeg;base64,${asset.base64}`
      content.push({ type: 'text', text: `[ASSET @${asset.name}:]` })
      content.push({ type: 'image_url', image_url: { url, detail: 'high' } })
    }
  }

  // Add the prompt
  content.push({
    type: 'text',
    text: `[USER PROMPT]:
${prompt || '(no prompt — user wants to replace a person/element with the asset)'}

Your task: rewrite this into a precise, detailed image generation prompt for Gemini Image AI.

Rules:
- Write in English
- Be very specific about what to KEEP unchanged (text banners, logos, backgrounds, top/bottom bars)
- Be very specific about what to CHANGE (only the person/element the user wants to replace)
- If assets are provided, describe how to use them by referencing @name
- Use spatial language: "top banner", "bottom bar", "center of the image", "foreground", etc.
- Include explicit instructions to NOT modify any text overlays, banners, or UI elements unless the user asked for it
- Keep it under 300 words
- Return ONLY the improved prompt, no explanations`,
  })

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 600,
      temperature: 0.4,
    }, { timeout: 25000 })

    const enhanced = res.choices[0]?.message?.content?.trim() || prompt
    return NextResponse.json({ enhanced })
  } catch (e: any) {
    console.error('[enhance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
