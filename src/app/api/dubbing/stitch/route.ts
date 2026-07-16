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
export const maxDuration = 210
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

    // Склейка через concat-ФИЛЬТР (не демуксер): куски от Kling и нарезанные имеют
    // разные разрешение/кодек/fps — демуксер такие молча выкидывает (оставались
    // только первый и последний). Фильтр приводит каждый вход к общему WxH/fps.
    const inputs: string[] = []
    const norm: string[] = []
    clipPaths.forEach((p, i) => {
      inputs.push('-i', p)
      norm.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
    })
    const concatFilter = `${norm.join(';')};${clipPaths.map((_, i) => `[v${i}]`).join('')}concat=n=${clipPaths.length}:v=1:a=0[outv]`
    await execFileAsync(ffmpegPath, [
      '-y', ...inputs, '-filter_complex', concatFilter,
      '-map', '[outv]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an', concatPath,
    ], { timeout: 180000, maxBuffer: 1024 * 1024 * 60 })

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
