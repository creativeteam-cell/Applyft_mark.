import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN!,
})

const SEED_ADMINS = ['valerii.lemberov@applyft.co', 'viktoriia.n@applyft.co']
const ADMINS_KEY = 'admin:emails'

// ── Admin list ───────────────────────────────────────────────────────────────

export async function getAdminEmails(): Promise<string[]> {
  const stored = await redis.get<string[]>(ADMINS_KEY)
  if (stored && stored.length > 0) return stored
  // Seed on first call
  await redis.set(ADMINS_KEY, SEED_ADMINS)
  return SEED_ADMINS
}

export async function addAdminEmail(email: string): Promise<string[]> {
  const current = await getAdminEmails()
  if (current.includes(email)) return current
  const updated = [...current, email]
  await redis.set(ADMINS_KEY, updated)
  return updated
}

export async function removeAdminEmail(email: string, requestorEmail: string): Promise<string[]> {
  if (email === requestorEmail) throw new Error('Cannot remove yourself')
  const current = await getAdminEmails()
  const updated = current.filter(e => e !== email)
  await redis.set(ADMINS_KEY, updated)
  return updated
}

// ── Generation counters ──────────────────────────────────────────────────────

function imageCountKey(email: string) {
  return `gen:images:${email}`
}

export async function incrementImageCount(email: string): Promise<void> {
  await redis.incr(imageCountKey(email))
}

export interface UserStat {
  email: string
  imageCount: number
}

export async function getAllUserStats(knownEmails: string[]): Promise<UserStat[]> {
  if (knownEmails.length === 0) return []
  const keys = knownEmails.map(imageCountKey)
  const counts = await redis.mget<number[]>(...keys)
  return knownEmails.map((email, i) => ({
    email,
    imageCount: counts[i] ?? 0,
  }))
}
