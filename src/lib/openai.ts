import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface AppInfo {
  code: string
  name: string
  description?: string
  painPoints?: string[]
}

interface GeneratePromptOptions {
  appInfo?: AppInfo
  selectedPain?: string
  userText?: string
  referenceBase64?: string
  fixNote?: string // если это правка существующей картинки
}

export async function generatePrompt(options: GeneratePromptOptions): Promise<string> {
  const { appInfo, selectedPain, userText, referenceBase64, fixNote } = options

  // Проверяем есть ли вообще что-то для генерации
  const hasApp = appInfo?.description || appInfo?.name
  const hasPain = selectedPain
  const hasUserText = userText?.trim()
  const hasReference = referenceBase64

  if (!hasApp && !hasPain && !hasUserText && !hasReference) {
    throw new Error('NOT_ENOUGH_DATA')
  }

  // Строим системный промпт
  const systemPrompt = `You are an expert advertising creative director specializing in social media ad creatives.

Your task is to write a detailed image generation prompt for Gemini AI that will create a high-quality advertising banner/poster.

IMPORTANT RULES FOR THE PROMPT YOU WRITE:
- The creative must follow social media safe zones (keep important elements away from edges, especially top and bottom 15%)
- Follow marketing composition rules: clear visual hierarchy, one dominant element, strong contrast
- Include space for text overlay (headline + CTA button area)
- The image must be attention-grabbing and emotionally compelling
- Typography should be minimal in the image itself — just describe the mood and style
- Always write the prompt in English regardless of input language
- Be specific about: lighting, color palette, mood, composition, style, key visual elements
- The output should look like a professional advertising poster, NOT a stock photo

${fixNote ? `This is a FIX REQUEST. The user wants to modify an existing creative. Apply the fix while keeping the overall concept.` : ''}

Return ONLY the image generation prompt, nothing else. No explanations, no preamble.`

  // Строим контент сообщения
  const contentParts: any[] = []

  // Если есть референс — анализируем его
  if (referenceBase64) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: referenceBase64 },
    })
  }

  // Основной текст запроса
  let userMessage = 'Create an advertising banner image generation prompt based on:\n\n'

  if (appInfo?.name) {
    userMessage += `APP: ${appInfo.name} (${appInfo.code})\n`
  }

  if (appInfo?.description) {
    userMessage += `APP DESCRIPTION: ${appInfo.description}\n\n`
  }

  if (selectedPain) {
    userMessage += `USER PAIN POINT (the emotional hook for this ad): "${selectedPain}"\n\n`
  }

  if (userText?.trim()) {
    userMessage += `ADDITIONAL INSTRUCTIONS FROM USER: ${userText}\n\n`
  }

  if (referenceBase64) {
    userMessage += `REFERENCE IMAGE: Analyze the reference image above. Extract the visual style, color palette, composition approach, and mood. Create something similar but original for ${appInfo?.name || 'this app'}.\n\n`
  }

  if (fixNote) {
    userMessage += `FIX REQUEST: ${fixNote}\n\n`
  }

  if (!selectedPain && !userText && !referenceBase64) {
    userMessage += `Create a general advertising poster for this app that would appeal to its target audience.\n\n`
  }

  userMessage += `Write a detailed Gemini image generation prompt (150-250 words) that captures all of this.`

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
