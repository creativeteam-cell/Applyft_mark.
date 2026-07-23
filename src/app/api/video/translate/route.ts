import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'
import { createOmniVideoTask } from '@/lib/kling'
import OpenAI from 'openai'
import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

export const runtime = 'nodejs'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Достаём кадр из видео через ffmpeg. mode 'first' | 'last'. Возвращает base64 (без префикса).
function extractFrame(inPath: string, outPath: string, mode: 'first' | 'last'): Promise<void> {
  const args = mode === 'last'
    ? ['-y', '-sseof', '-1', '-i', inPath, '-update', '1', '-q:v', '2', outPath]
    : ['-y', '-i', inPath, '-frames:v', '1', '-q:v', '2', outPath]
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath as unknown as string, args)
    let err = ''
    ff.stderr.on('data', d => { err += d.toString() })
    ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.slice(-300))))
    ff.on('error', reject)
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fileId, langName, prompt, duration } = await req.json() as {
    fileId: string; langName: string; prompt: string; duration: string
  }
  if (!fileId || !langName) return NextResponse.json({ error: 'fileId and langName required' }, { status: 400 })

  const safeId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '')
  const stamp = Date.now()
  const inPath = join(tmpdir(), `tr_${safeId}_${stamp}.mp4`)
  const firstPath = join(tmpdir(), `tr_${safeId}_${stamp}_f.jpg`)
  const lastPath = join(tmpdir(), `tr_${safeId}_${stamp}_l.jpg`)

  try {
    // 1. Переводим реплики через GPT (только произносимый текст, остальное 1:1).
    //    Делаем это ПЕРВЫМ — если речи нет, не тратим генерацию Kling.
    const sys = `You localize AI video-generation prompts. The prompt describes a video and includes spoken DIALOGUE / VOICE lines (usually in quotes after labels like DIALOGUE or VOICE).
Translate ONLY the words a character actually SPEAKS (dialogue, voice-over, lyrics) into ${langName}.
Keep EVERYTHING else byte-for-byte identical and in the original language: scene description, camera, character appearance, sound-effect descriptions, timing, and labels themselves (e.g. "DIALOGUE (0:00-0:03):").
Return STRICT JSON: {"translated": string, "hasDialogue": boolean}. Set hasDialogue=false only if there are truly no spoken lines to translate.`

    let translated = prompt || ''
    let hasDialogue = true
    try {
      const gpt = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt || '' }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1500,
      }, { timeout: 45000 })
      const parsed = JSON.parse(gpt.choices[0]?.message?.content || '{}')
      if (typeof parsed.translated === 'string' && parsed.translated.trim()) translated = parsed.translated
      hasDialogue = parsed.hasDialogue !== false
    } catch (e) {
      console.warn('[translate] GPT parse failed, using original prompt', e)
    }

    if (!hasDialogue) {
      return NextResponse.json({ error: 'No spoken dialogue found in this video to translate.' }, { status: 422 })
    }

    // 2. Скачиваем видео и достаём первый кадр для целостности.
    //    (last_frame endpoint omni-video отклоняет — оставляем замок по первому кадру.)
    const drive = getDriveClient()
    const dl = await (drive.files.get as any)(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    ) as any
    await writeFile(inPath, Buffer.from(dl.data))
    await extractFrame(inPath, firstPath, 'first')
    const firstB64 = (await readFile(firstPath)).toString('base64')

    // 3. Регенерация на Omni с переведёнными репликами, звук вкл, первый кадр
    const dur = String(Math.min(Number(duration) || 5, 15))
    const { task_id } = await createOmniVideoTask({
      model_name: 'kling-v3-omni',
      prompt: translated,
      first_frame: firstB64,
      duration: dur,
      mode: 'pro',
      sound: 'on',
    })

    return NextResponse.json({ task_id, translatedPrompt: translated, duration: dur })
  } catch (e: any) {
    console.error('[video/translate]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    unlink(inPath).catch(() => {})
    unlink(firstPath).catch(() => {})
    unlink(lastPath).catch(() => {})
  }
}
