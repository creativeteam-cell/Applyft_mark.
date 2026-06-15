import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runLocalizationJob } from '@/lib/localizationRunner'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await req.json()
  const { folders, languages, cp, appCode } = body as {
    folders: { id: string; name: string }[]
    languages: string[]
    cp: string
    appCode: string
  }

  if (!folders?.length || !languages?.length || !cp || !appCode) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  // Same approach as drive/save/route.ts — read accessToken directly from session
  const userAccessToken = (session as any).accessToken as string | undefined

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'))
        } catch {
          // client disconnected
        }
      }

      try {
        await runLocalizationJob(folders, languages, cp, appCode, send, userAccessToken)
      } catch (err: any) {
        send({ status: 'error', folders: [], error: err.message })
      } finally {
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
