import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generatePrompt } from '@/lib/openai'
import { generateImage } from '@/lib/imagen'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // Проверяем авторизацию
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { projectId, brief, comment, referenceBase64, customPrompt } = body

    let finalPrompt = customPrompt

    // Если нет кастомного промпта — генерим через GPT-4o
    if (!finalPrompt) {
      finalPrompt = await generatePrompt({
        brief,
        comment,
        referenceBase64,
      })
    }

    // Генерим изображение через Imagen 3
    const imageBase64 = await generateImage(finalPrompt)

    // Сохраняем промпт в проект
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { prompt: finalPrompt },
      })
    }

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
