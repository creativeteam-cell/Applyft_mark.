import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLocalizationFoldersForApp } from '@/lib/googleDrive'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  const q = searchParams.get('q')?.trim()

  if (!appCode) return NextResponse.json({ error: 'app param required' }, { status: 400 })
  if (!q) return NextResponse.json({ folders: [] })

  try {
    // Uses 10-min cache — no extra Drive calls when warm
    const all = await getLocalizationFoldersForApp(appCode)
    const folders = all.filter(f => f.name.includes(`_${q}_`))
    return NextResponse.json({ folders })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
