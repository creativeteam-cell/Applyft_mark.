import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jobs, runLocalizationJob } from '@/lib/localizationRunner'
import type { JobState } from '@/lib/localizationRunner'
import { randomUUID } from 'crypto'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { folders, languages, cp, appCode } = body as {
    folders: { id: string; name: string }[]
    languages: string[]
    cp: string
    appCode: string
  }

  if (!folders?.length || !languages?.length || !cp || !appCode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const jobId = randomUUID()

  const jobState: JobState = {
    jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    folders: folders.map(f => ({
      folderId: f.id,
      folderName: f.name,
      status: 'pending',
      completedLangs: [],
    })),
  }

  jobs.set(jobId, jobState)

  // Run in background (no await)
  runLocalizationJob(jobId, folders, languages, cp, appCode).catch(err => {
    console.error('Job crashed:', err)
    const job = jobs.get(jobId)
    if (job) {
      job.status = 'error'
      job.completedAt = new Date().toISOString()
    }
  })

  return NextResponse.json({ jobId })
}
