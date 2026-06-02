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
  fixNote?: string
  previousImageBase64?: string
}

export async function generatePrompt(options: GeneratePromptOptions): Promise<string> {
  const {
    appInfo,
    selectedPain,
    selectedHook,
    selectedConcept,
    userText,
    referenceBase64,
    fixNote,
    previousImageBase64,
  } = options

  const hasPain = selectedPain && selectedPain !== 'none'
  const hasHook = selectedHook && selectedHook !== 'none'
  const hasUserText = userText?.trim()
  const hasReference = !!referenceBase64
  const hasFix = !!fixNote?.trim()
  const hasConcept = selectedConcept && selectedConcept !== 'none'

  // FIX режим
  if (hasFix && previousImageBase64) {
    const fixPrompt = `You are an advertising creative director.
Analyze the provided ad image in detail — describe its composition, visual style, color palette, typography, text content, layout, and all visual elements.
Then write a NEW Gemini image generation prompt that recreates this exact ad but with ONE change applied: "${fixNote}"
If the fix instruction is not in English, translate it first.

RULES:
- Keep EVERYTHING the same except the requested change
- Be very specific about colors, typography style, composition, text placement
- Include all text that appears in the original image verbatim
- Return ONLY the Gemini image generation prompt (150-200 words). No explanations.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: fixPrompt },
        {
          role: 'user', content: [
            { type: 'image_url', image_url: { url: previousImageBase64 } },
            { type: 'text', text: `Recreate this ad with this fix: "${fixNote}"` },
          ],
        },
      ],
      max_tokens: 500,
    })
    return response.choices[0].message.content || ''
  }

  // Основной режим генерации
  const systemPrompt = `You are an expert advertising creative director for mobile apps.

Your job: write a Gemini image generation prompt for a scroll-stopping social media ad banner.

STRICT PRIORITY ORDER — follow exactly:

PRIORITY 1 — PRODUCT (always included):
Use the app description as the creative foundation. The ad must serve this product.
IMPORTANT: Do NOT include the app name as text in the image unless the user explicitly asks for it.

PRIORITY 2 — REFERENCE IMAGE + USER PROMPT (work as a pair):
${hasReference && hasUserText
  ? `Both a reference image AND user instructions are provided. Analyze the reference for its visual style, composition, color mood, and layout approach. Then apply the user's instructions ON TOP of that style. They work together.`
  : hasReference
  ? `A reference image is provided. Analyze it for visual style, composition, color palette, typography approach, and emotional feel. Adapt this creative approach for the product — same energy and style but original content.`
  : hasUserText
  ? `Follow the user's creative instructions as the main visual direction.`
  : `Choose the most compelling creative approach for this product.`}

PRIORITY 3 — PAIN POINT (sets emotional tone):
${hasPain ? `The ad must address this pain: "${selectedPain}". This drives the emotional message and visual mood.` : `No pain point selected — use an aspirational or benefit-driven angle.`}

PRIORITY 4 — HOOK TEXT (ABSOLUTE RULE — non-negotiable):
${hasHook
  ? `THE HOOK TEXT IS: "${selectedHook}"
THIS TEXT MUST APPEAR IN THE IMAGE EXACTLY AS WRITTEN.
- Word for word. Zero changes. No synonyms. No paraphrasing.
- Must be the dominant headline text rendered visibly on the image.
- Write it in the Gemini prompt as: Display the text "${selectedHook}" as the main bold headline.`
  : `No hook specified — create a compelling headline that fits the concept.`}

OUTPUT FORMAT RULES:
- Vertical 4:5 format
- Safe zones: keep all elements away from edges
- Include text ON the image: headline${hasHook ? ` (MUST be exactly: "${selectedHook}")` : ''}, optional subheadline, CTA button
- NO logos, brand marks, watermarks
- DO NOT include the app name as text in the image unless explicitly requested
- NEVER repeat the same text more than once
- NO pixel dimensions or technical specs
- Bold readable typography
- Professional social media ad quality
${hasConcept ? `- STYLE INSPIRATION: "${selectedConcept}" — use this as creative direction` : ''}

${hasReference ? `CRITICAL — END YOUR PROMPT WITH THIS EXACT SENTENCE:
"Use the attached reference image as the primary visual style guide — preserve its artistic style, human emotional elements, color treatment, lighting mood, and overall composition feel. Adapt these into the new concept without copying the content."` : ''}

Return ONLY the Gemini image generation prompt (150-200 words). No explanations, no preamble.`

  const contentParts: any[] = []

  if (referenceBase64) {
    contentParts.push({ type: 'image_url', image_url: { url: referenceBase64 } })
  }

  let userMessage = 'Create an ad banner prompt.\n\n'
  userMessage += '=== PRODUCT ===\n'
  if (appInfo?.name) userMessage += `App: ${appInfo.name} (${appInfo.code})\n`
  if (appInfo?.description) userMessage += `Description: ${appInfo.description}\n`

  if (hasReference) {
    userMessage += '\n=== REFERENCE IMAGE ===\n'
    userMessage += hasUserText
      ? `Analyze the reference style above. Then apply user instructions on top of it.\n`
      : `Analyze and adapt this creative approach for the product above.\n`
  }

  if (hasUserText) {
    userMessage += '\n=== USER INSTRUCTIONS (translate to English if needed) ===\n'
    userMessage += `${userText}\n`
  }

  if (hasPain) {
    userMessage += '\n=== PAIN POINT ===\n'
    userMessage += `${selectedPain}\n`
  }

  if (hasHook) {
    userMessage += '\n=== HOOK TEXT (VERBATIM — DO NOT CHANGE) ===\n'
    userMessage += `"${selectedHook}"\n`
    userMessage += `This exact text must appear as the headline in the image. No modifications.\n`
  }

  if (hasConcept) {
    userMessage += '\n=== CONCEPT STYLE ===\n'
    userMessage += `${selectedConcept}\n`
  }

  userMessage += '\nNow write the Gemini image generation prompt.'
  contentParts.push({ type: 'text', text: userMessage })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentParts },
    ],
    max_tokens: 600,
  })

  return response.choices[0].message.content || ''
}

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
5. Key visual element and emotional hook: describe the COMPOSITIONAL PRINCIPLE, not specific objects

CRITICAL RULES:
- Do NOT name specific objects, people, products, or brands from the image
- Do NOT mention pain points, problems, or product features
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
