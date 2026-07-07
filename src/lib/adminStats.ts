import { Redis } from '@upstash/redis'
import { getDriveClient } from './googleDrive'
import { Readable } from 'stream'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN!,
})

const SEED_ADMINS = ['valerii.lemberov@applyft.co', 'viktoriia.n@applyft.co']
const ADMINS_KEY = 'admin:emails'

function statsFolderId() {
  return process.env.STATS_DRIVE_FOLDER_ID || process.env.GENERATOR_DRIVE_FOLDER_ID!
}

// -- Admin list ---------------------------------------------------------------

export async function getAdminEmails(): Promise<string[]> {
  const stored = await redis.get<string[]>(ADMINS_KEY)
  if (stored && stored.length > 0) return stored
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

// -- Image generation counters ------------------------------------------------

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

// -- Image limits -------------------------------------------------------------

function limitKey(email: string) {
  return `gen:limit:${email}`
}

export async function getUserLimit(email: string): Promise<number> {
  const val = await redis.get<number>(limitKey(email))
  return val ?? 0
}

export async function setUserLimit(email: string, limit: number): Promise<void> {
  await redis.set(limitKey(email), limit)
}

export async function checkLimitExceeded(email: string): Promise<boolean> {
  const limit = await getUserLimit(email)
  if (limit === 0) return false
  const count = (await redis.get<number>(imageCountKey(email))) ?? 0
  return count >= limit
}

export async function getAllLimits(emails: string[]): Promise<Record<string, number>> {
  if (emails.length === 0) return {}
  const keys = emails.map(limitKey)
  const vals = await redis.mget<number[]>(...keys)
  const result: Record<string, number> = {}
  emails.forEach((email, i) => { result[email] = vals[i] ?? 0 })
  return result
}

// -- Video unit counters ------------------------------------------------------

function videoUnitsKey(email: string) {
  return `gen:video:units:${email}`
}

function videoLimitKey(email: string) {
  return `gen:video:limit:${email}`
}

export async function incrementVideoUnits(email: string, units: number): Promise<void> {
  if (units <= 0) return
  const key = videoUnitsKey(email)
  const current = (await redis.get<number>(key)) ?? 0
  await redis.set(key, Math.round((current + units) * 10) / 10)
}

export interface VideoUserStat {
  email: string
  videoUnits: number
}

export async function getAllVideoStats(emails: string[]): Promise<VideoUserStat[]> {
  if (emails.length === 0) return []
  const keys = emails.map(videoUnitsKey)
  const counts = await redis.mget<number[]>(...keys)
  return emails.map((email, i) => ({
    email,
    videoUnits: Math.round(((counts[i] as number) ?? 0) * 10) / 10,
  }))
}

export async function getAllVideoLimits(emails: string[]): Promise<Record<string, number>> {
  if (emails.length === 0) return {}
  const keys = emails.map(videoLimitKey)
  const vals = await redis.mget<number[]>(...keys)
  const result: Record<string, number> = {}
  emails.forEach((email, i) => { result[email] = (vals[i] as number) ?? 50 })
  return result
}

export async function getUserVideoLimit(email: string): Promise<number> {
  const val = await redis.get<number>(videoLimitKey(email))
  return val ?? 50
}

export async function setVideoLimit(email: string, limit: number): Promise<void> {
  await redis.set(videoLimitKey(email), limit)
}

export async function checkVideoLimitExceeded(email: string): Promise<boolean> {
  const limit = await getUserVideoLimit(email)
  if (limit === 0) return false
  const units = (await redis.get<number>(videoUnitsKey(email))) ?? 0
  return units >= limit
}

// -- Monthly snapshots --------------------------------------------------------

export interface MonthlySnapshot {
  month: string
  savedAt: string
  users: Array<{ email: string; name: string; imageCount: number }>
}

export async function saveMonthlyStat(
  month: string,
  users: Array<{ email: string; name: string; imageCount: number }>
): Promise<void> {
  const drive = getDriveClient()
  const data: MonthlySnapshot = { month, savedAt: new Date().toISOString(), users }
  const jsonStr = JSON.stringify(data, null, 2)

  await (drive.files.create as any)({
    requestBody: {
      name: `MONTHLY_STATS_${month}.json`,
      parents: [statsFolderId()],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from(Buffer.from(jsonStr)),
    },
    supportsAllDrives: true,
    fields: 'id',
  })
}

export async function listMonthlyStats(): Promise<Array<{ fileId: string; month: string }>> {
  const drive = getDriveClient()
  const res = await (drive.files.list as any)({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${statsFolderId()}' in parents and name contains 'MONTHLY_STATS_' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'name desc',
    pageSize: 36,
  }) as any
  return (res.data.files || []).map((f: any) => ({
    fileId: f.id,
    month: (f.name as string).replace('MONTHLY_STATS_', '').replace('.json', ''),
  }))
}

export async function getMonthlyStat(fileId: string): Promise<MonthlySnapshot> {
  const drive = getDriveClient()
  const res = await (drive.files.get as any)(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  ) as any
  return JSON.parse(Buffer.from(res.data).toString('utf8'))
}

export async function checkAndResetMonth(
  users: Array<{ email: string; name: string; imageCount: number }>
): Promise<boolean> {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastReset = await redis.get<string>('gen:reset-month')

  if (lastReset === currentMonth) return false

  if (lastReset && users.some(u => u.imageCount > 0)) {
    await saveMonthlyStat(
      lastReset,
      users.filter(u => u.imageCount > 0)
    ).catch(err => console.error('[adminStats] Monthly snapshot save failed:', err))
  }

  if (users.length > 0) {
    await Promise.all(users.map(u => redis.set(imageCountKey(u.email), 0)))
  }

  await redis.set('gen:reset-month', currentMonth)
  return true
}
