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
