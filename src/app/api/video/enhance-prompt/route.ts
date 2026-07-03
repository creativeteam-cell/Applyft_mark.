import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, aspectRatio, duration } = await req.json()
  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const system = `You are an expert video director and AI prompt engineer. 
Convert the user's rough video idea into a professional JSON prompt for AI video generation.

Return ONLY valid JSON (no markdown, no code blocks) with this structure:
{
  "title": "Short descriptive title",
  "style": "Visual style: realism, lighting, camera feel, color grade",
  "location": "Where the scene takes place, environment details",
  "camera": {
    "shot": "Shot type (close-up, medium, wide, etc.)",
    "angle": "Camera angle",
    "movement": "Camera movement description",
    "aspect_ratio": "${aspectRatio || '16:9'}"
  },
  "characters": [
    {
      "name": "Character name or role",
      "appearance": "Physical description, clothing",
      "performance": "Acting direction, emotion, movement"
    }
  ],
  "audio": {
    "voices": "Voice description if any dialogue/sound",
    "background": "Ambient sound, music mood"
  },
  "action": "Main action happening in the video, ~${duration || 5} seconds",
  "ending": {
    "shot": "How the clip ends",
    "camera": "Final camera note"
  }
}

Rules:
- Keep it cinematic and specific
- If no characters, use empty array []
- Tailor all details to a ${duration || 5}-second video clip
- Aspect ratio is ${aspectRatio || '16:9'}`

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    })
    const json = res.choices[0]?.message?.content?.trim() || ''
    // Validate it's parseable JSON
    JSON.parse(json)
    return NextResponse.json({ prompt: json })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
