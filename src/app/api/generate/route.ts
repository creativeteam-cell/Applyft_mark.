import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import sharp from 'sharp'
import { generatePrompt } from '@/lib/openai'
import { generateImage, recomposeImage, DEFAULT_GEMINI_MODEL } from '@/lib/imagen'
import { getConfig } from '@/lib/appsStore'
import { updateQueue } from '@/lib/queue'
import { getRulesCached, selectRulesForPrompt, buildRulesPromptBlock } from '@/lib/rulesStore'
import { learnFromFix } from '@/lib/ruleLearner'

export const maxDuration = 210

// Подготовка подложки для 9x16-экстенда: оригинал размещается на полном холсте
// 1080x1920, верх/низ заполняются зеркальным отражением краёв + блюром. Gemini
// получает задачу "доработать размытые зоны", а не "дорисовать сверху/снизу" —
// переход изначально плавный, и характерные горизонтальные швы не возникают.
interface PadResult {
  padded: string     // холст 1080x1920 с растушёванным оригиналом — вход для Gemini
  overlay: Buffer    // растушёванный оригинал (PNG с альфой) — для обратной вклейки
  top: number        // смещение оригинала на холсте
}

async function padTo916(imageBase64: string): Promise<PadResult | null> {
  try {
    const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const W = 1080, H = 1920
    const resized = await sharp(buf).resize(W, null, { withoutEnlargement: false }).toBuffer()
    const meta = await sharp(resized).metadata()
    const h0 = meta.height || 0
    if (!h0 || h0 >= H) return null // источник уже выше 9:16 — обычный путь

    // Больше места снизу (под "мёртвую зону" платформ), меньше сверху
    const top = Math.round((H - h0) * 0.35)
    const bottom = H - h0 - top

    const mirrored = await sharp(resized)
      .extend({ top, bottom, left: 0, right: 0, extendWith: 'mirror' })
      .toBuffer()
    const blurred = await sharp(mirrored).blur(30).toBuffer()

    // Растушёвка как в Photoshop generative fill: верхний и нижний край оригинала
    // (FEATHER px) плавно растворяются в размытую подложку через альфа-градиент —
    // жёсткой границы не существует уже на входе в Gemini.
    const FEATHER = 40
    const maskSvg = Buffer.from(
      `<svg width="${W}" height="${h0}" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset="${(FEATHER / h0).toFixed(4)}" stop-color="#fff" stop-opacity="1"/>
          <stop offset="${(1 - FEATHER / h0).toFixed(4)}" stop-color="#fff" stop-opacity="1"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
      </svg>`
    )
    const feathered = await sharp(resized)
      .ensureAlpha()
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .png()
      .toBuffer()

    const final = await sharp(blurred)
      .composite([{ input: feathered, top, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer()
    return { padded: `data:image/jpeg;base64,${final.toString('base64')}`, overlay: feathered, top }
  } catch (e: any) {
    console.warn('[padTo916] failed, falling back to legacy extend:', e.message)
    return null
  }
}

// Гарантия сохранности контента: после дорисовки Gemini вклеиваем растушёванный
// оригинал обратно поверх результата. Если Gemini центр не трогал — операция
// невидима; если "съел" текст/лого (как он любит) — они физически вернутся,
// а растушёвка сохранит плавный переход к дорисованным зонам.
async function restoreOriginalBand(resultBase64: string, overlay: Buffer, top: number): Promise<string> {
  const buf = Buffer.from(resultBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  const resized = await sharp(buf).resize(1080, 1920, { fit: 'fill' }).toBuffer()
  const merged = await sharp(resized)
    .composite([{ input: overlay, top, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
  return `data:image/jpeg;base64,${merged.toString('base64')}`
}

// QA-проверка 9x16 после рекомпозиции (экстенда). Проверяет две вещи:
// 1) сейф-зоны: верхние 15% и нижние 40% — зоны UI платформ, текст/CTA/лого запрещены;
// 2) швы: видимые горизонтальные стыки на границах оригинала (лучи/градиенты обязаны
//    проходить сквозь границу без ступеньки яркости). При нарушении — fix для ретрая.
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

CHECK 1 — SAFE ZONES (platform UI overlays):
- TOP 15% of the image (0-288px): must contain ONLY background — no text, headlines, logos, CTA buttons, or UI elements
- BOTTOM 40% of the image (1152-1920px): must contain ONLY background/scenery — no text, CTA, logos, or UI elements

CHECK 2 — SEAMS (this image was vertically extended by AI):
- Look for horizontal seam lines, brightness/color bands, or abrupt transitions where the extension meets the original image (typically in the upper third and lower third)
- Look for decorative elements (light beams, patterns, gradients) that break, bend, or change brightness at a horizontal line
- Flag any visible transition that reveals where the original image ended

CHECK 3 — UNFINISHED EXTENSION:
- The top and bottom areas must be SHARP and detailed like the rest of the image
- Flag if the top or bottom band is heavily blurred, out-of-focus, or looks like an upside-down mirrored copy of the adjacent content — that means the AI extension was not completed (fix_prompt: "Repaint the blurred top/bottom band into a sharp, detailed continuation of the scene")

Check the image and respond ONLY with raw JSON (no markdown):
- If everything is correct: {"status":"ok","fix_prompt":""}
- If violated: {"status":"fail","fix_prompt":"<specific instruction, e.g. 'Move the app logo down below the top 15%; blend the visible horizontal seam at ~25% height — continue the neon beams across it with matching angle and brightness'>"}

For CHECK 1 be tolerant of purely decorative background elements (light rays, patterns) — only flag text, logos, buttons, icons and UI. For CHECK 2 flag only clearly visible seams, not subtle gradient changes.`,
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

    // Выученные правила команды — подмешиваются в промпты (не в fix-режиме)
    let rulesBlock = ''
    try {
      const { rules } = await getRulesCached()
      rulesBlock = buildRulesPromptBlock(selectRulesForPrompt(rules, targetSize, appCode, session.user.email || undefined))
    } catch {}

    // Обучение на фиксе СП: GPT видит фикс + картинку, на которую он писался.
    // Запускаем параллельно с генерацией, await перед ответом (fire-and-forget на
    // Vercel убивается вместе с лямбдой).
    const fixContextImage = recomposeBase64 || previousImageBase64
    const learnPromise = (fixNote?.trim() && fixContextImage)
      ? learnFromFix({ fixText: fixNote, imageBase64: fixContextImage, size: targetSize, appCode, userEmail: session.user.email || undefined })
      : null

    // Режим рекомпозиции
    if (recomposeBase64 && targetSize) {
      await updateQueue('gemini', 1)
      try {
        // 9x16 без fixNote: пробуем путь с механической подложкой (анти-швы)
        let pad: PadResult | null = null
        if (targetSize === '9x16' && !fixNote) pad = await padTo916(recomposeBase64)

        let imageBase64 = pad
          ? await recomposeImage(pad.padded, targetSize, undefined, undefined, rulesBlock, true)
          : await recomposeImage(recomposeBase64, targetSize, fixNote, undefined, rulesBlock)

        // Возвращаем оригинальную полосу поверх — Gemini не имеет права терять контент
        if (pad) imageBase64 = await restoreOriginalBand(imageBase64, pad.overlay, pad.top)

        // 9x16: автопроверка сейф-зон + до 2 ретраев с конкретной fix-инструкцией.
        // Пропускаем, когда СП сам прислал fixNote — его правка приоритетнее автоQA.
        if (targetSize === '9x16' && !fixNote) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            const qa = await qaVerify9x16(imageBase64)
            if (qa.ok) break
            console.log(`[recompose-qa] 9x16 attempt ${attempt} fail: ${qa.fix}`)
            try {
              imageBase64 = await recomposeImage(imageBase64, targetSize, qa.fix)
              // После каждого ретрая тоже возвращаем оригинал поверх
              if (pad) imageBase64 = await restoreOriginalBand(imageBase64, pad.overlay, pad.top)
            } catch (e: any) {
              console.warn('[recompose-qa] retry failed:', e.message)
              break
            }
          }
        }

        if (learnPromise) await learnPromise
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

    // Правила команды — в конец промпта (кроме fix-режима: там команда СП главнее)
    if (rulesBlock && !fixNote) finalPromptWithLogo += rulesBlock

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

    if (learnPromise) await learnPromise
    return NextResponse.json({ prompt: finalPrompt, imageBase64 })

  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 })
  }
}
