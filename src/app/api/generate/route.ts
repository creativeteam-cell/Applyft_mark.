import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generatePrompt } from '@/lib/openai'
import { generateImage, recomposeImage } from '@/lib/imagen'
import { getConfig } from '@/lib/appsStore'

export const maxDuration = 210

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      appCode,
      selectedPain,
      selectedHook,
      selectedConceptId,
      userText,
      referenceBase64,
      competitorBase64,
      fixNote,
      previousImageBase64,
      customPrompt,
      recomposeBase64,
      targetSize,
    } = body

    // Режим рекомпозиции
    if (recomposeBase64 && targetSize) {
      const imageBase64 = await recomposeImage(recomposeBase64, targetSize)
      return NextResponse.json({ imageBase64 })
    }

    let finalPrompt = customPrompt

    if (!finalPrompt) {
      const config = await getConfig()
      let appInfo
      let selectedConceptText: string | undefined

      if (appCode) {
        const app = config.apps.find(a => a.code === appCode)
        if (app) {
          appInfo = {
            code: app.code,
            name: app.name,
            description: app.description,
            painPoints: app.painPoints,
            logoBase64: app.logoBase64,
          }
        }

        const concepts = config.concepts?.[appCode] || []
        if (concepts.length > 0) {
          if (selectedConceptId && selectedConceptId !== 'none') {
            const found = concepts.find(c => c.id === selectedConceptId)
            if (found) selectedConceptText = found.concept
          } else {
            const random = concepts[Math.floor(Math.random() * concepts.length)]
            selectedConceptText = random.concept
          }
        }
      }

      try {
        finalPrompt = await generatePrompt({
          appInfo,
          selectedPain: selectedPain !== 'none' ? selectedPain : undefined,
          selectedHook: selectedHook && selectedHook !== 'none' ? selectedHook : undefined,
          selectedConcept: selectedConceptText,
          userText,
          referenceBase64,

          fixNote,
          previousImageBase64,
        })
      } catch (e: any) {
        if (e.message === 'NOT_ENOUGH_DATA') {
          return NextResponse.json(
            { error: 'Please add a description, select a pain point, or upload a reference image.' },
            { status: 400 }
          )
        }
        throw e
      }
    }

    // При fix-режиме передаём предыдущее изображение в Gemini как референс
    const imageReference = previousImageBase64 || referenceBase64 || undefined

    const imageBase64 = await generateImage(
      finalPrompt,
      imageReference
    )

    return NextResponse.json({ prompt: finalPrompt, imageBase64 })

  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 })
  }
}
