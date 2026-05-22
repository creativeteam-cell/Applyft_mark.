// Генерация изображений через Gemini 3.1 Flash Image Preview

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
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
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

    if (!imagePart) {
      throw new Error('No image in response')
    }

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`

  } catch (e: any) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') {
      throw new Error('TIMEOUT')
    }
    throw e
  }
}

export async function generateImage(prompt: string, referenceBase64?: string): Promise<string> {
  // Первая попытка — 100 секунд
  try {
    return await tryGenerate(prompt, referenceBase64, 100000)
  } catch (e: any) {
    if (e.message !== 'TIMEOUT') throw e
    console.log('Gemini timeout on attempt 1, retrying...')
  }

  // Вторая попытка — ещё 100 секунд
  try {
    return await tryGenerate(prompt, referenceBase64, 100000)
  } catch (e: any) {
    if (e.message === 'TIMEOUT') {
      throw new Error('Image generation timed out. Gemini is under heavy load, please try again in a moment.')
    }
    throw e
  }
}
