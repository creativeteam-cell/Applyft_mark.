import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

const VIDEO_FOLDER_ID = process.env.VIDEO_DRIVE_FOLDER_ID!

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { videoUrl, klingVideoId, prompt, model, duration, aspectRatio, sound, inputType } = await req.json()
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  try {
    // Download video from Kling CDN
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
      aspectRatio: aspectRatio || '16:9',
      sound: sound || 'off',
      inputType: inputType || 'text',
      klingVideoId: klingVideoId || '',
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      userImage: session.user.image || '',
    }

    const drive = getDriveClient()
    const res = await (drive.files.create as any)({
      requestBody: {
        name: fileName,
        parents: [VIDEO_FOLDER_ID],
        mimeType: 'video/mp4',
        description: JSON.stringify(metadata),
      },
      media: {
        mimeType: 'video/mp4',
        body: Readable.from(videoBuffer),
      },
      supportsAllDrives: true,
      fields: 'id,webViewLink,thumbnailLink',
    })

    const file = res.data as any
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
