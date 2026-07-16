import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { elevenDialogue } from '@/lib/elevenlabs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Дубляж (новая схема): каждая реплика озвучивается ОТДЕЛЬНЫМ запросом → чистые
// границы, короткие реплики не теряются, чужие таймстемпы не нужны. Затем каждый
// файл подгоняется по длительности под свой слот из Scribe (atempo) и ставится
// на нужную позицию. Тайминги берём только от Scribe — они и есть эталон.
export const maxDuration = 210
const execFileAsync = promisify(execFile)
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

const MIN_TEMPO = 0.6, MAX_TEMPO = 1.6
function clampTempo(ratio: number): number {
  return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, ratio))
}

// Длительность mp3 (мс) через ffmpeg -i (парсим stderr "Duration: HH:MM:SS.ms")
async function mp3DurationMs(ffmpegPath: string, file: string): Promise<number> {
  try {
    await execFileAsync(ffmpegPath, ['-i', file], { timeout: 20000 })
  } catch (e: any) {
    const out = String(e.stderr || e.message || '')
    const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
    if (m) return Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000)
  }
  return 0
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { lines, totalMs } = await req.json() as {
    lines: { text: string; voiceId: string; dstStartMs: number; dstEndMs: number }[]
    totalMs: number
  }
  if (!lines?.length) return NextResponse.json({ error: 'lines required' }, { status: 400 })

  let ffmpegPath: string
  try { ffmpegPath = (await import('ffmpeg-static')).default as unknown as string }
  catch { return NextResponse.json({ error: 'ffmpeg-static not installed' }, { status: 500 }) }

  const tmp = os.tmpdir(); const ts = Date.now()
  const LEAD_MS = 80
  const FADE = 0.015
  const cleanup: string[] = []

  try {
    // 1. Генерим каждую реплику отдельно + измеряем длину
    const lineFiles: { file: string; durMs: number; dstStartMs: number; dstEndMs: number }[] = []
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      if (!ln.text.trim()) continue
      const buf = await elevenDialogue([{ text: ln.text.trim(), voice_id: ln.voiceId }])
      const f = path.join(tmp, `vl_${ts}_${i}.mp3`)
      cleanup.push(f)
      await fs.writeFile(f, buf)
      const durMs = await mp3DurationMs(ffmpegPath, f)
      lineFiles.push({ file: f, durMs: durMs || (ln.dstEndMs - ln.dstStartMs), dstStartMs: ln.dstStartMs, dstEndMs: ln.dstEndMs })
    }
    if (!lineFiles.length) throw new Error('no audio generated')

    // 2. Собираем дорожку: каждый файл → atempo под слот → фейды → задержка до dst
    const inputs: string[] = []
    const filters: string[] = []
    lineFiles.forEach((lf, i) => {
      inputs.push('-i', lf.file)
      const slotMs = Math.max(1, lf.dstEndMs - lf.dstStartMs)
      const ratio = clampTempo(lf.durMs / slotMs) // ограничен 0.6–1.6, чтоб голос не искажался
      const delay = Math.round(lf.dstStartMs + LEAD_MS)
      // Fade по ФАКТИЧЕСКОЙ длине после ускорения (durMs/ratio), а не по слоту —
      // иначе при сильном ускорении слово обрезается на границе слота.
      // Если реплика не влезла в слот — пусть чуть зайдёт в паузу, слово целое важнее.
      const resultDurSec = (lf.durMs / ratio) / 1000
      const fadeOutSt = Math.max(FADE, resultDurSec - FADE)
      const chain = [
        `atempo=${ratio.toFixed(4)}`,
        `afade=t=in:st=0:d=${FADE}`,
        `afade=t=out:st=${fadeOutSt.toFixed(3)}:d=${FADE}`,
        `adelay=${delay}|${delay}`,
      ].join(',')
      filters.push(`[${i}:a]${chain}[a${i}]`)
    })
    const mix = `${lineFiles.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lineFiles.length}:normalize=0,` +
      `apad=whole_dur=${((totalMs + LEAD_MS) / 1000).toFixed(3)}[aout]`

    const outPath = path.join(tmp, `vl_out_${ts}.mp3`)
    cleanup.push(outPath)
    await execFileAsync(ffmpegPath, [
      '-y', ...inputs, '-filter_complex', `${filters.join(';')};${mix}`,
      '-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', '192k', outPath,
    ], { timeout: 150000, maxBuffer: 1024 * 1024 * 30 })

    const out = await fs.readFile(outPath)
    return NextResponse.json({ audioBase64: out.toString('base64') })
  } catch (e: any) {
    console.error('[dubbing/voice-lines]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    for (const p of cleanup) fs.unlink(p).catch(() => {})
  }
}
