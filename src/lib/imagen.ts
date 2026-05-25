import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Ближайшие поддерживаемые размеры gpt-image-1
const SIZE_MAP: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
  '4x5':    '1024x1536', // portrait → Sharp обрежет до 1200x1500
  '1x1':    '1024x1024', // square   → Sharp обрежет до 1200x1200
  '9x16':   '1024x1536', // portrait → Sharp обрежет до 1080x1920
  '1.91x1': '1536x1024', // landscape→ Sharp обрежет до 1200x628
}

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

// Основная генерация (4x5 превью)
export async function generateImage(prompt: string, referenceBase64?: string): Promise<string> {
  // Если есть референс (Fix) — используем edit endpoint
  if (referenceBase64) {
    return editImage(referenceBase64, prompt, '4x5')
  }

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: SIZE_MAP['4x5'],
  })

  const b64 = response.data[0].b64_json
  if (!b64) throw new Error('No image in response')
  return `data:image/png;base64,${b64}`
}

// Рекомпозиция готовой картинки под другой размер
export async function recomposeImage(imageBase64: string, targetSize: string): Promise<string> {
  const prompt = RECOMPOSE_PROMPTS[targetSize]
  if (!prompt) throw new Error(`Unknown target size: ${targetSize}`)
  return editImage(imageBase64, prompt, targetSize)
}

// Edit — принимает картинку + промпт
async function editImage(imageBase64: string, prompt: string, targetSize: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const file = await toFile(buffer, 'image.png', { type: 'image/png' })

  const response = await openai.images.edit({
    model: 'gpt-image-1',
    image: file,
    prompt,
    size: SIZE_MAP[targetSize] || '1024x1536',
  })

  const b64 = response.data[0].b64_json
  if (!b64) throw new Error('No image in response')
  return `data:image/png;base64,${b64}`
}
