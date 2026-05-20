// Генерация изображений через Gemini imagen preview

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY!

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Imagen API error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  
  // Ищем картинку в ответе
  const parts = data.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p: any) => p.inlineData)
  
  if (!imagePart) {
    throw new Error('No image in response')
  }

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
}
