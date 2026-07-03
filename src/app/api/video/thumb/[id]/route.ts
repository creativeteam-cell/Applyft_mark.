import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAuthClient, getDriveClient } from '@/lib/googleDrive'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const drive = getDriveClient()

    // Get thumbnailLink for this file
    const meta = await (drive.files.get as any)({
      fileId: params.id,
      fields: 'thumbnailLink',
      supportsAllDrives: true,
    }) as any

    const thumbUrl: string | undefined = meta.data?.thumbnailLink
    if (!thumbUrl) {
      return NextResponse.json({ error: 'No thumbnail available' }, { status: 404 })
    }

    // Get service account access token to authenticate the thumbnail fetch
    const auth = getAuthClient()
    const tokenRes = await auth.getAccessToken()
    const token = typeof tokenRes === 'string' ? tokenRes : (tokenRes as any)?.token

    // Request a larger thumbnail
    const fetchUrl = thumbUrl.replace(/=s\d+$/, '=s600').replace(/&sz=\d+/, '&sz=600')

    const response = await fetch(fetchUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Thumbnail fetch failed' }, { status: 404 })
    }

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e: any) {
    console.error('[video/thumb]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
