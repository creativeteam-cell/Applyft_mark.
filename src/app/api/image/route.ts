import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('id')
  
  if (!fileId) {
    return new NextResponse('Missing file ID', { status: 400 })
  }

  try {
    const drive = getDriveClient()
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(response.data as ArrayBuffer)
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // кешируем на 24 часа
      },
    })
  } catch (error: any) {
    console.error('Image proxy error:', error)
    return new NextResponse('Image not found', { status: 404 })
  }
}
