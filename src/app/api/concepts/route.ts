import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConfig, saveConfig, getNextEmoji, CreativeConcept } from '@/lib/appsStore'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// GET — получить концепты для апки
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  if (!appCode) return NextResponse.json({ error: 'Missing app' }, { status: 400 })

  const config = await getConfig()
  return NextResponse.json(config.concepts[appCode] || [])
}

// POST — загрузить картинку и создать концепт
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { appCode, imageBase64 } = body

  if (!appCode || !imageBase64) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  try {
    // GPT Vision анализирует картинку и извлекает концепт
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an advertising creative strategist. 
Analyze this ad creative and extract the CREATIVE CONCEPT — the idea, approach, and strategy behind it.
Focus on: the emotional hook, the visual storytelling technique, the composition approach.
Do NOT describe what you see literally. Extract the TRANSFERABLE IDEA that could inspire a new original creative.
Write 2-3 sentences max. Be specific and actionable.
Example output: "Uses extreme close-up of a body part associated with the pain point, with bold provocative text overlay that speaks directly to the viewer's insecurity. The contrast between vulnerability and empowerment creates emotional tension."
Return ONLY the concept description, nothing else.`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageBase64 } },
            { type: 'text', text: 'Extract the creative concept from this ad.' },
          ],
        },
      ],
      max_tokens: 200,
    })

    const concept = response.choices[0].message.content || ''

    // Сохраняем в конфиг
    const config = await getConfig()
    if (!config.concepts[appCode]) config.concepts[appCode] = []

    const existingConcepts = config.concepts[appCode]
    const emoji = getNextEmoji(existingConcepts)

    const newConcept: CreativeConcept = {
      id: Date.now().toString(),
      emoji,
      concept,
      createdAt: new Date().toISOString(),
    }

    config.concepts[appCode].push(newConcept)
    await saveConfig(config)

    return NextResponse.json(newConcept)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — удалить концепт
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  const conceptId = searchParams.get('id')

  const config = await getConfig()
  if (config.concepts[appCode!]) {
    config.concepts[appCode!] = config.concepts[appCode!].filter(c => c.id !== conceptId)
  }
  await saveConfig(config)

  return NextResponse.json({ success: true })
}
