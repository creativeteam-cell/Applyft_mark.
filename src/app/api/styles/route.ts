import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStyles, getStylesCached, saveStyles, CustomStyle } from '@/lib/stylesStore'
import sharp from 'sharp'

// Список стилей (отсортирован по использованиям, чаще используемые — первыми)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { styles } = await getStylesCached()
  styles.sort((a, b) => b.uses - a.uses)
  return NextResponse.json({ styles })
}

// Создание нового стиля
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, suffix, image } = await req.json()
  if (!name?.trim() || !suffix?.trim()) return NextResponse.json({ error: 'Name and style text required' }, { status: 400 })

  // Сжимаем превью до маленького квадрата, чтобы JSON не разбухал
  let img: string | null = null
  if (image && typeof image === 'string' && image.startsWith('data:')) {
    try {
      const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const out = await sharp(buf).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()
      img = `data:image/jpeg;base64,${out.toString('base64')}`
    } catch {}
  }

  const data = await getStyles()
  const style: CustomStyle = {
    id: `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 40),
    suffix: suffix.trim().slice(0, 600),
    image: img,
    uses: 0,
    createdBy: session.user.email,
    createdByName: session.user.name || session.user.email,
    createdAt: new Date().toISOString(),
  }
  data.styles.push(style)
  await saveStyles(data)
  return NextResponse.json({ style })
}

// Редактирование / удаление / инкремент счётчика
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, suffix, image, incrementUse } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getStyles()
  const style = data.styles.find(s => s.id === id)
  if (!style) return NextResponse.json({ error: 'Style not found' }, { status: 404 })

  // Инкремент использования доступен всем (счётчик), правки — только автору
  if (incrementUse) {
    style.uses += 1
    await saveStyles(data)
    return NextResponse.json({ success: true })
  }

  if (style.createdBy !== session.user.email) {
    return NextResponse.json({ error: 'Only the author can edit this style' }, { status: 403 })
  }
  if (typeof name === 'string' && name.trim()) style.name = name.trim().slice(0, 40)
  if (typeof suffix === 'string' && suffix.trim()) style.suffix = suffix.trim().slice(0, 600)
  if (image === null) style.image = null
  else if (typeof image === 'string' && image.startsWith('data:')) {
    try {
      const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const out = await sharp(buf).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()
      style.image = `data:image/jpeg;base64,${out.toString('base64')}`
    } catch {}
  }
  await saveStyles(data)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getStyles()
  const style = data.styles.find(s => s.id === id)
  if (!style) return NextResponse.json({ error: 'Style not found' }, { status: 404 })
  if (style.createdBy !== session.user.email) {
    return NextResponse.json({ error: 'Only the author can delete this style' }, { status: 403 })
  }
  data.styles = data.styles.filter(s => s.id !== id)
  await saveStyles(data)
  return NextResponse.json({ success: true })
}
