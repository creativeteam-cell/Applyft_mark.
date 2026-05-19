import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface GeneratePromptOptions {
  brief: string           // Текстовый бриф от юзера
  comment?: string        // Комментарий что переделать
  referenceBase64?: string // Референс конкурента (base64)
}

export async function generatePrompt({
  brief,
  comment,
  referenceBase64,
}: GeneratePromptOptions): Promise<string> {
  
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  // Если есть референс — передаём Vision
  if (referenceBase64) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: referenceBase64 },
        },
        {
          type: 'text',
          text: buildSystemPrompt(brief, comment, true),
        },
      ],
    })
  } else {
    messages.push({
      role: 'user',
      content: buildSystemPrompt(brief, comment, false),
    })
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 500,
  })

  return response.choices[0].message.content || ''
}

function buildSystemPrompt(
  brief: string,
  comment?: string,
  hasReference?: boolean
): string {
  return `You are an expert advertising creative director. 
Generate a detailed image generation prompt for Imagen 3 for an advertising creative (banner/poster).

Brief: ${brief}
${comment ? `Additional requirements: ${comment}` : ''}
${hasReference ? `I've attached a competitor's ad as a reference. Analyze its style, colors, composition and layout, but create something original for our brand.` : ''}

Generate a detailed English prompt for Imagen 3 that describes:
- Visual composition
- Color palette  
- Style and mood
- Key visual elements
- Text placement hints

Return ONLY the prompt text, nothing else.`
}
