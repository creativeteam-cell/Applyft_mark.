import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDriveClient } from '@/lib/googleDrive'

const DRAFT_FOLDER_ID = '1GfOiLpEjAem8KAuyxmzzhLQCjBRgNSt9'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${DRAFT_FOLDER_ID}' in parents and mimeType contains 'image' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    } as any)

    const files = (res.data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      // Extract appCode from filename: "ST_draft_1234567890.jpg" → "ST"
      appCode: (f.name as string).split('_')[0] || '',
      createdTime: f.createdTime,
    }))

    return NextResponse.json({ files })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
