import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import sharp from 'sharp'

// Сжимаем до max 1200px и JPEG quality 85 чтобы не превысить лимит Vercel (4.5MB)
async function compressBuffer(buffer: ArrayBuffer): Promise<string> {
  const compressed = await sharp(Buffer.from(buffer))
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
  return `data:image/jpeg;base64,${compressed.toString('base64')}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

  try {
    // Если это прямая ссылка на картинку — качаем напрямую
    if (/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url)) {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch image')
      const buffer = await res.arrayBuffer()
      const imageBase64 = await compressBuffer(buffer)
      return NextResponse.json({ imageBase64 })
    }

    // Иначе — парсим страницу и ищем og:image
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)',
        'Accept': 'text/html',
      },
    })

    if (!res.ok) throw new Error(`Page returned ${res.status}`)

    const html = await res.text()

    // Ищем og:image
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)

    if (!ogMatch?.[1]) {
      return NextResponse.json({ error: 'No image found on this page' }, { status: 400 })
    }

    const imageUrl = ogMatch[1]

    // Качаем найденную картинку
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('Failed to download image')

    const buffer = await imgRes.arrayBuffer()
    const imageBase64 = await compressBuffer(buffer)

    return NextResponse.json({ imageBase64 })

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch image' }, { status: 500 })
  }
}
