import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getApps, saveApps } from '@/lib/appsStore'
import { findAppFolder } from '@/lib/googleDrive'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apps = await getApps()
  return NextResponse.json(apps)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const apps = await getApps()

  const existing = apps.findIndex(a => a.code === body.code)
  if (existing >= 0) {
    apps[existing] = { ...apps[existing], ...body }
  } else {
    let driveExists = false
    try {
      const folder = await findAppFolder(body.code)
      driveExists = !!folder
    } catch {}

    apps.push({
      code: body.code.toUpperCase(),
      name: body.name || body.code,
      description: '',
      style: '',
      colors: '',
      restrictions: '',
      active: true,
      driveExists,
    })
  }

  await saveApps(apps)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  const apps = await getApps()
  const updated = apps.filter(a => a.code !== code)
  await saveApps(updated)

  return NextResponse.json({ success: true })
}
