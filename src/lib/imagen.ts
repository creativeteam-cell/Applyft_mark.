// Генерация изображений через Google Imagen 4

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY!

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '3:4',
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Imagen API error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  const base64Image = data.predictions[0].bytesBase64Encoded
  
  return `data:image/png;base64,${base64Image}`
}
