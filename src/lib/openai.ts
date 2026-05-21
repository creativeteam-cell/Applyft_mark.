import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
  userText?: string
  referenceBase64?: string
  fixNote?: string
  previousImageBase64?: string
}

export async function generatePrompt(options: GeneratePromptOptions): Promise<string> {
  const { appInfo, selectedPain, userText, referenceBase64, fixNote, previousImageBase64 } = options

  const hasApp = appInfo?.description || appInfo?.name
  const hasPain = selectedPain && selectedPain !== 'none'
  const hasUserText = userText?.trim()
  const hasReference = referenceBase64
  const hasFix = fixNote?.trim()

  if (!hasApp && !hasPain && !hasUserText && !hasReference && !hasFix) {
    throw new Error('NOT_ENOUGH_DATA')
  }

  const hasLogo = !!appInfo?.logoBase64

  const systemPrompt = `You are an expert advertising creative director specializing in social media ad creatives.

Your task is to write a detailed image generation prompt for Gemini AI that creates a high-quality advertising banner/poster.

CRITICAL RULES:
- Format: 4:5 vertical (1200x1500px), suitable for Instagram/Facebook feed
- Safe zones: keep ALL text and important elements at least 15% away from edges
- Composition: clear visual hierarchy, one dominant hero element, strong contrast
- Include realistic text in the image: a bold headline, optional subheadline, and a CTA button
- Typography: bold, readable, modern — warm and elegant for lifestyle apps
- Do NOT include any logos, brand marks, app icons, or watermarks anywhere in the image. No exceptions.
- The image must look like a professional social media ad, NOT a stock photo
- Always write the prompt in English regardless of input language
- Be very specific about: lighting, colors, mood, composition, subject, text content

${hasFix ? `IMPORTANT: This is a FIX of an existing creative. The user wants SMALL changes only. Keep the overall concept, style, composition and mood. Only apply the requested fix: "${fixNote}"` : ''}

Return ONLY the image generation prompt (150-250 words). Nothing else.`

  const contentParts: any[] = []

  // Референс конкурента
  if (referenceBase64 && !hasFix) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: referenceBase64 },
    })
  }

  // Предыдущая картинка для Fix
  if (previousImageBase64 && hasFix) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: previousImageBase64 },
    })
  }

  let userMessage = 'Create an advertising banner image generation prompt.\n\n'

  if (appInfo?.name) {
    userMessage += `APP: ${appInfo.name} (${appInfo.code})\n`
  }
  if (appInfo?.description) {
    userMessage += `DESCRIPTION: ${appInfo.description}\n\n`
  }
  if (hasPain) {
    userMessage += `EMOTIONAL PAIN POINT (main hook): "${selectedPain}"\n\n`
  }
  if (hasUserText) {
    userMessage += `USER INSTRUCTIONS: ${userText}\n\n`
  }
  if (referenceBase64 && !hasFix) {
    userMessage += `REFERENCE: Analyze the reference image. Extract style, colors, composition, mood. Create something similar but original for ${appInfo?.name || 'this app'}.\n\n`
  }
  if (hasFix && previousImageBase64) {
    userMessage += `FIX REQUEST: I'm showing you the current creative. Apply ONLY this change: "${fixNote}". Keep everything else the same.\n\n`
  }
  if (!hasPain && !hasUserText && !hasReference) {
    userMessage += `Create a compelling general advertising poster for this app targeting its audience.\n\n`
  }

  userMessage += `Write the Gemini image generation prompt now.`

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
