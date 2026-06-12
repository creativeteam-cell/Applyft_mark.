import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const DRAFT_FOLDER_ID = '1GfOiLpEjAem8KAuyxmzzhLQCjBRgNSt9'

async function uploadToDraft(token: string, name: string, base64: string) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
  const imageBuffer = Buffer.from(base64Data, 'base64')
  const boundary = 'draft_boundary_271828'
  const metadata = JSON.stringify({ name, parents: [DRAFT_FOLDER_ID] })

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(body.length),
      },
      body,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Upload failed: ${err}`)
  }

  return await res.json() as { id: string; name: string }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use the user's own OAuth token — service accounts have no personal storage quota
  const token = session.accessToken
  if (!token) return NextResponse.json({ error: 'No access token in session' }, { status: 401 })

  const { imageBase64, appCode } = await req.json()
  if (!imageBase64 || !appCode) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  try {
    const fileName = `${appCode}_draft_${Date.now()}.jpg`
    const file = await uploadToDraft(token, fileName, imageBase64)
    return NextResponse.json({ fileId: file.id, fileName: file.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
