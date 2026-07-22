import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTemplates, getTemplatesCached, saveTemplates, normalizeCommand, PromptTemplate } from '@/lib/promptTemplatesStore'

// Список заготовок (отсортирован по использованиям, чаще — первыми)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { templates } = await getTemplatesCached()
  templates.sort((a, b) => b.uses - a.uses)
  return NextResponse.json({ templates })
}

// Создание новой заготовки
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, command, body } = await req.json()
  const cmd = normalizeCommand(command)
  if (!name?.trim() || !cmd || !body?.trim()) {
    return NextResponse.json({ error: 'Name, command and body are required' }, { status: 400 })
  }

  const data = await getTemplates()
  if (data.templates.some(t => t.command === cmd)) {
    return NextResponse.json({ error: `Command /${cmd} is already taken` }, { status: 409 })
  }

  const template: PromptTemplate = {
    id: `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 60),
    command: cmd,
    body: body.trim().slice(0, 8000),
    uses: 0,
    createdBy: session.user.email,
    createdByName: session.user.name || session.user.email,
    createdAt: new Date().toISOString(),
  }
  data.templates.push(template)
  await saveTemplates(data)
  return NextResponse.json({ template })
}

// Редактирование / инкремент счётчика
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, command, body, incrementUse } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getTemplates()
  const template = data.templates.find(t => t.id === id)
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Инкремент использования доступен всем; правки — только автору
  if (incrementUse) {
    template.uses += 1
    await saveTemplates(data)
    return NextResponse.json({ success: true })
  }

  if (template.createdBy !== session.user.email) {
    return NextResponse.json({ error: 'Only the author can edit this template' }, { status: 403 })
  }
  if (typeof name === 'string' && name.trim()) template.name = name.trim().slice(0, 60)
  if (typeof command === 'string') {
    const cmd = normalizeCommand(command)
    if (cmd && cmd !== template.command) {
      if (data.templates.some(t => t.command === cmd && t.id !== id)) {
        return NextResponse.json({ error: `Command /${cmd} is already taken` }, { status: 409 })
      }
      template.command = cmd
    }
  }
  if (typeof body === 'string' && body.trim()) template.body = body.trim().slice(0, 8000)
  await saveTemplates(data)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data = await getTemplates()
  const template = data.templates.find(t => t.id === id)
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (template.createdBy !== session.user.email) {
    return NextResponse.json({ error: 'Only the author can delete this template' }, { status: 403 })
  }
  data.templates = data.templates.filter(t => t.id !== id)
  await saveTemplates(data)
  return NextResponse.json({ success: true })
}
