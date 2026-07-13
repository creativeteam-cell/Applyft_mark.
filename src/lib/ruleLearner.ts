// Абстрагирование фиксов СП в общие правила.
// ВАЖНО: GPT получает не только текст фикса, но и КАРТИНКУ, на которую фикс писался —
// иначе "опусти ниже" невозможно понять (ниже чего? насколько?). Модель разрешает
// такие отсылки, глядя на изображение, и формулирует самодостаточное правило.
import OpenAI from 'openai'
import { getRules, saveRules, LearnedRule } from './rulesStore'
import { updateQueue } from './queue'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function learnFromFix(params: {
  fixText: string
  imageBase64: string     // изображение ДО фикса (контекст)
  size?: string           // '9x16' | '4x5' | ...
  appCode?: string        // 'FL' | 'KD' | ...
  userEmail?: string
}): Promise<void> {
  const { fixText, imageBase64, size, appCode, userEmail } = params
  if (!fixText?.trim() || !imageBase64) return

  try {
    const store = await getRules()
    // Для сопоставления показываем только командные правила + личные правила этого автора
    const existingCompact = store.rules
      .filter(r => r.active)
      .filter(r => (r.scope ?? 'team') === 'team' || r.createdBy === userEmail)
      .map(r => ({ id: r.id, rule: r.rule }))

    const url = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`

    await updateQueue('openai', 1)
    let parsed: any
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url, detail: 'high' } },
            {
              type: 'text',
              text: `You maintain a knowledge base of layout/style preferences for an ad-creative production team.

A creative producer wrote this fix instruction WHILE LOOKING AT THE ATTACHED IMAGE (the image BEFORE the fix):
"${fixText.trim()}"
${size ? `Image format: ${size}.` : ''}

The instruction may be in any language (Russian/Ukrainian/English).

STEP 1 — Is it generalizable? BE STRICT — most fixes are NOT.
A fix is REUSABLE only if it expresses a lasting preference that clearly should apply to FUTURE, DIFFERENT creatives: element positioning policy, sizing policy, spacing, style, safe zones (e.g. "опусти CTA ниже", "лого всегда слишком большое делаешь", "текст не должен перекрывать лицо").
A fix is ONE-OFF (→ {"generalizable": false}) if it references specific content of THIS image: removing/adding/extending a specific object or person ("прибери машину знизу", "extend the image of the girl and the man", "убери третью руку"), fixing a typo, changing specific wording, one-time color swap of a specific element, any instruction that only makes sense for this exact picture.
THE TEST: would this instruction make sense as a standing order for a creative the producer has never seen? If not — ONE-OFF.

STEP 1b — Team-wide or personal taste?
If the preference reflects an objective production standard (platform safe zones, readability, brand consistency) → "scope": "team".
If it reflects an individual stylistic taste that other producers may not share (preferred color moods, personal layout style) → "scope": "personal".
When unsure → "personal" (safer: applies only to its author).

STEP 2 — Resolve references using the IMAGE.
"Опусти ниже" alone is meaningless. Look at the image: WHAT should move, from WHERE to WHERE (in % of frame height/width). Write a self-contained rule in English that makes sense without seeing this image.
Example: fix "опусти все элементы ниже" + image where headline+CTA sit in the top 10% → rule "In 9:16 creatives, the headline block and CTA must not start in the top 15% of the frame — place them in the 20-60% vertical band."

STEP 3 — Check against existing rules:
${existingCompact.length ? JSON.stringify(existingCompact) : '[]'}
If the new rule is semantically the SAME as an existing one → respond {"generalizable": true, "merge_with": "<existing id>"}

Otherwise respond with a new rule:
{
  "generalizable": true,
  "rule": "self-contained English rule, one sentence, specific and actionable",
  "element": "cta|headline|logo|background|layout|color|text|other",
  "scope": "team" | "personal",
  "size_specific": true/false,   // does this rule only make sense for the ${size || 'given'} format?
  "app_specific": false          // true only if the rule mentions a specific app's brand/logo
}

Respond ONLY with raw JSON, no markdown.`,
            },
          ],
        }],
        max_tokens: 400,
        temperature: 0.2,
      }, { timeout: 45000 })

      const raw = res.choices[0]?.message?.content?.trim() || '{}'
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
      parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
    } finally {
      await updateQueue('openai', -1)
    }

    if (!parsed?.generalizable) {
      console.log('[ruleLearner] fix is one-off, skipping:', fixText.slice(0, 60))
      return
    }

    const now = new Date().toISOString()

    if (parsed.merge_with) {
      const rule = store.rules.find(r => r.id === parsed.merge_with)
      if (rule) {
        rule.weight += 1
        rule.updatedAt = now
        rule.examples = [...rule.examples, fixText.trim()].slice(-5)
        await saveRules(store)
        console.log(`[ruleLearner] reinforced rule ${rule.id} (weight ${rule.weight})`)
        return
      }
    }

    if (!parsed.rule) return
    const newRule: LearnedRule = {
      id: `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      rule: String(parsed.rule),
      element: String(parsed.element || 'other'),
      sizes: parsed.size_specific && size ? [size] : [],
      appCodes: parsed.app_specific && appCode ? [appCode] : [],
      scope: parsed.scope === 'team' ? 'team' : 'personal',
      weight: 1,
      examples: [fixText.trim()],
      active: true,
      createdBy: userEmail || '',
      createdAt: now,
      updatedAt: now,
    }
    store.rules.push(newRule)
    await saveRules(store)
    console.log('[ruleLearner] new rule:', newRule.rule)
  } catch (e: any) {
    // Обучение не должно ломать основной поток
    console.warn('[ruleLearner] failed:', e.message)
  }
}
