import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildPublicVideoUrl } from '@/lib/videoSign'

// Returns a signed public URL for a Drive video file (for Kling motion-control).
// Also exposes the Drive folder id used for direct browser uploads.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    // No id → return upload metadata (folder for direct-to-Drive uploads)
    return NextResponse.json({ folderId: process.env.VIDEO_DRIVE_FOLDER_ID || null })
  }

  return NextResponse.json({ url: buildPublicVideoUrl(req.nextUrl.origin, id) })
}
