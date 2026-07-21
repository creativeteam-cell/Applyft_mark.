import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { incrementVideoUnits } from '@/lib/adminStats'

const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userToken = (session as any).accessToken
  if (!userToken) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  const { videoUrl, klingVideoId, prompt, model, duration, aspectRatio, sound, inputType, units, refThumb } = await req.json()
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  try {
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`)
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer())

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeName = (session.user.name || 'user').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
    const fileName = `VID_${model}_${duration}s_${safeName}_${ts}.mp4`

    const metadata = {
      prompt: prompt || '',
      model: model || 'kling-v3',
      duration: duration || '5',
      aspectRatio: aspectRatio || '',
      sound: sound || 'off',
      inputType: inputType || 'text',
      klingVideoId: klingVideoId || '',
      refThumb: refThumb || '', // мини-превью первого кадра (если было)
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      userImage: session.user.image || '',
    }

    const boundary = 'vidboundary123'
    const metaPart = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: fileName, parents: [VIDEO_FOLDER_ID], description: JSON.stringify(metadata) }) +
      `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`
    )
    const endPart = Buffer.from(`\r\n--${boundary}--`)
    const body = Buffer.concat([metaPart, videoBuffer, endPart])

    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,thumbnailLink`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`Drive upload failed: ${err}`)
    }

    const file = await uploadRes.json()

    // Track unit usage (fire-and-forget)
    if (units && units > 0 && session.user.email) {
      incrementVideoUnits(session.user.email, Number(units)).catch(() => {})
    }

    return NextResponse.json({
      fileId: file.id,
      webViewLink: file.webViewLink || null,
      thumbnailLink: file.thumbnailLink || null,
    })
  } catch (e: any) {
    console.error('[video/save]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
