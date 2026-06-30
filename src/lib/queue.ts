// Cross-device AI queue tracking via Upstash Redis.
// Each model stores a heartbeat timestamp that expires automatically.

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const BEAT_TTL = 45 // seconds before key auto-expires (crash protection)

export interface QueueState {
  gemini: number
  openai: number
}

function beatKey(model: 'gemini' | 'openai') {
  return `queue:beat:${model}`
}

export async function readQueue(): Promise<QueueState> {
  try {
    const [gemini, openai] = await Promise.all([
      redis.get<number>(beatKey('gemini')),
      redis.get<number>(beatKey('openai')),
    ])
    return {
      gemini: gemini ? 1 : 0,
      openai: openai ? 1 : 0,
    }
  } catch (e) {
    console.error('[queue] readQueue error:', e)
    return { gemini: 0, openai: 0 }
  }
}

export async function updateQueue(model: 'gemini' | 'openai', delta: 1 | -1): Promise<void> {
  try {
    if (delta === 1) {
      await redis.set(beatKey(model), Date.now(), { ex: BEAT_TTL })
    } else {
      await redis.del(beatKey(model))
    }
  } catch (e) {
    console.error('[queue] updateQueue error:', e)
  }
}
