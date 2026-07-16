import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { identifyFace, KlingFace } from '@/lib/kling'
import { buildPublicVideoUrl } from '@/lib/videoSign'

// Лица в исходном видео (с миниатюрами) — чтобы пользователь привязал говорящих
// к лицам. Kling иногда возвращает одного человека несколько раз (разные ракурсы) —
// схлопываем дубли через GPT-vision, чтобы в выборе был один человек = одна кнопка.

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

// Группирует лица по личности: возвращает индексы уникальных людей (по одному на человека)
async function dedupeFaces(faces: KlingFace[]): Promise<number[]> {
  if (faces.length <= 1) return faces.map((_, i) => i)
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const content: any[] = [{ type: 'text', text: 'Here are face crops, numbered from 0:' }]
    faces.forEach((f, i) => {
      content.push({ type: 'text', text: `#${i}:` })
      content.push({ type: 'image_url', image_url: { url: f.face_image, detail: 'low' } })
    })
    content.push({ type: 'text', text: 'Group them by identity (same person). Respond ONLY with raw JSON: array of groups, each group is an array of numbers, e.g. [[0,2],[1]]. Same person = same group.' })
    const res = await openai.chat.completions.create({
      model: 'gpt-4o', messages: [{ role: 'user', content }], max_tokens: 100, temperature: 0,
    }, { timeout: 30000 })
    const raw = res.choices[0]?.message?.content || ''
    const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const groups: number[][] = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1))
    // По одному представителю на группу (тот, кто дольше в кадре)
    return groups.map(g => g.reduce((best, i) =>
      (faces[i]?.end_time - faces[i]?.start_time) > (faces[best]?.end_time - faces[best]?.start_time) ? i : best, g[0]))
      .filter(i => faces[i])
  } catch (e: any) {
    console.warn('[faces] dedupe failed, returning all:', e.message)
    return faces.map((_, i) => i)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { fileId, videoUrl } = await req.json()
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!
    const { faces } = await identifyFace(url)
    const uniqueIdx = await dedupeFaces(faces)
    return NextResponse.json({
      faces: uniqueIdx.map(i => ({
        image: faces[i].face_image,
        startMs: faces[i].start_time,
        endMs: faces[i].end_time,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
