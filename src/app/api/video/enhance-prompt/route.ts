import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, mode, model, aspectRatio, duration, images, shots } = await req.json()
  const isMultishot = mode === 'multishot' && Array.isArray(shots) && shots.length > 0
  if (!prompt?.trim() && !isMultishot) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const hasImages = Array.isArray(images) && images.length > 0

  try {
    if (isMultishot) {
      const totalDuration = shots.reduce((s: number, sh: any) => s + sh.duration, 0)
      const shotList = shots.map((s: any, i: number) => `Shot ${i + 1} (${s.duration}s)`).join(', ')

      const system = [
        'You are a professional Hollywood cinematographer and video director writing prompts for AI video generation (Kling AI).',
        `Total video: ${totalDuration} seconds across ${shots.length} shots: ${shotList}.`,
        '',
        'Your job: take the user\'s rough concept and write a CINEMATIC prompt for EACH shot like a real film production.',
        '',
        'CRITICAL RULES — CAMERA & ANGLES:',
        '- Each shot MUST have a different, specific camera angle/position. Never repeat the same angle twice.',
        '- Vary between: wide establishing shot, medium shot, close-up, extreme close-up, POV (point-of-view from a character or object), over-the-shoulder, low angle, high angle, bird\'s eye, tracking shot, handheld, dolly, crane, etc.',
        '- If the scene has action or movement, use angles that CREATE DRAMA — not just "camera follows the character".',
        '- For key moments: use POV from unexpected objects (car interior, fence, wall) or reaction shots.',
        '',
        'PROMPT RULES:',
        '- Start EVERY prompt with the camera/angle description: e.g. "Low-angle tracking shot —", "POV from inside the car cabin —", "Extreme close-up —"',
        '- Be 1-3 sentences. Be specific: lighting, motion, emotion, texture.',
        '- Proportional to shot duration (longer = more detail/action)',
        '- Write in present tense, cinematic style',
        '- Each shot must flow logically from the previous but feel visually distinct',
        '',
        'Return ONLY a JSON array of strings, one per shot, in order. No markdown, no explanation.',
        'Example: ["Low-angle wide shot — a man bursts through a door, silhouetted against harsh backlight, debris flying.", "Extreme close-up — his eyes dart left and right, sweat on his brow, breath fogging the cold air.", "POV from inside a moving car — the street rushes past, then suddenly a figure leaps onto the hood, the windshield filling with his face."]',
      ].join('\n')

      const userContent: any = hasImages
        ? [
            { type: 'text', text: `Video concept: ${prompt}` },
            ...images.map((img: string) => ({
              type: 'image_url',
              image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`, detail: 'low' },
            })),
          ]
        : `Video concept: ${prompt}`

      const res = await openai.chat.completions.create({
        model: hasImages ? 'gpt-4o' : 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        max_tokens: 800,
        temperature: 0.75,
      })

      let raw = res.choices[0]?.message?.content?.trim() || '[]'
      // Strip markdown code fences if GPT wraps the JSON
      if (raw.startsWith('`')) raw = raw.replace(/^[`]{1,3}(?:json)?\s*\n?/, '').replace(/\n?[`]{1,3}\s*$/, '')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('GPT returned non-array response')
      return NextResponse.json({ shots: parsed })
    }

    // Standard mode: plain text prompt
    const modelLabel = model || 'Kling AI'
    const arLine = `Aspect ratio: ${aspectRatio || '16:9'}, Duration: ~${duration || 5} seconds`
    const imgLine = hasImages ? '- You can see the reference image(s). Describe characters/objects based on what you see.' : ''

    const system = [
      `You are an expert video director specializing in ${modelLabel} AI video generation.`,
      "Rewrite the user's rough idea as a polished, professional video generation prompt.",
      '',
      'Rules:',
      '- Return ONLY the improved prompt text -- no JSON, no markdown, no explanation',
      '- Write in present tense, cinematic style',
      '- Be specific: lighting, camera angle/movement, character actions, atmosphere, color tone',
      '- Keep it under 300 words',
      `- ${arLine}`,
      imgLine,
    ].filter(Boolean).join('\n')

    const userContent: any = hasImages
      ? [
          { type: 'text', text: prompt },
          ...images.map((img: string) => ({
            type: 'image_url',
            image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`, detail: 'low' },
          })),
        ]
      : prompt

    const res = await openai.chat.completions.create({
      model: hasImages ? 'gpt-4o' : 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      max_tokens: 500,
      temperature: 0.7,
    })

    const improved = res.choices[0]?.message?.content?.trim() || prompt
    return NextResponse.json({ prompt: improved })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
