import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

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

    const contentType = res.headers['content-type'] || 'image/jpeg'
    const isDownload = req.nextUrl.searchParams.get('download') === '1'

    return new NextResponse(Buffer.from(res.data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        ...(isDownload ? { 'Content-Disposition': `attachment; filename="generated-${params.id}.jpg"` } : {}),
      },
    })
  } catch (e: any) {
    console.error('[generator/image]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userToken = (session as any).accessToken
  if (!userToken) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${params.id}?supportsAllDrives=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${userToken}` } }
    )
    if (!res.ok && res.status !== 204) {
      const err = await res.text()
      throw new Error(err)
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[generator/image/delete]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
