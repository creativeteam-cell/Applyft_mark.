import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient } from '@/lib/googleDrive'
import { verifyVideoSig } from '@/lib/videoSign'

// Public (signature-protected) video proxy — lets Kling fetch reference videos
// stored in Drive. No session required; access is gated by the HMAC token.
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sig = req.nextUrl.searchParams.get('t') || ''
  if (!verifyVideoSig(params.id, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  try {
    const drive = getDriveClient()
    const res = await (drive.files.get as any)(
      { fileId: params.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    ) as any

    return new NextResponse(Buffer.from(res.data), {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e: any) {
    console.error('[video/public]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
