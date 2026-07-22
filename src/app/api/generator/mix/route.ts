import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { updateQueue } from '@/lib/queue'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Смешивает короткий промпт пользователя с большой заготовкой,
// не теряя ни одной ключевой детали пользователя.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userPrompt, templateBody } = await req.json() as {
    userPrompt: string
    templateBody: string
  }

  if (!templateBody?.trim()) {
    return NextResponse.json({ error: 'templateBody required' }, { status: 400 })
  }

  const sys = `You merge a short USER PROMPT into a large detailed PRE-PROMPT TEMPLATE to produce one final, complete image-generation prompt.

Hard rules:
- Every concrete detail, subject, object, action, color, text and instruction from the USER PROMPT MUST appear in the result. Never drop or soften anything the user asked for — the user's intent has top priority and overrides the template on any conflict.
- Keep ALL the rich structure, detail and quality guidance of the TEMPLATE that does not contradict the user.
- Do not invent facts that contradict either input. You may add descriptive detail that is consistent with both.
- Write in English, as a single cohesive prompt (not a list of the two sources).
- Return ONLY the final merged prompt text, no explanations, no headings.`

  const user = `[PRE-PROMPT TEMPLATE]:
${templateBody.trim()}

[USER PROMPT]:
${userPrompt?.trim() || '(empty — use the template as-is)'}`

  try {
    await updateQueue('openai', 1)
    let mixed: string
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }, { timeout: 55000 })
      mixed = res.choices[0]?.message?.content?.trim() || `${templateBody.trim()}\n\n${userPrompt?.trim() || ''}`.trim()
    } finally {
      await updateQueue('openai', -1)
    }
    return NextResponse.json({ mixed })
  } catch (e: any) {
    console.error('[mix]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
