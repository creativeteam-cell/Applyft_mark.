import { NextResponse } from 'next/server'
import { readQueue } from '@/lib/queue'

export const maxDuration = 15

export async function GET() {
  const queue = await readQueue()
  return NextResponse.json(queue)
}
