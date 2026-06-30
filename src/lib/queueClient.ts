// Client-side AI queue tracking.
// - localStorage: instant feedback on current device
// - Server heartbeat POST /api/queue: cross-device visibility via Drive

const EXPIRE_MS = 5 * 60 * 1000 // 5 min auto-expire (crash protection)

export type QueueModel = 'gemini' | 'openai'

export interface QueueState {
  gemini: number
  openai: number
}

function lsKey(model: QueueModel) {
  return `applyft_queue_${model}`
}

/** Mark a model active (true) or idle (false). Updates localStorage + server. */
export function setQueueActive(model: QueueModel, active: boolean) {
  // 1. Instant local update
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(lsKey(model), active ? String(Date.now()) : '0')
    } catch {}
  }

  // 2. Server heartbeat for cross-device visibility (fire and forget)
  if (typeof window !== 'undefined') {
    fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, active }),
    }).catch(() => {}) // silent — local display already works
  }
}

/** Read queue state from localStorage (current device only). */
export function readQueueClient(): QueueState {
  if (typeof window === 'undefined') return { gemini: 0, openai: 0 }
  const now = Date.now()

  function modelActive(model: QueueModel): number {
    try {
      const val = localStorage.getItem(lsKey(model))
      if (!val || val === '0') return 0
      const ts = Number(val)
      return ts > 0 && now - ts < EXPIRE_MS ? 1 : 0
    } catch {
      return 0
    }
  }

  return { gemini: modelActive('gemini'), openai: modelActive('openai') }
}
