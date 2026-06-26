// Client-side AI queue tracking via localStorage.
// Reliable alternative to Drive-based approach — no network calls, no cross-Lambda issues.
// Works for single-user/small-team usage where the browser tab is open.

const EXPIRE_MS = 5 * 60 * 1000 // auto-expire after 5 min (crash protection)

export type QueueModel = 'gemini' | 'openai'

export interface QueueState {
  gemini: number
  openai: number
}

function key(model: QueueModel) {
  return `applyft_queue_${model}`
}

/** Mark a model as active (+1) or done (-1). Call before/after each AI request. */
export function setQueueActive(model: QueueModel, active: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key(model), active ? String(Date.now()) : '0')
  } catch {}
}

/** Read current queue state. Returns 1 if active within EXPIRE_MS, 0 otherwise. */
export function readQueueClient(): QueueState {
  if (typeof window === 'undefined') return { gemini: 0, openai: 0 }
  const now = Date.now()

  function modelActive(model: QueueModel): number {
    try {
      const val = localStorage.getItem(key(model))
      if (!val || val === '0') return 0
      const ts = Number(val)
      return ts > 0 && now - ts < EXPIRE_MS ? 1 : 0
    } catch {
      return 0
    }
  }

  return {
    gemini: modelActive('gemini'),
    openai: modelActive('openai'),
  }
}
