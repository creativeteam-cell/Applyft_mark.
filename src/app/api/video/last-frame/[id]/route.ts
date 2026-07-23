import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'
import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

export const runtime = 'nodejs'
export const maxDuration = 60

// Достаём последний кадр видео из Drive через ffmpeg и отдаём как картинку на скачивание.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '')
  const inPath = join(tmpdir(), `lf_${safeId}_${Date.now()}.mp4`)
  const outPath = join(tmpdir(), `lf_${safeId}_${Date.now()}.jpg`)

  try {
    // 1. Скачиваем видео из Drive (service account)
    const drive = getDriveClient()
    const res = await (drive.files.get as any)(
      { fileId: params.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    ) as any
    await writeFile(inPath, Buffer.from(res.data))

    // 2. ffmpeg: seek к концу и перезаписываем кадр, пока не останется последний
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegPath as unknown as string, [
        '-y',
        '-sseof', '-1',       // начать за 1 сек до конца
        '-i', inPath,
        '-update', '1',        // перезаписывать один и тот же файл
        '-q:v', '2',           // высокое качество JPEG
        outPath,
      ])
      let err = ''
      ff.stderr.on('data', d => { err += d.toString() })
      ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.slice(-400))))
      ff.on('error', reject)
    })

    const img = await readFile(outPath)
    return new NextResponse(img, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="last-frame-${safeId}.jpg"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e: any) {
    console.error('[video/last-frame]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    unlink(inPath).catch(() => {})
    unlink(outPath).catch(() => {})
  }
}
