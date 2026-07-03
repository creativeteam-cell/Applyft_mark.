import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const drive = getDriveClient()
    const res = await (drive.files.get as any)(
      { fileId: params.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    ) as any

    const isDownload = req.nextUrl.searchParams.get('download') === '1'
    return new NextResponse(Buffer.from(res.data), {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, max-age=3600',
        ...(isDownload ? { 'Content-Disposition': `attachment; filename="video-${params.id}.mp4"` } : {}),
      },
    })
  } catch (e: any) {
    console.error('[video/file]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const drive = getDriveClient()
    await (drive.files.delete as any)({ fileId: params.id, supportsAllDrives: true })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
