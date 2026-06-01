import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface AppInfo {
  code: string
  name: string
  description?: string
  painPoints?: string[]
  logoBase64?: string
}

interface GeneratePromptOptions {
  appInfo?: AppInfo
  selectedPain?: string
  selectedHook?: string
  selectedConcept?: string
  userText?: string
  referenceBase64?: string
  competitorBase64?: string
  fixNote?: string
  previousImageBase64?: string
}

const CREATIVE_APPROACHES = `CREATIVE APPROACHES — pick ONE that best fits:
- Shock & provoke: unexpected visual metaphor that stops the scroll
- Text as hero: oversized bold typography IS the main visual, minimal imagery
- Body language: extreme close-up of body part representing the pain
- Before/after tension: split or contrast composition showing transformation
- Social scene: relatable everyday moment of vulnerability or triumph
- Symbolic metaphor: objects representing pain (chains, scales, clocks, mirrors)
- Humor & irony: playful twist on a serious problem
- Minimalist impact: single powerful image + one killer sentence`

export async function generatePrompt(options: GeneratePromptOptions): Promise<string> {
  const { appInfo, selectedPain, selectedHook, selectedConcept, userText, referenceBase64, competitorBase64, fixNote, previousImageBase64 } = options

  const hasApp = appInfo?.description || appInfo?.name
  const hasPain = selectedPain && selectedPain !== 'none'
  const hasHook = selectedHook && selectedHook !== 'none'
  const hasUserText = userText?.trim()
  const hasReference = referenceBase64
  const hasCompetitor = competitorBase64
  const hasFix = fixNote?.trim()
  const hasConcept = selectedConcept && selectedConcept !== 'none'

  if (!hasApp && !hasPain && !hasHook && !hasUserText && !hasReference && !hasCompetitor && !hasFix) {
    throw new Error('NOT_ENOUGH_DATA')
  }

  const systemPrompt = `You are an expert advertising creative director for social media.

Write a Gemini image generation prompt for a scroll-stopping ad banner.

${CREATIVE_APPROACHES}

RULES:
- Vertical 4:5 format
- Keep all text and elements away from edges (safe zones)
- Include text IN the image: bold headline, optional subheadline, CTA button
- Do NOT include logos, brand marks, or watermarks
- Do NOT mention pixel dimensions or technical specs in the prompt
- Do NOT add annotation labels, arrows, or explanatory text around the image
- Bold readable typography matching the emotional tone
- Look like a professional social media ad, not a stock photo
- Write in English regardless of input language
${hasHook ? `- HOOK TEXT RULE: The exact text "${selectedHook}" MUST appear verbatim as the main headline in the image. Do not paraphrase or modify it.` : ''}
${!hasPain && !hasUserText && !hasReference && !hasCompetitor ? `- No pain point provided — focus on aspirational, benefit-driven, or curiosity-driven angle. Do NOT invent pain points.` : ''}
${hasCompetitor ? `- COMPETITOR MODE: The reference image is a competitor ad. Create an ORIGINAL ad for the app that competes in the same space. Do NOT copy the competitor — create something different but equally compelling.` : ''}
${hasFix ? `SMALL FIX ONLY: Keep overall concept, style, composition. Apply only: "${fixNote}"` : ''}

Return ONLY the image generation prompt (120-200 words). No explanations.`

  const contentParts: any[] = []

  if (referenceBase64 && !hasFix && !hasCompetitor) {
    contentParts.push({ type: 'image_url', image_url: { url: referenceBase64 } })
  }
  if (competitorBase64 && !hasFix) {
    contentParts.push({ type: 'image_url', image_url: { url: competitorBase64 } })
  }
  if (previousImageBase64 && hasFix) {
    contentParts.push({ type: 'image_url', image_url: { url: previousImageBase64 } })
  }

  let userMessage = 'Create an ad banner prompt.\n\n'

  if (appInfo?.name) userMessage += `APP: ${appInfo.name} (${appInfo.code})\n`
  if (appInfo?.description) userMessage += `DESCRIPTION: ${appInfo.description}\n\n`
  if (hasPain) userMessage += `PAIN POINT: "${selectedPain}"\n\n`
  if (hasHook) userMessage += `HOOK TEXT (must appear verbatim in image): "${selectedHook}"\n\n`
  if (hasConcept) userMessage += `CONCEPT INSPIRATION (extract the idea, don't copy): "${selectedConcept}"\n\n`
  if (hasUserText) userMessage += `USER INSTRUCTIONS: ${userText}\n\n`
  if (referenceBase64 && !hasFix && !hasCompetitor) userMessage += `REFERENCE: Extract the creative approach. Create something original in that spirit.\n\n`
  if (hasCompetitor) userMessage += `COMPETITOR AD: Analyze the creative approach. Create an original competing ad for the app above.\n\n`
  if (hasFix && previousImageBase64) userMessage += `FIX: Apply ONLY this change: "${fixNote}"\n\n`

  userMessage += `Choose the most impactful creative approach and write the prompt.`
  contentParts.push({ type: 'text', text: userMessage })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentParts },
    ],
    max_tokens: 500,
  })

  return response.choices[0].message.content || ''
}

// Анализатор концептов — только абстрактный визуальный подход, без боли
export async function analyzeConcept(imageBase64: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an advertising creative strategist. Analyze this ad and extract the ABSTRACT creative concept — the underlying visual and compositional approach that can be reused for ANY product.

Return exactly these 5 points:
1. Creative approach: abstract strategy name (e.g. "aspirational contrast", "before/after tension", "text as hero", "symbolic metaphor")
2. Color palette mood: emotional tone of colors (e.g. "warm and cinematic with golden tones", "cold and clinical", "vibrant high-contrast")
3. Typography style: font weight, role, and accent usage (e.g. "oversized bold headline dominates with one accent-color word", "clean minimal hierarchy")
4. Text placement: layout zones in abstract terms (e.g. "top-right headline + bottom-left supporting details", "centered single statement")
5. Key visual element and emotional hook: describe the COMPOSITIONAL PRINCIPLE, not specific objects (e.g. "split composition contrasting two opposing states", "extreme close-up creating intimacy", "lone figure in vast space suggesting isolation")

CRITICAL RULES:
- Do NOT name specific objects, people, products, or brands from the image
- Do NOT mention pain points, problems, or product features
- Do NOT describe what the ad is selling or who it targets
- Focus ONLY on HOW it's made visually — approach, composition, color, type
- The output must be reusable as inspiration for a completely different product`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text: 'Extract the abstract creative concept.' },
        ],
      },
    ],
    max_tokens: 250,
  })

  return response.choices[0].message.content || ''
}
