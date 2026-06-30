// Cross-device AI queue tracking via Upstash Redis.
// Uses atomic INCR/DECR — correct under concurrent usage across all devices.

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN!,
})

const KEY_TTL = 300 // 5 min auto-reset in case of crash

export interface QueueState {
  gemini: number
  openai: number
}

function countKey(model: 'gemini' | 'openai') {
  return `queue:count:${model}`
}

export async function readQueue(): Promise<QueueState> {
  try {
    const [gemini, openai] = await Promise.all([
      redis.get<number>(countKey('gemini')),
      redis.get<number>(countKey('openai')),
    ])
    return {
      gemini: Math.max(0, gemini ?? 0),
      openai: Math.max(0, openai ?? 0),
    }
  } catch (e) {
    console.error('[queue] readQueue error:', e)
    return { gemini: 0, openai: 0 }
  }
}

export async function updateQueue(model: 'gemini' | 'openai', delta: 1 | -1): Promise<void> {
  try {
    const key = countKey(model)
    if (delta === 1) {
      await redis.incr(key)
      await redis.expire(key, KEY_TTL)
    } else {
      const current = await redis.get<number>(key)
      if (current && current > 0) {
        await redis.decr(key)
      } else {
        await redis.set(key, 0, { ex: KEY_TTL })
      }
    }
  } catch (e) {
    console.error('[queue] updateQueue error:', e)
  }
}
