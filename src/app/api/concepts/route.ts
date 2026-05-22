import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConfig, saveConfig, getNextEmoji, CreativeConcept } from '@/lib/appsStore'
import { analyzeConcept } from '@/lib/openai'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  if (!appCode) return NextResponse.json({ error: 'Missing app' }, { status: 400 })

  const config = await getConfig()
  return NextResponse.json(config.concepts[appCode] || [])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { appCode, imageBase64 } = body

  if (!appCode || !imageBase64) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  try {
    const concept = await analyzeConcept(imageBase64)

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
