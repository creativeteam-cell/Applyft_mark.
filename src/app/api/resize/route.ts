import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import sharp from 'sharp'
import { CREATIVE_FORMATS } from '@/lib/formats'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { imageBase64, formatIds } = body

    // Декодируем base64 картинку
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Берём только запрошенные форматы (или все если не указаны)
    const formats = formatIds
      ? CREATIVE_FORMATS.filter(f => formatIds.includes(f.id))
      : CREATIVE_FORMATS

    // Ресайзим под каждый формат параллельно
    const resized = await Promise.all(
      formats.map(async (format) => {
        const resizedBuffer = await sharp(imageBuffer)
          .resize(format.width, format.height, {
            fit: 'cover',       // Заполняет полностью, обрезает лишнее
            position: 'center', // Центрирует
          })
          .png()
          .toBuffer()

        return {
          formatId: format.id,
          name: format.name,
          width: format.width,
          height: format.height,
          platform: format.platform,
          imageBase64: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
        }
      })
    )

    return NextResponse.json({ resized })

  } catch (error: any) {
    console.error('Resize error:', error)
    return NextResponse.json(
      { error: error.message || 'Resize failed' },
      { status: 500 }
    )
  }
}
