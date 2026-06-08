import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getConfig, saveConfig } from '@/lib/appsStore'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getConfig()
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const config = await getConfig()

  if (body.type === 'marketers') {
    config.marketers = body.data
  } else {
    // type === 'app'
    const app = body.data
    const existing = config.apps.findIndex(a => a.code === app.code)
    if (existing >= 0) {
      config.apps[existing] = { ...config.apps[existing], ...app }
    } else {
      config.apps.push({
        code: app.code.toUpperCase(),
        name: app.name || app.code,
        description: '',
        painPoints: [],
        hooks: [],
        logos: [],
        active: true,
      })
    }
  }

  await saveConfig(config)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  const config = await getConfig()
  config.apps = config.apps.filter(a => a.code !== code)
  await saveConfig(config)

  return NextResponse.json({ success: true })
}
