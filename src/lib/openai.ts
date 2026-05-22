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
  selectedConcept?: string  // текст концепта или 'random' или undefined
  userText?: string
  referenceBase64?: string
  fixNote?: string
  previousImageBase64?: string
}

const CREATIVE_APPROACHES = `
CREATIVE APPROACHES — pick ONE that best fits the pain point and concept:
- Shock & provoke: unexpected visual metaphor that stops the scroll
- Text as hero: oversized bold typography IS the main visual element, minimal imagery
- Body language: extreme close-up of body part that represents the pain (back, hands, feet, eyes)
- Before/after tension: split or strong contrast composition showing transformation
- Social scene: relatable everyday moment of vulnerability or triumph
- Symbolic metaphor: use objects to represent the pain (chains, scales, clocks, mirrors, shadows, keys)
- Humor & irony: playful twist on a serious problem that makes people smile and relate
- Minimalist impact: single powerful image + one killer sentence, lots of white space
`

export async function generatePrompt(options: GeneratePromptOptions): Promise<string> {
  const { appInfo, selectedPain, selectedConcept, userText, referenceBase64, fixNote, previousImageBase64 } = options

  const hasApp = appInfo?.description || appInfo?.name
  const hasPain = selectedPain && selectedPain !== 'none'
  const hasUserText = userText?.trim()
  const hasReference = referenceBase64
  const hasFix = fixNote?.trim()
  const hasConcept = selectedConcept && selectedConcept !== 'none'

  if (!hasApp && !hasPain && !hasUserText && !hasReference && !hasFix) {
    throw new Error('NOT_ENOUGH_DATA')
  }

  const systemPrompt = `You are an expert advertising creative director specializing in social media ad creatives.

Your task is to write a detailed image generation prompt for Gemini AI that creates a scroll-stopping advertising banner.

UNIVERSAL CREATIVE APPROACHES:
${CREATIVE_APPROACHES}

CRITICAL RULES:
- Format: 4:5 vertical (1200x1500px), suitable for Instagram/Facebook feed
- Safe zones: keep ALL text and important elements at least 15% away from edges
- Include realistic text IN the image: bold headline, optional subheadline, CTA button
- Typography: bold, readable, modern — match the emotional tone
- Do NOT include any logos, brand marks, app icons, or watermarks. No exceptions.
- Must look like a professional social media ad, NOT a generic stock photo
- Be specific: lighting, colors, mood, composition, subject, exact text content
- Always write the prompt in English regardless of input language

${hasFix ? `IMPORTANT: This is a SMALL FIX of an existing creative. Keep the overall concept, style, composition. Only apply: "${fixNote}"` : ''}

Return ONLY the image generation prompt (150-250 words). Nothing else.`

  const contentParts: any[] = []

  if (referenceBase64 && !hasFix) {
    contentParts.push({ type: 'image_url', image_url: { url: referenceBase64 } })
  }
  if (previousImageBase64 && hasFix) {
    contentParts.push({ type: 'image_url', image_url: { url: previousImageBase64 } })
  }

  let userMessage = 'Create an advertising banner prompt.\n\n'

  if (appInfo?.name) userMessage += `APP: ${appInfo.name} (${appInfo.code})\n`
  if (appInfo?.description) userMessage += `DESCRIPTION: ${appInfo.description}\n\n`
  if (hasPain) userMessage += `EMOTIONAL PAIN POINT (main hook): "${selectedPain}"\n\n`
  if (hasConcept) userMessage += `CREATIVE CONCEPT TO INSPIRE (don't copy, extract the idea): "${selectedConcept}"\n\n`
  if (hasUserText) userMessage += `USER INSTRUCTIONS: ${userText}\n\n`

  if (referenceBase64 && !hasFix) {
    userMessage += `REFERENCE IMAGE: Analyze it. Extract the creative approach and mood. Create something original in that spirit for ${appInfo?.name || 'this app'}.\n\n`
  }
  if (hasFix && previousImageBase64) {
    userMessage += `FIX: Apply ONLY this change to the creative shown: "${fixNote}"\n\n`
  }
  if (!hasPain && !hasUserText && !hasReference && !hasConcept) {
    userMessage += `Create a compelling general advertising poster for this app.\n\n`
  }

  userMessage += `Pick the most impactful creative approach from the list and write the Gemini prompt now.`
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
