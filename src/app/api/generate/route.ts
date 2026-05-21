import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generatePrompt } from '@/lib/openai'
import { generateImage } from '@/lib/imagen'
import { getConfig } from '@/lib/appsStore'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { appCode, selectedPain, userText, referenceBase64, fixNote, customPrompt } = body

    let finalPrompt = customPrompt

    if (!finalPrompt) {
      // Получаем инфо о приложении из конфига
      let appInfo
      if (appCode) {
        const config = await getConfig()
        const app = config.apps.find(a => a.code === appCode)
        if (app) {
          appInfo = {
            code: app.code,
            name: app.name,
            description: app.description,
            painPoints: app.painPoints,
          }
        }
      }

      // Генерим промпт через GPT
      try {
        finalPrompt = await generatePrompt({
          appInfo,
          selectedPain,
          userText,
          referenceBase64,
          fixNote,
        })
      } catch (e: any) {
        if (e.message === 'NOT_ENOUGH_DATA') {
          return NextResponse.json(
            { error: 'Please add a description, pain point, or reference image to generate a creative.' },
            { status: 400 }
          )
        }
        throw e
      }
    }

    // Генерим изображение через Gemini
    const imageBase64 = await generateImage(finalPrompt)

    return NextResponse.json({
      prompt: finalPrompt,
      imageBase64,
    })

  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json(
      { error: error.message || 'Generation failed' },
      { status: 500 }
    )
  }
}
