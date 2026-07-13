// HMAC signing for public video proxy URLs.
// Kling motion-control needs a publicly fetchable video URL; our videos live in
// Drive behind auth. /api/video/public/[id]?t=<sig> streams them without a session,
// but only with a valid signature, so URLs can't be guessed.
import crypto from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET || ''

export function signVideoId(fileId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`public-video:${fileId}`).digest('hex').slice(0, 32)
}

export function verifyVideoSig(fileId: string, sig: string): boolean {
  if (!sig) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(signVideoId(fileId)), Buffer.from(sig))
  } catch {
    return false
  }
}

export function buildPublicVideoUrl(origin: string, fileId: string): string {
  return `${origin}/api/video/public/${fileId}?t=${signVideoId(fileId)}`
}
