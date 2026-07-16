import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildPublicVideoUrl } from '@/lib/videoSign'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Финал дубляжа: заменяем аудиодорожку видео на полную озвучку (mp3) и сохраняем
// в Drive. Нужно, потому что проходы липсинка несут только свои куски звука —
// закадровые реплики в них отсутствуют.
// Требует пакет ffmpeg-static: npm i ffmpeg-static
export const maxDuration = 300 // Vercel Pro: до 300с

const execFileAsync = promisify(execFile)

// Закрытая бета
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])

const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })

  const userToken = (session as any).accessToken
  if (!userToken) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  const { fileId, videoUrl, audioBase64, prompt, targetLang, duration, align } = await req.json() as {
    fileId?: string; videoUrl?: string; audioBase64: string
    prompt?: string; targetLang?: string; duration?: string
    // Выравнивание: кусок [srcStartMs..srcEndMs] из озвучки кладётся на dstStartMs
    // видео (тайминги оригинальных реплик) — паузы видео сохраняются в аудио
    align?: { srcStartMs: number; srcEndMs: number; dstStartMs: number }[]
  }
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })
  if (!audioBase64) return NextResponse.json({ error: 'audioBase64 required' }, { status: 400 })

  const tmp = os.tmpdir()
  const ts = Date.now()
  const vidPath = path.join(tmp, `dub_in_${ts}.mp4`)
  const audPath = path.join(tmp, `dub_a_${ts}.mp3`)
  const outPath = path.join(tmp, `dub_out_${ts}.mp4`)

  try {
    // ffmpeg-static — динамический импорт, чтобы не ломать сборку без пакета
    let ffmpegPath: string
    try {
      ffmpegPath = (await import('ffmpeg-static')).default as unknown as string
    } catch {
      return NextResponse.json({ error: 'ffmpeg-static is not installed — run: npm i ffmpeg-static' }, { status: 500 })
    }

    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!
    const videoRes = await fetch(url)
    if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`)
    await fs.writeFile(vidPath, Buffer.from(await videoRes.arrayBuffer()))
    await fs.writeFile(audPath, Buffer.from(String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64'))

    // Видео не перекодируем (copy), звук — в AAC; -shortest на случай расхождения длин
    if (align?.length) {
      // Раскладка озвучки по оригинальным таймингам: каждый кусок вырезается
      // из mp3 и задерживается до позиции реплики в видео, затем сводится
      const parts = align.map((a, i) =>
        `[1:a]atrim=start=${(a.srcStartMs / 1000).toFixed(3)}:end=${(a.srcEndMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(a.dstStartMs)}|${Math.round(a.dstStartMs)}[a${i}]`
      )
      const filter = `${parts.join(';')};${align.map((_, i) => `[a${i}]`).join('')}amix=inputs=${align.length}:normalize=0[aout]`
      await execFileAsync(ffmpegPath, [
        '-y', '-i', vidPath, '-i', audPath,
        '-filter_complex', filter,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', outPath,
      ], { timeout: 120000 })
    } else {
      await execFileAsync(ffmpegPath, [
        '-y', '-i', vidPath, '-i', audPath,
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', outPath,
      ], { timeout: 120000 })
    }

    const outBuffer = await fs.readFile(outPath)

    // Сохраняем в Drive (по образцу /api/video/save)
    const tsName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeName = (session.user.name || 'user').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
    const fileName = `VID_dubbing_${targetLang || ''}_${safeName}_${tsName}.mp4`
    const metadata = {
      prompt: prompt || `[dubbed → ${targetLang}]`,
      model: 'dubbing', duration: duration || '0', aspectRatio: '', sound: 'on',
      inputType: 'dubbing', klingVideoId: '',
      userName: session.user.name || '', userEmail: session.user.email || '', userImage: session.user.image || '',
    }
    const boundary = 'dubboundary42'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: fileName, parents: [VIDEO_FOLDER_ID], description: JSON.stringify(metadata) }) +
        `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      outBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      }
    )
    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`)
    const file = await uploadRes.json()

    return NextResponse.json({ fileId: file.id })
  } catch (e: any) {
    console.error('[dubbing/finalize]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    // Чистим временные файлы
    for (const p of [vidPath, audPath, outPath]) fs.unlink(p).catch(() => {})
  }
}
