import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = (session as any).accessToken
  if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  const { fileId } = await req.json()
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok && res.status !== 204) {
      const err = await res.text()
      throw new Error(err)
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    // Don't fail hard — draft cleanup is best-effort
    console.error('[draft/delete]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
