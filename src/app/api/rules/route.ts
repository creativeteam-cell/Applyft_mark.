import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRules, saveRules } from '@/lib/rulesStore'

// Управление выученными правилами (страница Settings → Learned Rules)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getRules()
  // Сортировка: активные и тяжёлые сверху
  data.rules.sort((a, b) => (Number(b.active) - Number(a.active)) || (b.weight - a.weight))
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, active, rule } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getRules()
  const target = data.rules.find(r => r.id === id)
  if (!target) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  if (typeof active === 'boolean') target.active = active
  if (typeof rule === 'string' && rule.trim()) target.rule = rule.trim()
  target.updatedAt = new Date().toISOString()

  await saveRules(data)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getRules()
  const before = data.rules.length
  data.rules = data.rules.filter(r => r.id !== id)
  if (data.rules.length === before) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  await saveRules(data)
  return NextResponse.json({ success: true })
}
