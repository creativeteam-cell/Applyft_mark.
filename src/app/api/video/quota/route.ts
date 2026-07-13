import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Kling account quota: GET /account/costs (free, QPS<=1, remaining has ~12h lag).
// Cached in memory for 10 minutes to respect the rate limit.
const KLING_BASE_URL = 'https://api-singapore.klingai.com'
const CACHE_TTL_MS = 10 * 60 * 1000

let cache: { at: number; data: any } | null = null

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data)
  }

  const key = process.env.KLING_API_KEY
  if (!key) return NextResponse.json({ error: 'KLING_API_KEY not set' }, { status: 500 })

  try {
    const now = Date.now()
    const start = now - 365 * 24 * 60 * 60 * 1000
    const end = now + 24 * 60 * 60 * 1000
    const res = await fetch(`${KLING_BASE_URL}/account/costs?start_time=${start}&end_time=${end}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    if (json.code !== 0) throw new Error(json.message || 'Kling quota request failed')

    const packs = (json.data?.resource_pack_subscribe_infos || []) as any[]
    const active = packs.filter(p => p.status === 'online')
    const remaining = active.reduce((s, p) => s + (p.remaining_quantity || 0), 0)
    const total = active.reduce((s, p) => s + (p.total_quantity || 0), 0)
    const nearestExpiry = active.length
      ? Math.min(...active.map(p => p.invalid_time || Infinity))
      : null

    const data = {
      remaining: Math.round(remaining * 10) / 10,
      total,
      ratio: total > 0 ? remaining / total : 0,
      expiresAt: nearestExpiry,
      packs: active.map(p => ({
        name: p.resource_pack_name,
        remaining: p.remaining_quantity,
        total: p.total_quantity,
        expiresAt: p.invalid_time,
      })),
    }
    cache = { at: Date.now(), data }
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[video/quota]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
