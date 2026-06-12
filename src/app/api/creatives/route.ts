import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCreativesForApp } from '@/lib/googleDrive'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const appCode = searchParams.get('app')
  if (!appCode) return NextResponse.json({ error: 'app param required' }, { status: 400 })
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 10

  try {
    const creatives = await getCreativesForApp(appCode)
    const paginated = creatives.slice((page - 1) * limit, page * limit)
    
    return NextResponse.json({
      creatives: paginated,
      total: creatives.length,
      page,
      hasMore: creatives.length > page * limit,
    })
  } catch (error: any) {
    console.error('Drive error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
