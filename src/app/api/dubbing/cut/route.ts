import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildPublicVideoUrl } from '@/lib/videoSign'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Вырезает кусок [startMs..endMs] исходного видео (перекодируем, чтобы Kling
// принял и чтобы стыки были чистыми) и заливает временным файлом REF_ в Drive.
// Возвращает fileId (для удаления после склейки) и подписанный публичный URL.
export const maxDuration = 120
const execFileAsync = promisify(execFile)
const ALLOWED = new Set(['valerii.lemberov@applyft.co'])
const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED.has(session.user.email || '')) return NextResponse.json({ error: 'Dubbing is in private beta' }, { status: 403 })
  const userToken = (session as any).accessToken
  if (!userToken) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  const { fileId, videoUrl, startMs, endMs } = await req.json()
  if (!fileId && !videoUrl) return NextResponse.json({ error: 'Video required' }, { status: 400 })

  let ffmpegPath: string
  try { ffmpegPath = (await import('ffmpeg-static')).default as unknown as string }
  catch { return NextResponse.json({ error: 'ffmpeg-static not installed' }, { status: 500 }) }

  const tmp = os.tmpdir(); const ts = Date.now()
  const inPath = path.join(tmp, `cut_in_${ts}.mp4`)
  const outPath = path.join(tmp, `cut_out_${ts}.mp4`)

  try {
    const url: string = fileId ? buildPublicVideoUrl(req.nextUrl.origin, fileId) : videoUrl!
    const r = await fetch(url); if (!r.ok) throw new Error(`fetch video ${r.status}`)
    await fs.writeFile(inPath, Buffer.from(await r.arrayBuffer()))

    const args = ['-y']
    if (typeof startMs === 'number') args.push('-ss', (startMs / 1000).toFixed(3))
    if (typeof endMs === 'number') args.push('-to', (endMs / 1000).toFixed(3))
    // -to задаётся ДО -i для точного seek от начала файла
    args.push('-i', inPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an', outPath)
    await execFileAsync(ffmpegPath, args, { timeout: 90000, maxBuffer: 1024 * 1024 * 20 })

    const buf = await fs.readFile(outPath)
    const boundary = 'cutb'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: `REF_cut_${ts}.mp4`, parents: [VIDEO_FOLDER_ID] }) +
        `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      buf, Buffer.from(`\r\n--${boundary}--`),
    ])
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      { method: 'POST', headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
    if (!up.ok) throw new Error(`Drive upload failed: ${await up.text()}`)
    const f = await up.json()
    return NextResponse.json({ fileId: f.id, url: buildPublicVideoUrl(req.nextUrl.origin, f.id) })
  } catch (e: any) {
    console.error('[dubbing/cut]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    for (const p of [inPath, outPath]) fs.unlink(p).catch(() => {})
  }
}
