import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const DRAFT_FOLDER_ID = '1GfOiLpEjAem8KAuyxmzzhLQCjBRgNSt9'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = session.accessToken
  if (!token) return NextResponse.json({ error: 'No access token in session' }, { status: 401 })

  try {
    const query = encodeURIComponent(
      `'${DRAFT_FOLDER_ID}' in parents and mimeType contains 'image' and trashed = false`
    )
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime%20desc&pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)

    const data = await res.json()
    const files = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      appCode: (f.name as string).split('_')[0] || '',
      createdTime: f.createdTime,
    }))

    return NextResponse.json({ files })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
