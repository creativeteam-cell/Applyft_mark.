import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import sharp from 'sharp'

// Точные размеры для каждого формата
const FORMAT_SIZES: Record<string, { width: number; height: number }> = {
  '4x5':    { width: 1200, height: 1500 },
  '1x1':    { width: 1200, height: 1200 },
  '9x16':   { width: 1080, height: 1920 },
  '1.91x1': { width: 1200, height: 628  },
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { imageBase64, size } = body

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    const dimensions = FORMAT_SIZES[size] || FORMAT_SIZES['4x5']

    // Use 'contain' for 1.91x1 — Gemini generates 16:9 (1.78:1) which is narrower than
    // the 1.91:1 target, so 'cover' crops ~47px off top & bottom. 'contain' keeps the
    // full image and adds ~41px neutral bars on each side instead — nothing gets cut off.
    // For 4x5, 1x1, 9x16 the Gemini native ratio matches exactly, so fit doesn't matter.
    const fit = size === '1.91x1' ? ('contain' as const) : ('cover' as const)
    const resizedBuffer = await sharp(imageBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .jpeg({ quality: 92 })
      .toBuffer()

    return NextResponse.json({
      imageBase64: `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`,
      width: dimensions.width,
      height: dimensions.height,
    })

  } catch (error: any) {
    console.error('Resize error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
