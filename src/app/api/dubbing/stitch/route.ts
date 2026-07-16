import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildPublicVideoUrl } from '@/lib/videoSign'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Склейка кусков дубляжа: конкатенируем видео по порядку (без их звука),
// затем кладём поверх единую выровненную озвучку. Длительности кусков = оригинал,
// поэтому синхронизация сохраняется. Итог сохраняем в Drive и чистим временные куски.
export const maxDuration = 300 // Vercel Pro: до 300с
const execFileAsync = promisify(execFile)
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])
const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })
  const userToken = (session as any).accessToken
  if (!userToken) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  const { clipUrls, audioBase64, tempFileIds, prompt, targetLang, duration } = await req.json() as {
    clipUrls: string[]         // куски по порядку (URL)
    audioBase64: string        // выровненная полная озвучка
    tempFileIds?: string[]     // временные куски в Drive на удаление
    prompt?: string; targetLang?: string; duration?: string
  }
  if (!clipUrls?.length || !audioBase64) return NextResponse.json({ error: 'clipUrls and audioBase64 required' }, { status: 400 })

  let ffmpegPath: string
  try { ffmpegPath = (await import('ffmpeg-static')).default as unknown as string }
  catch { return NextResponse.json({ error: 'ffmpeg-static not installed' }, { status: 500 }) }

  const tmp = os.tmpdir(); const ts = Date.now()
  const clipPaths: string[] = []
  const audPath = path.join(tmp, `st_a_${ts}.mp3`)
  const listPath = path.join(tmp, `st_list_${ts}.txt`)
  const concatPath = path.join(tmp, `st_cat_${ts}.mp4`)
  const outPath = path.join(tmp, `st_out_${ts}.mp4`)
  const cleanup = [audPath, listPath, concatPath, outPath]

  try {
    // Скачиваем куски
    for (let i = 0; i < clipUrls.length; i++) {
      const cp = path.join(tmp, `st_c${i}_${ts}.mp4`)
      clipPaths.push(cp); cleanup.push(cp)
      const r = await fetch(clipUrls[i]); if (!r.ok) throw new Error(`fetch clip ${i}: ${r.status}`)
      await fs.writeFile(cp, Buffer.from(await r.arrayBuffer()))
    }
    await fs.writeFile(audPath, Buffer.from(String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64'))

    // Определяем целевое разрешение по первому куску (нарезанному из оригинала)
    let W = 1080, H = 1920
    try {
      await execFileAsync(ffmpegPath, ['-i', clipPaths[0]], { timeout: 20000 })
    } catch (e: any) {
      const m = String(e.stderr || e.message || '').match(/,\s*(\d{2,5})x(\d{2,5})/)
      if (m) { W = +m[1]; H = +m[2] }
    }

    // Два лёгких этапа вместо одного тяжёлого concat-фильтра (он не укладывался
    // в лимит на длинных роликах):
    // 1) нормализуем КАЖДЫЙ кусок по отдельности к общему WxH/fps30 (быстро, параллельно)
    // 2) склеиваем одинаковые куски демуксером с -c copy (без перекодирования — мгновенно)
    // Нормализуем ПОСЛЕДОВАТЕЛЬНО (не параллельно) — параллельные ffmpeg-энкодеры
    // разом съедали память функции и роняли её (500). По одному — памяти хватает.
    const normPaths: string[] = []
    for (let i = 0; i < clipPaths.length; i++) {
      const np = path.join(tmp, `st_n${i}_${ts}.mp4`)
      normPaths.push(np); cleanup.push(np)
      await execFileAsync(ffmpegPath, [
        '-y', '-i', clipPaths[i],
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
        '-vsync', 'cfr', '-r', '30',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an',
        '-video_track_timescale', '15360', np,
      ], { timeout: 120000, maxBuffer: 1024 * 1024 * 20 })
    }
    await fs.writeFile(listPath, normPaths.map(p => `file '${p}'`).join('\n'))
    await execFileAsync(ffmpegPath, [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatPath,
    ], { timeout: 60000, maxBuffer: 1024 * 1024 * 20 })

    // Накладываем озвучку
    await execFileAsync(ffmpegPath, [
      '-y', '-i', concatPath, '-i', audPath,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 * 40 })

    const buf = await fs.readFile(outPath)
    const tsName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safe = (session.user.name || 'user').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
    const meta = {
      prompt: prompt || `[dubbed → ${targetLang}]`, model: 'dubbing', duration: duration || '0',
      aspectRatio: '', sound: 'on', inputType: 'dubbing', klingVideoId: '',
      userName: session.user.name || '', userEmail: session.user.email || '', userImage: session.user.image || '',
    }
    const boundary = 'stb'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: `VID_dubbing_${targetLang || ''}_${safe}_${tsName}.mp4`, parents: [VIDEO_FOLDER_ID], description: JSON.stringify(meta) }) +
        `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      buf, Buffer.from(`\r\n--${boundary}--`),
    ])
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      { method: 'POST', headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
    if (!up.ok) throw new Error(`Drive upload failed: ${await up.text()}`)
    const f = await up.json()

    // Чистим временные куски в Drive
    if (Array.isArray(tempFileIds)) {
      await Promise.all(tempFileIds.map(id =>
        fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${userToken}` } }).catch(() => {})))
    }
    return NextResponse.json({ fileId: f.id })
  } catch (e: any) {
    console.error('[dubbing/stitch]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    for (const p of cleanup) fs.unlink(p).catch(() => {})
  }
}
