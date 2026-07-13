import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { generatePrompt } from '@/lib/openai'
import { generateImage, recomposeImage, DEFAULT_GEMINI_MODEL } from '@/lib/imagen'
import { getConfig } from '@/lib/appsStore'
import { updateQueue } from '@/lib/queue'

export const maxDuration = 210

// QA-проверка зон для 9x16 после рекомпозиции (экстенда).
// Верхние 15% и нижние 40% — сейф-зоны платформ (Stories/Reels/TikTok UI),
// текст/CTA/логотипы там запрещены. При нарушении вернёт fix-инструкцию для ретрая.
async function qaVerify9x16(imageBase64: string): Promise<{ ok: boolean; fix: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const url = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
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
            text: `You are a strict layout QA checker for 9:16 (1080x1920) mobile ad creatives.

SAFE ZONES (platform UI overlays):
- TOP 15% of the image (0-288px): must contain ONLY background — no text, headlines, logos, CTA buttons, or UI elements
- BOTTOM 40% of the image (1152-1920px): must contain ONLY background/scenery — no text, CTA, logos, or UI elements

Check the image and respond ONLY with raw JSON (no markdown):
- If layout is correct: {"status":"ok","fix_prompt":""}
- If violated: {"status":"fail","fix_prompt":"<specific instruction: which element to move and where, e.g. 'Move the app logo down so it starts below the top 15% of the frame; move the CHECK NOW button up so it sits above the bottom 40%'>"}

Be tolerant of purely decorative background elements (light rays, patterns) — only flag text, logos, buttons, icons and UI.`,
          },
        ],
      }],
      max_tokens: 300,
    }, { timeout: 45000 })
    const raw = res.choices[0]?.message?.content?.trim() || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
    return { ok: parsed.status === 'ok', fix: parsed.fix_prompt || '' }
  } catch {
    // QA недоступен — не блокируем результат
    return { ok: true, fix: '' }
  } finally {
    await updateQueue('openai', -1)
  }
}

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
      logoBase64,
      assets,
    } = body

    // Режим рекомпозиции
    if (recomposeBase64 && targetSize) {
      await updateQueue('gemini', 1)
      try {
        let imageBase64 = await recomposeImage(recomposeBase64, targetSize, fixNote)

        // 9x16: автопроверка сейф-зон + до 2 ретраев с конкретной fix-инструкцией.
        // Пропускаем, когда СП сам прислал fixNote — его правка приоритетнее автоQA.
        if (targetSize === '9x16' && !fixNote) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            const qa = await qaVerify9x16(imageBase64)
            if (qa.ok) break
            console.log(`[recompose-qa] 9x16 attempt ${attempt} fail: ${qa.fix}`)
            try {
              imageBase64 = await recomposeImage(imageBase64, targetSize, qa.fix)
            } catch (e: any) {
              console.warn('[recompose-qa] retry failed:', e.message)
              break
            }
          }
        }

        return NextResponse.json({ imageBase64 })
      } finally {
        await updateQueue('gemini', -1)
      }
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
        await updateQueue('openai', 1)
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
        } finally {
          await updateQueue('openai', -1)
        }
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

    // Логотип — передаём Gemini если юзер выбрал
    let finalPromptWithLogo = finalPrompt
    if (logoBase64) {
      const logoPositionRule = fixNote
        ? `Maintain the logo position from the previous image UNLESS the fix instruction explicitly requests moving it — in that case follow the fix instruction for logo placement.`
        : `Place it in the top-left corner of the ad. (4) Place it on a clean background area with enough contrast to be readable.`
      finalPromptWithLogo = finalPrompt + `\n\nLOGO PLACEMENT — CRITICAL: The last image provided is the app logo. You MUST reproduce it exactly as-is. Rules: (1) Copy every detail — icon, wordmark, text, colors, proportions — pixel-perfectly. Do NOT simplify, redraw, or omit any part including any text in the logo. (2) Size: approximately 15% of the image width. (3) Do not let it overlap headlines, subheadlines, or CTA buttons. (4) ${logoPositionRule}`
    }

    await updateQueue('gemini', 1)
    let imageBase64: string
    try {
      imageBase64 = await generateImage(
        finalPromptWithLogo,
        imageReference,
        logoBase64 || undefined,
        targetSize || '4x5',
        assets || undefined,
        false,
        DEFAULT_GEMINI_MODEL,
        !!fixNote
      )
    } finally {
      await updateQueue('gemini', -1)
    }

    return NextResponse.json({ prompt: finalPrompt, imageBase64 })

  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 })
  }
}
