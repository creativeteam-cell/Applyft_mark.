import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Выравнивание озвучки под тайминг оригинала:
// каждая реплика вырезается из сгенерированного mp3, растягивается/сжимается
// (atempo, без изменения тона) до длительности оригинальной реплики и ставится
// на её оригинальную позицию. Паузы видео сохраняются. На выходе — единая
// дорожка той же длины, что видео; тайминги реплик = оригинальные.
export const maxDuration = 210

const execFileAsync = promisify(execFile)
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

// atempo умеет 0.5–2.0 за раз; для читаемости ограничиваем комфортным диапазоном,
// чтобы голос не звучал как бурундук / замедленная плёнка
function atempoChain(ratio: number): string {
  const r = Math.max(0.6, Math.min(1.6, ratio))
  return `atempo=${r.toFixed(4)}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const { audioBase64, segments, totalMs } = await req.json() as {
    audioBase64: string
    // srcStartMs/srcEndMs — где реплика в сгенерированном mp3;
    // dstStartMs/dstEndMs — где она должна стоять по оригиналу
    segments: { srcStartMs: number; srcEndMs: number; dstStartMs: number; dstEndMs: number }[]
    totalMs: number
  }
  if (!audioBase64 || !segments?.length) return NextResponse.json({ error: 'audioBase64 and segments required' }, { status: 400 })

  let ffmpegPath: string
  try {
    ffmpegPath = (await import('ffmpeg-static')).default as unknown as string
  } catch {
    return NextResponse.json({ error: 'ffmpeg-static not installed' }, { status: 500 })
  }

  const tmp = os.tmpdir()
  const ts = Date.now()
  const inPath = path.join(tmp, `align_in_${ts}.mp3`)
  const outPath = path.join(tmp, `align_out_${ts}.mp3`)
  const cleanup = [inPath, outPath]

  try {
    await fs.writeFile(inPath, Buffer.from(String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64'))

    // Общая подушка в начало (80мс): защищает атаку первого слова, но почти
    // не создаёт отставания аудио от губ. Должна совпадать с LEAD_MS на клиенте.
    const LEAD_MS = 80

    // Каждую реплику берём по её собственным границам от ElevenLabs (без обрезки
    // «в стык» — она резала слова). Небольшой запас справа НЕ добавляем, чтобы не
    // хватать начало следующей фразы (это давало эхо).
    // Для каждой реплики: обрезка → atempo до целевой длины → короткий фейд по
    // краям (убирает щелчки) → задержка до dst
    const FADE = 0.015 // 15мс, на слух незаметно
    const filters: string[] = []
    segments.forEach((s, i) => {
      const srcDur = Math.max(1, s.srcEndMs - s.srcStartMs)
      const dstDur = Math.max(1, s.dstEndMs - s.dstStartMs)
      const ratio = srcDur / dstDur // >1 = ускорить (реплика длиннее слота)
      const delay = Math.round(s.dstStartMs + LEAD_MS)
      const outDurSec = dstDur / 1000
      const fadeOutSt = Math.max(0, outDurSec - FADE)
      const chain = [
        `atrim=start=${(s.srcStartMs / 1000).toFixed(3)}:end=${(s.srcEndMs / 1000).toFixed(3)}`,
        'asetpts=PTS-STARTPTS',
        atempoChain(ratio),
        `afade=t=in:st=0:d=${FADE}`,
        `afade=t=out:st=${fadeOutSt.toFixed(3)}:d=${FADE}`,
        `adelay=${delay}|${delay}`,
      ].join(',')
      filters.push(`[0:a]${chain}[a${i}]`)
    })
    const mix = `${segments.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segments.length}:normalize=0,` +
      `apad=whole_dur=${((totalMs + LEAD_MS) / 1000).toFixed(3)}[aout]`
    const filterComplex = `${filters.join(';')};${mix}`

    await execFileAsync(ffmpegPath, [
      '-y', '-i', inPath,
      '-filter_complex', filterComplex,
      '-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', '192k',
      outPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 * 20 })

    const out = await fs.readFile(outPath)
    return NextResponse.json({ audioBase64: out.toString('base64') })
  } catch (e: any) {
    console.error('[dubbing/align]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    for (const p of cleanup) fs.unlink(p).catch(() => {})
  }
}
