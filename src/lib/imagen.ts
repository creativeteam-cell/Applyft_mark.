// Генерация изображений через Gemini 3.1 Flash Image Preview

const RECOMPOSE_PROMPTS: Record<string, string> = {
  '1x1': `Take this exact image and recompose it for a square 1:1 format. 
Keep all visual elements, typography, colors and overall style completely identical. 
Center the main subject and most important text. 
Redistribute and rescale elements so the composition feels natural and balanced for a square format. 
All text must be fully visible, readable and within safe zones.`,

  '9x16': `Take this exact image and recompose it for a tall vertical 9:16 format. 
Keep all visual elements, typography, colors and overall style completely identical. 
Stack elements vertically: headline at top, main visual in the center, supporting details and CTA button near the bottom. 
All text must be fully visible, readable and within safe zones.`,

  '1.91x1': `Take this exact image and recompose it for a wide horizontal 16:9 landscape format. 
Keep all visual elements, typography, colors and overall style completely identical. 
Spread elements horizontally: place the main visual on one side and text hierarchy on the other, or arrange in a balanced wide panoramic layout. 
All text must be fully visible, readable and within safe zones.`,
}

async function tryGenerate(prompt: string, referenceBase64?: string, timeoutMs = 100000): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY!
  const parts: any[] = []

  if (referenceBase64) {
    const base64Data = referenceBase64.replace(/^data:image\/\w+;base64,/, '')
    const mimeType = referenceBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg'
    parts.push({ inlineData: { mimeType, data: base64Data } })
  }

  parts.push({ text: prompt })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Imagen API error: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const responseParts = data.candidates?.[0]?.content?.parts || []
    const imagePart = responseParts.find((p: any) => p.inlineData)
    if (!imagePart) throw new Error('No image in response')

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
  } catch (e: any) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('TIMEOUT')
    throw e
  }
}

async function withRetry(prompt: string, referenceBase64?: string): Promise<string> {
  try {
    return await tryGenerate(prompt, referenceBase64, 100000)
  } catch (e: any) {
    if (e.message !== 'TIMEOUT') throw e
    console.log('Gemini timeout on attempt 1, retrying...')
  }

  try {
    return await tryGenerate(prompt, referenceBase64, 100000)
  } catch (e: any) {
    if (e.message === 'TIMEOUT') {
      throw new Error('Image generation timed out. Gemini is under heavy load, please try again in a moment.')
    }
    throw e
  }
}

export async function generateImage(prompt: string, referenceBase64?: string): Promise<string> {
  return withRetry(prompt, referenceBase64)
}

export async function recomposeImage(imageBase64: string, targetSize: string): Promise<string> {
  const prompt = RECOMPOSE_PROMPTS[targetSize]
  if (!prompt) throw new Error(`Unknown target size: ${targetSize}`)
  return withRetry(prompt, imageBase64)
}
