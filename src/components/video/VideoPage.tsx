'use client'

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { setQueueActive } from '@/lib/queueClient'
import { UsageBadge } from '@/components/ui/UsageBadge'

// ── Types ──────────────────────────────────────────────────────────────────

type VideoMode = 'standard' | 'multishot' | 'motionControl' | 'avatar' | 'dubbing'
type Mode = 'std' | 'pro' | '4k'
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3'
type TaskStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'
type KlingModel = 'kling-v3' | 'kling-v3-turbo' | 'kling-v3-omni' | 'kling-video-o1' | 'kling-v2-6' | 'kling-v2-5-turbo' | 'avatar' | 'dubbing'

interface ShotItem { id: string; prompt: string; duration: number }
interface ModelDef {
  id: KlingModel; label: string; description: string; tags: string[]
  supportsSound: boolean; supports4K: boolean; supportsLastFrame: boolean
  supportsMultishot: boolean; supportsMotionControl: boolean; isAvatar: boolean
  supportsImageList: boolean
  modes: VideoMode[]; aspectRatios: AspectRatio[]
}
interface VideoItem {
  id: string; prompt: string; model: string; duration: string
  aspectRatio: string; sound: string; inputType: string
  klingVideoId: string; userName: string; userEmail: string; userImage: string
  thumbnailLink: string | null; webViewLink: string | null; createdTime: string
}
interface GenItem {
  id: string; prompt: string; thumbnailLink: string | null
  engine: string; size: string; createdTime: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']

const MODELS: ModelDef[] = [
  {
    id: 'kling-v3', label: 'Kling 3.0', description: 'Latest model, audio sync, storyboarding', tags: ['Best', 'HOT'],
    supportsSound: true, supports4K: false, supportsLastFrame: true, supportsMultishot: true, supportsMotionControl: false, isAvatar: false, supportsImageList: false,
    modes: ['standard', 'multishot'], aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'kling-v3-turbo', label: 'Kling 3.0 Turbo', description: 'Faster output, lower cost, sound always on', tags: ['NEW', 'Audio'],
    supportsSound: false, supports4K: false, supportsLastFrame: false, supportsMultishot: true, supportsMotionControl: false, isAvatar: false, supportsImageList: false,
    modes: ['standard', 'multishot'], aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-v3-omni', label: 'Kling 3.0 Omni', description: 'Multi-asset, motion control, 4K output', tags: ['Pro', 'HOT'],
    supportsSound: true, supports4K: true, supportsLastFrame: true, supportsMultishot: true, supportsMotionControl: true, isAvatar: false, supportsImageList: true,
    modes: ['standard', 'multishot', 'motionControl'], aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-video-o1', label: 'Kling O1', description: 'Reasoning model, precise prompt adherence', tags: [],
    supportsSound: false, supports4K: false, supportsLastFrame: false, supportsMultishot: false, supportsMotionControl: false, isAvatar: false, supportsImageList: false,
    modes: ['standard'], aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-v2-6', label: 'Kling 2.6', description: 'See the sound, hear the visual', tags: ['Audio'],
    supportsSound: true, supports4K: false, supportsLastFrame: true, supportsMultishot: false, supportsMotionControl: true, isAvatar: false, supportsImageList: false,
    modes: ['standard', 'motionControl'], aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'kling-v2-5-turbo', label: 'Kling 2.5 Turbo', description: 'Max creativity with exceptional value', tags: ['Stable'],
    supportsSound: false, supports4K: false, supportsLastFrame: true, supportsMultishot: false, supportsMotionControl: false, isAvatar: false, supportsImageList: false,
    modes: ['standard'], aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'avatar', label: 'Avatar', description: 'Talking head video from photo + audio', tags: ['NEW'],
    supportsSound: false, supports4K: false, supportsLastFrame: false, supportsMultishot: false, supportsMotionControl: false, isAvatar: true, supportsImageList: false,
    modes: ['avatar'], aspectRatios: [],
  },
  {
    id: 'dubbing', label: 'Dubbing', description: 'Translate any video to another language with lip-sync', tags: ['NEW'],
    supportsSound: false, supports4K: false, supportsLastFrame: false, supportsMultishot: false, supportsMotionControl: false, isAvatar: false, supportsImageList: false,
    modes: ['dubbing'], aspectRatios: [],
  },
]

const MODE_LABELS: Record<VideoMode, string> = {
  standard: 'Standard',
  multishot: 'Multishot',
  motionControl: 'Motion Control',
  avatar: 'Avatar',
  dubbing: 'Dubbing',
}

const DUB_LANGUAGES: [string, string][] = [
  ['EN', 'English'], ['SP', 'Spanish'], ['PT', 'Portuguese'], ['DE', 'German'],
  ['FR', 'French'], ['IT', 'Italian'], ['JP', 'Japanese'], ['KR', 'Korean'],
  ['AR', 'Arabic'], ['HI', 'Hindi'], ['PL', 'Polish'], ['UA', 'Ukrainian'],
  ['CN', 'Chinese'], ['HE', 'Hebrew'], ['CZ', 'Czech'], ['ND', 'Dutch'],
]

// Фолбэк, пока не загрузился полный список голосов из /api/dubbing/voices
const DUB_VOICES: { id: string; label: string }[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel — female, calm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella — female, energetic' },
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam — male, deep' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh — male, energetic' },
]

// Dubbing пока в закрытой бете — виден только этим пользователям
const DUBBING_ALLOWED_EMAILS = new Set(['valerii.lemberov@applyft.co'])

const TURBO_MODELS = new Set(['kling-v3-turbo'])
// O1 & Omni share the /v1/videos/omni-video endpoint
const OMNI_MODELS = new Set(['kling-v3-omni', 'kling-video-o1'])

// ── Cost estimation ────────────────────────────────────────────────────────

function estimateCost(params: {
  model: KlingModel; qualityMode: Mode; sound: boolean
  videoMode: VideoMode; hasImage: boolean; durationSec: number
}): number | null {
  const { model, qualityMode, sound, videoMode, hasImage, durationSec } = params
  if (durationSec <= 0) return null
  const is720 = qualityMode === 'std'
  const is4k = qualityMode === '4k'
  let rate = 0

  if (model === 'kling-v3') {
    if (videoMode === 'motionControl') rate = is720 ? 0.9 : 1.2
    else if (sound) rate = is720 ? 0.9 : is4k ? 3.0 : 1.2
    else rate = is720 ? 0.6 : is4k ? 3.0 : 0.8
  } else if (model === 'kling-v3-turbo') {
    rate = is720 ? 0.8 : 1.0
  } else if (model === 'kling-v3-omni') {
    if (videoMode === 'motionControl') rate = is720 ? 0.9 : is4k ? 3.0 : 1.2
    else if (sound) rate = is720 ? 0.8 : is4k ? 3.0 : 1.0
    else rate = is720 ? 0.6 : is4k ? 3.0 : 0.8
  } else if (model === 'kling-video-o1') {
    // O1: higher rate applies to VIDEO input only; image first-frame is billed as base
    rate = is720 ? 0.6 : 0.8
  } else if (model === 'kling-v2-6') {
    if (videoMode === 'motionControl') rate = is720 ? 0.5 : 0.8
    else if (sound) rate = 1.0 // native audio: 1080p only, 1.0 unit/s
    else rate = is720 ? 0.3 : 0.5
  } else if (model === 'kling-v2-5-turbo') {
    rate = is720 ? 0.3 : 0.5
  } else if (model === 'avatar') {
    rate = is720 ? 0.4 : 0.8
  } else if (model === 'dubbing') {
    return null // липсинк 0.5 юнита/5с, длительность заранее неизвестна
  } else {
    rate = is720 ? 0.6 : 0.8
  }

  return Math.round(rate * durationSec * 10) / 10
}

// ── Helpers ────────────────────────────────────────────────────────────────

function colorFromString(str: string) {
  const colors = ['#4f6ef7','#e05c8a','#34a853','#fbbc05','#e8453c','#9c27b0','#00acc1']
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}
function initials(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }

function UserAvatar({ name, email, image, size = 28 }: { name: string; email: string; image: string; size?: number }) {
  if (image) return <img src={image} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />
  return (
    <div style={{ width: size, height: size, background: colorFromString(email), fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-white">
      {initials(name)}
    </div>
  )
}

// ── JsonPromptDisplay (kept for history modal) ─────────────────────────────

function JsonPromptDisplay({ prompt }: { prompt: string }) {
  const trimmed = prompt.trim()
  let parsed: any = null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { parsed = JSON.parse(trimmed) } catch {}
  }
  if (!parsed) return <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{prompt}</p>

  function renderValue(val: any, depth = 0): React.ReactNode {
    if (val === null) return <span style={{ color: '#94a3b8' }}>null</span>
    if (typeof val === 'boolean') return <span style={{ color: '#f59e0b' }}>{String(val)}</span>
    if (typeof val === 'number') return <span style={{ color: '#34a853' }}>{val}</span>
    if (typeof val === 'string') return <span style={{ color: '#a5f3fc' }}>"{val}"</span>
    if (Array.isArray(val)) {
      if (val.length === 0) return <span style={{ color: 'var(--text-muted)' }}>[]</span>
      return (
        <span>{'['}<div style={{ paddingLeft: 16 }}>{val.map((item, i) => (
          <div key={i}>{renderValue(item, depth + 1)}{i < val.length - 1 ? ',' : ''}</div>
        ))}</div>{']'}</span>
      )
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val)
      return (
        <span>{'{'}<div style={{ paddingLeft: 16 }}>{keys.map((k, i) => (
          <div key={k}>
            <span style={{ color: '#c084fc' }}>"{k}"</span>
            <span style={{ color: 'var(--text-muted)' }}>: </span>
            {renderValue(val[k], depth + 1)}
            {i < keys.length - 1 ? ',' : ''}
          </div>
        ))}</div>{'}'}</span>
      )
    }
    return <span>{String(val)}</span>
  }

  return (
    <pre className="text-xs leading-relaxed overflow-auto rounded-lg p-3"
      style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--text)', fontFamily: 'monospace', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {renderValue(parsed)}
    </pre>
  )
}

// ── Model Dropdown ─────────────────────────────────────────────────────────

function ModelDropdown({ model, onSelect, hiddenIds }: { model: KlingModel; onSelect: (m: KlingModel) => void; hiddenIds?: Set<string> }) {
  const [open, setOpen] = useState(false)
  const current = MODELS.find(m => m.id === model)!
  const visibleModels = MODELS.filter(m => !hiddenIds?.has(m.id))

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
          <span className="text-sm font-medium truncate">{current.label}</span>
          <div className="flex gap-1 flex-shrink-0">
            {current.tags.map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>{tag}</span>
            ))}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-30"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {visibleModels.map(m => (
            <button key={m.id} onClick={() => { onSelect(m.id); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 transition-all hover:bg-white/5"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full"
                    style={{ background: model === m.id ? 'var(--accent)' : 'rgba(255,255,255,0.2)' }} />
                  <span className="text-sm font-medium" style={{ color: model === m.id ? 'var(--accent)' : 'var(--text)' }}>
                    {m.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  {m.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)' }}>{tag}</span>
                  ))}
                </div>
              </div>
              <p className="text-[11px] ml-4" style={{ color: 'var(--text-muted)' }}>{m.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Image Picker Modal ─────────────────────────────────────────────────────

function ImagePickerModal({ onSelect, onClose }: { onSelect: (b64: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<GenItem[]>([])
  const [loading, setLoading] = useState(true)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (token?: string) => {
    const url = token ? `/api/generator/history?pageToken=${encodeURIComponent(token)}` : '/api/generator/history'
    const res = await fetch(url)
    return res.json()
  }, [])

  useEffect(() => {
    fetchPage().then(data => { setItems(data.items || []); setNextPageToken(data.nextPageToken || null); setLoading(false) })
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return
    setLoadingMore(true)
    const data = await fetchPage(nextPageToken)
    setItems(prev => [...prev, ...(data.items || [])])
    setNextPageToken(data.nextPageToken || null)
    setLoadingMore(false)
  }, [nextPageToken, loadingMore, fetchPage])

  useEffect(() => {
    const el = sentinelRef.current; if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [loadMore])

  async function handleSelect(item: GenItem) {
    if (fetchingId) return
    setFetchingId(item.id)
    try {
      const res = await fetch(`/api/generator/image/${item.id}`)
      const blob = await res.blob()
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      })
      onSelect(b64); onClose()
    } catch (e) { console.error('Failed to load image', e) }
    setFetchingId(null)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 640, maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Pick from library</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Select an image from your generations</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}/>
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No generated images yet</p>
            </div>
          ) : (
            <>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {items.map(item => (
                  <button key={item.id} onClick={() => handleSelect(item)} disabled={!!fetchingId}
                    className="relative rounded-xl overflow-hidden group transition-all"
                    style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)', border: '2px solid transparent' }}>
                    {item.thumbnailLink ? (
                      <img src={item.thumbnailLink} alt={item.prompt} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'rgba(255,255,255,0.15)' }}>
                          <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                    {fetchingId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                        </svg>
                      </div>
                    )}
                    {fetchingId !== item.id && (
                      <div className="absolute inset-0 flex items-end opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'linear-gradient(transparent 40%, rgba(79,110,247,0.7))' }}>
                        <div className="w-full p-2">
                          <span className="text-[9px] text-white font-medium truncate block">{item.prompt || 'No prompt'}</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div ref={sentinelRef} className="h-6 flex items-center justify-center mt-2">
                {loadingMore && (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── VideoCard ─────────────────────────────────────────────────────────────

function VideoCard({ item, onSelect, featured = false }: { item: VideoItem; onSelect: () => void; featured?: boolean }) {
  const [thumbErr, setThumbErr] = useState(false)
  const [hovered, setHovered] = useState(false)
  const thumbSrc = `/api/video/thumb/${item.id}`
  const videoSrc = `/api/video/file/${item.id}`
  const showVideo = featured || hovered

  // Short prompt always shown on card (strip JSON brackets for multishot)
  let shortPrompt = item.prompt || ''
  try { const p = JSON.parse(shortPrompt); if (p.shots) shortPrompt = p.shots.map((s: any) => s.prompt).join(' · ') } catch {}
  shortPrompt = shortPrompt.replace(/^\[.*?\]\s*/, '').slice(0, 90)

  return (
    <div onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-xl overflow-hidden cursor-pointer group"
      style={{ background: '#000', border: '1px solid var(--border)', aspectRatio: featured ? '2/1' : '1/1', gridColumn: featured ? 'span 2' : undefined }}>
      {showVideo ? (
        <video src={videoSrc} autoPlay muted loop playsInline className="w-full h-full object-contain" />
      ) : !thumbErr ? (
        <img src={thumbSrc} alt={item.prompt} className="w-full h-full object-contain" onError={() => setThumbErr(true)} />
      ) : (
        <video src={videoSrc} preload="metadata" muted playsInline className="w-full h-full object-contain" />
      )}
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
      )}
      {featured && (
        <div className="absolute top-2 left-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(79,110,247,0.8)', color: '#fff' }}>Latest</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 pt-4 pb-2" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
        {shortPrompt && !showVideo && (
          <p className="text-[10px] leading-tight mb-1.5" style={{ color: 'rgba(255,255,255,0.75)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {shortPrompt}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium" style={{ background: 'rgba(79,110,247,0.8)', color: '#fff' }}>{item.duration}s</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}>{item.model.replace('kling-','')}</span>
          </div>
          {item.userName && <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={18} />}
        </div>
      </div>
    </div>
  )
}

// ── VideoCardModal ─────────────────────────────────────────────────────────

// Kling video-extend API only supports videos generated by V1.0 / V1.5 / V1.6 models
const EXTENDABLE_MODELS = new Set(['kling-v1', 'kling-v1-5', 'kling-v1-6'])

function VideoCardModal({ item, onClose, onRefresh }: { item: VideoItem; onClose: () => void; onRefresh: () => void }) {
  const canExtend = EXTENDABLE_MODELS.has(item.model) && !!item.klingVideoId

  // ── Continue video (O1/Omni video reference: "generate the next shot") ──
  const [contModel, setContModel] = useState<'kling-video-o1' | 'kling-v3-omni'>('kling-video-o1')
  const [contPrompt, setContPrompt] = useState('')
  const [contDuration, setContDuration] = useState(5)
  const [contKeepSound, setContKeepSound] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [contStatus, setContStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const [contError, setContError] = useState('')
  const contPollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  function stopContPoll() { if (contPollRef.current) { clearInterval(contPollRef.current); contPollRef.current = null } }

  async function handleContinue() {
    setContinuing(true); setContStatus('processing'); setContError('')
    try {
      // Signed public URL so Kling can fetch the source video
      const urlRes = await fetch(`/api/video/public-url?id=${encodeURIComponent(item.id)}`)
      const urlData = await urlRes.json()
      if (!urlData.url) throw new Error(urlData.error || 'Failed to get video URL')

      const fullPrompt = contPrompt.trim()
        ? `Based on <<<video_1>>>, generate the next shot: ${contPrompt.trim()}`
        : 'Based on <<<video_1>>>, generate the next shot, continuing the scene naturally.'

      const res = await fetch('/api/video/omni', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: contModel, prompt: fullPrompt,
          video_url: urlData.url, video_refer_type: 'feature',
          keep_original_sound: contKeepSound ? 'yes' : 'no',
          duration: contDuration, mode: 'pro',
          aspect_ratio: ['16:9','9:16','1:1'].includes(item.aspectRatio) ? item.aspectRatio : '16:9',
        }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      stopContPoll()
      contPollRef.current = setInterval(async () => {
        const sr = await fetch(`/api/video/status/${d.task_id}?type=omni-video`)
        const sd = await sr.json()
        if (sd.task_status === 'succeed') {
          stopContPoll()
          const url = sd.task_result?.videos?.[0]?.url
          const kid = sd.task_result?.videos?.[0]?.id ?? ''
          if (url) {
            await fetch('/api/video/save', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: url, klingVideoId: kid,
                prompt: item.prompt + (contPrompt ? ' [next shot: ' + contPrompt + ']' : ' [next shot]'),
                model: contModel, duration: String(contDuration),
                aspectRatio: item.aspectRatio, sound: 'off', inputType: 'video-reference',
              }),
            })
          }
          setContStatus('done'); setContinuing(false); onRefresh()
        } else if (sd.task_status === 'failed') {
          stopContPoll(); setContError(sd.task_status_msg || 'Continue failed'); setContStatus('error'); setContinuing(false)
        }
      }, 4000)
    } catch (e: any) { setContError(e.message); setContStatus('error'); setContinuing(false) }
  }
  const [extPrompt, setExtPrompt] = useState('')
  const [extDuration, setExtDuration] = useState<'4'|'5'>('5')
  const [extending, setExtending] = useState(false)
  const [extStatus, setExtStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const [extError, setExtError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')
  const [enhancingExt, setEnhancingExt] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  async function handleEnhanceExt() {
    if (!extPrompt.trim() || enhancingExt) return
    setEnhancingExt(true)
    try {
      const res = await fetch('/api/video/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: extPrompt, duration: 5 }),
      })
      const data = await res.json()
      if (data.prompt) setExtPrompt(data.prompt)
    } catch {}
    setEnhancingExt(false)
  }

  async function handleExtend() {
    if (!item.klingVideoId) { setExtError('No Kling video ID — cannot extend.'); return }
    setExtending(true); setExtStatus('processing'); setExtError('')
    try {
      const res = await fetch('/api/video/extend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klingVideoId: item.klingVideoId, prompt: extPrompt, duration: extDuration }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      stopPoll()
      pollRef.current = setInterval(async () => {
        const sr = await fetch(`/api/video/status/${d.task_id}?type=video-extend`)
        const sd = await sr.json()
        if (sd.task_status === 'succeed') {
          stopPoll()
          const url = sd.task_result?.videos?.[0]?.url
          const kid = sd.task_result?.videos?.[0]?.id ?? ''
          if (url) {
            await fetch('/api/video/save', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: url, klingVideoId: kid,
                prompt: item.prompt + (extPrompt ? ' [extended: ' + extPrompt + ']' : ' [extended]'),
                model: item.model, duration: item.duration,
                aspectRatio: item.aspectRatio, sound: item.sound, inputType: item.inputType,
              }),
            })
          }
          setExtStatus('done'); setExtending(false); onRefresh()
        } else if (sd.task_status === 'failed') {
          stopPoll(); setExtError(sd.task_status_msg || 'Extend failed'); setExtStatus('error'); setExtending(false)
        }
      }, 4000)
    } catch (e: any) { setExtError(e.message); setExtStatus('error'); setExtending(false) }
  }

  async function handleDelete() {
    if (!confirm('Delete this video from Google Drive?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/video/file/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed') }
      onRefresh(); onClose()
    } catch (e: any) { setErr(e.message) }
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex rounded-2xl overflow-hidden max-h-[90vh] w-full max-w-3xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 360, background: 'rgba(0,0,0,0.5)' }}>
          <video src={`/api/video/file/${item.id}`} controls autoPlay loop className="w-full max-h-[90vh] object-contain" />
        </div>
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="rounded px-2 py-1 text-xs font-mono font-medium" style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>{item.model.replace('kling-','')}</span>
            <span className="rounded px-2 py-1 text-xs font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{item.duration}s</span>
            {item.aspectRatio && <span className="rounded px-2 py-1 text-xs font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{item.aspectRatio}</span>}
            {item.createdTime && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(item.createdTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            {item.userName && (
              <div className="flex items-center gap-1.5 ml-auto">
                <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={22} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.userName}</span>
              </div>
            )}
          </div>
          {item.prompt && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt</div>
              <JsonPromptDisplay prompt={item.prompt} />
            </div>
          )}
          {canExtend && (<>
          <div className="mb-4" style={{ height: 1, background: 'var(--border)' }} />
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Extend video</div>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {(['4','5'] as const).map(d => (
                    <button key={d} onClick={() => setExtDuration(d)}
                      className="px-2 py-0.5 text-[10px] font-medium transition-all"
                      style={{ background: extDuration === d ? 'rgba(79,110,247,0.2)' : 'transparent', color: extDuration === d ? 'var(--accent)' : 'var(--text-muted)', borderRight: d === '4' ? '1px solid var(--border)' : 'none' }}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleEnhanceExt} disabled={enhancingExt || !extPrompt.trim()}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                style={{ background: extPrompt.trim() ? 'rgba(79,110,247,0.12)' : 'rgba(255,255,255,0.04)', color: extPrompt.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.2)', border: '1px solid var(--border)' }}>
                {enhancingExt ? (
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                ) : '✦'} Enhance
              </button>
            </div>
            <textarea value={extPrompt} onChange={e => setExtPrompt(e.target.value)} placeholder="Optional: describe the continuation..." rows={2}
              className="w-full rounded-lg resize-none outline-none text-sm p-3 mb-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            {extStatus === 'done' && <p className="text-xs mb-2" style={{ color: '#34a853' }}>✓ Extended and saved</p>}
            {extError && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{extError}</p>}
            <button onClick={handleExtend} disabled={extending || !item.klingVideoId}
              className="w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              {extending ? (
                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>Extending...</>
              ) : '⚡ Extend'}
            </button>
          </div>
          </>)}

          {/* Continue video — O1/Omni "next shot" via video reference */}
          <div className="mb-4" style={{ height: 1, background: 'var(--border)' }} />
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Continue video (next shot)</div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {([['kling-video-o1','O1'],['kling-v3-omni','Omni']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setContModel(val)}
                    className="px-2 py-0.5 text-[10px] font-medium transition-all"
                    style={{ background: contModel === val ? 'rgba(79,110,247,0.2)' : 'transparent', color: contModel === val ? 'var(--accent)' : 'var(--text-muted)', borderRight: val === 'kling-video-o1' ? '1px solid var(--border)' : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={contPrompt} onChange={e => setContPrompt(e.target.value)}
              placeholder="Optional: what happens in the next shot..." rows={2}
              className="w-full rounded-lg resize-none outline-none text-sm p-3 mb-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 mr-3">
                <input type="range" min={3} max={contModel === 'kling-v3-omni' ? 15 : 10} step={1}
                  value={Math.min(contDuration, contModel === 'kling-v3-omni' ? 15 : 10)}
                  onChange={e => setContDuration(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]" style={{ height: 4 }} />
                <span className="text-[10px] font-mono w-6 text-right" style={{ color: 'var(--accent)' }}>
                  {Math.min(contDuration, contModel === 'kling-v3-omni' ? 15 : 10)}s
                </span>
              </div>
              {item.sound === 'on' && (
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={contKeepSound} onChange={e => setContKeepSound(e.target.checked)} />
                  Keep source sound
                </label>
              )}
            </div>
            {contStatus === 'done' && <p className="text-xs mb-2" style={{ color: '#34a853' }}>✓ Next shot generated and saved</p>}
            {contError && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{contError}</p>}
            <div className="flex justify-center mb-1.5">
              <UsageBadge kind="video" refreshKey={contStatus} />
            </div>
            <button onClick={handleContinue} disabled={continuing}
              className="w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              {continuing ? (
                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>Generating next shot...</>
              ) : '🎬 Continue'}
            </button>
          </div>
          {err && <p className="text-xs mb-3" style={{ color: '#f87171' }}>{err}</p>}
          <div className="flex gap-2 mt-auto">
            <a href={`/api/video/file/${item.id}?download=1`} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download
            </a>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center justify-center px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
              {deleting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compress image to max 1280px JPEG to keep API payloads under Vercel 4.5MB limit
function shrinkForVideo(dataUrl: string, maxPx = 1280): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// ── ImageUploadBox ─────────────────────────────────────────────────────────

function ImageUploadBox({ label, preview, onUpload, onClear, onPickFromLibrary, compact }: {
  label: string; preview: string | null
  onUpload: (b64: string) => void; onClear: () => void; onPickFromLibrary: () => void
  compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const url = ev.target?.result as string
      const compressed = await shrinkForVideo(url)
      onUpload(compressed.split(',')[1])
    }
    reader.readAsDataURL(file)
  }
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) processFile(file)
  }
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
        {!preview && (
          <button onClick={onPickFromLibrary}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Library
          </button>
        )}
      </div>
      <div onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f) }}
        className="rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center transition-all hover:border-[var(--accent)] overflow-hidden"
        style={{ borderColor: dragOver ? 'var(--accent)' : preview ? 'transparent' : 'var(--border)', background: dragOver ? 'rgba(79,110,247,0.08)' : 'transparent', minHeight: compact ? 70 : 80 }}>
        {preview ? (
          <div className="relative w-full">
            <img src={`data:image/jpeg;base64,${preview}`} alt={label} className="w-full object-cover rounded-xl" style={{ maxHeight: compact ? 70 : 130 }} />
            <button onClick={e => { e.stopPropagation(); onClear(); if (ref.current) ref.current.value = '' }}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
          </div>
        ) : (
          <div className="text-center p-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-1" style={{ color: 'var(--text-muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dragOver ? 'Drop image' : 'Upload or drop'}</div>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  )
}

// ── LocalStorage helpers ──────────────────────────────────────────────────
function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── Main VideoPage ─────────────────────────────────────────────────────────

export function VideoPage() {
  const { data: session } = useSession()
  // ── Model & Mode ──
  const [model, setModel] = useState<KlingModel>(() => loadLS<KlingModel>('gen_vid_model', 'kling-v3'))
  const [videoMode, setVideoMode] = useState<VideoMode>(() => loadLS<VideoMode>('gen_vid_mode', 'standard'))

  // ── Standard mode state ──
  const [prompt, setPrompt] = useState<string>(() => loadLS<string>('gen_vid_prompt', ''))
  const [negPrompt, setNegPrompt] = useState<string>(() => loadLS<string>('gen_vid_negprompt', ''))
  const [negOpen, setNegOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(() => loadLS<Mode>('gen_vid_quality', 'std'))
  const [duration, setDuration] = useState<number>(() => loadLS<number>('gen_vid_duration', 5))
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => loadLS<AspectRatio>('gen_vid_aspect', '16:9'))
  const [sound, setSound] = useState<boolean>(() => loadLS<boolean>('gen_vid_sound', false))
  const [firstFrame, setFirstFrame] = useState<string | null>(null)
  const [lastFrame, setLastFrame] = useState<string | null>(null)
  const [assets, setAssets] = useState<{ id: string; name: string; base64: string }[]>([])
  const [enhancing, setEnhancing] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<'first' | 'last' | 'motion' | 'avatar' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const assetInputRef = useRef<HTMLInputElement>(null)

  // Persist Video settings to localStorage (model/mode/standard controls)
  useEffect(() => { saveLS('gen_vid_model', model) }, [model])
  useEffect(() => { saveLS('gen_vid_mode', videoMode) }, [videoMode])
  useEffect(() => { saveLS('gen_vid_prompt', prompt) }, [prompt])
  useEffect(() => { saveLS('gen_vid_negprompt', negPrompt) }, [negPrompt])
  useEffect(() => { saveLS('gen_vid_quality', mode) }, [mode])
  useEffect(() => { saveLS('gen_vid_duration', duration) }, [duration])
  useEffect(() => { saveLS('gen_vid_aspect', aspectRatio) }, [aspectRatio])
  useEffect(() => { saveLS('gen_vid_sound', sound) }, [sound])
  const [atPopup, setAtPopup] = useState(false)
  const [atQuery, setAtQuery] = useState('')

  // Вставка картинки из буфера (Ctrl+V) → первый кадр (для режимов с кадром).
  // Реагируем только на изображение в буфере, вставку текста не трогаем.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (videoMode !== 'standard' && videoMode !== 'multishot') return
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (!f) break
          e.preventDefault()
          const reader = new FileReader()
          reader.onload = async ev => {
            const compressed = await shrinkForVideo(ev.target?.result as string)
            setFirstFrame(compressed.split(',')[1])
          }
          reader.readAsDataURL(f)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [videoMode])

  // Автоопределение соотношения по первому кадру: при image-to-video Kling берёт
  // пропорции картинки, поэтому выставляем ближайший доступный формат модели.
  const [detectedAspect, setDetectedAspect] = useState<string | null>(null)
  useEffect(() => {
    if (!firstFrame) { setDetectedAspect(null); return }
    const img = new Image()
    img.onload = () => {
      if (!img.width || !img.height) return
      const target = img.width / img.height
      const opts = currentModel.aspectRatios.length ? currentModel.aspectRatios : (['16:9', '9:16', '1:1'] as AspectRatio[])
      const ratio = (l: string) => { const [w, h] = l.split(':').map(Number); return h ? w / h : 1 }
      let best = opts[0], bestDiff = Infinity
      opts.forEach(o => { const d = Math.abs(ratio(o) - target); if (d < bestDiff) { bestDiff = d; best = o } })
      setDetectedAspect(best)
      setAspectRatio(best)
    }
    img.src = `data:image/jpeg;base64,${firstFrame}`
  }, [firstFrame]) // eslint-disable-line

  // ── Multishot state ──
  const [shots, setShots] = useState<ShotItem[]>(() => loadLS<ShotItem[]>('gen_vid_shots', [{ id: '1', prompt: '', duration: 3 }]))
  const [shotDescription, setShotDescription] = useState<string>(() => loadLS<string>('gen_vid_shotdesc', ''))
  const [shotCharacterPrompt, setShotCharacterPrompt] = useState<string>(() => loadLS<string>('gen_vid_shotchar', ''))
  const [enhancingShots, setEnhancingShots] = useState(false)
  // Persist multishot settings
  useEffect(() => { saveLS('gen_vid_shots', shots) }, [shots])
  useEffect(() => { saveLS('gen_vid_shotdesc', shotDescription) }, [shotDescription])
  useEffect(() => { saveLS('gen_vid_shotchar', shotCharacterPrompt) }, [shotCharacterPrompt])

  // ── Motion Control state ──
  const [motionImage, setMotionImage] = useState<string | null>(null)
  const [motionVideoUrl, setMotionVideoUrl] = useState('')
  const [motionVideoLabel, setMotionVideoLabel] = useState('')  // friendly name of picked/uploaded video
  const [motionVideoPicker, setMotionVideoPicker] = useState(false)
  const [motionVideoUploading, setMotionVideoUploading] = useState(false)
  const [motionVideoError, setMotionVideoError] = useState('')
  const motionVideoInputRef = useRef<HTMLInputElement>(null)
  const [motionOrientation, setMotionOrientation] = useState<'image' | 'video'>('image')
  const [motionKeepSound, setMotionKeepSound] = useState(false)

  // Pick a reference video from generated history → signed public URL for Kling
  async function pickMotionVideoFromHistory(item: VideoItem) {
    setMotionVideoPicker(false)
    setMotionVideoError('')
    try {
      const res = await fetch(`/api/video/public-url?id=${encodeURIComponent(item.id)}`)
      const data = await res.json()
      if (!data.url) throw new Error(data.error || 'Failed to get video URL')
      setMotionVideoUrl(data.url)
      setMotionVideoLabel(`From history: ${item.model.replace('kling-', '')} · ${item.duration}s${item.prompt ? ' · ' + item.prompt.slice(0, 40) : ''}`)
      setDubFileId(item.id)
    } catch (e: any) {
      setMotionVideoError(e.message)
    }
  }

  // Upload a local video file directly to Drive (browser → Google, bypasses Vercel 4.5MB limit)
  async function handleMotionVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMotionVideoError('')
    if (!/\.(mp4|mov)$/i.test(file.name)) { setMotionVideoError('Only .mp4 or .mov files are supported'); return }
    if (file.size > 100 * 1024 * 1024) { setMotionVideoError('File is too large (max 100MB)'); return }

    setMotionVideoUploading(true)
    try {
      const token = (session as any)?.accessToken
      if (!token) throw new Error('No Google access token — try re-signing in')
      const metaRes = await fetch('/api/video/public-url')
      const { folderId } = await metaRes.json()

      // 1. Init resumable upload
      const initRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': file.type || 'video/mp4',
          },
          body: JSON.stringify({
            name: `REF_${file.name}`,
            ...(folderId ? { parents: [folderId] } : {}),
            description: JSON.stringify({ uploadedBy: session?.user?.email || '', kind: 'motion-ref' }),
          }),
        }
      )
      if (!initRes.ok) throw new Error(`Upload init failed: ${await initRes.text()}`)
      const uploadUrl = initRes.headers.get('Location')
      if (!uploadUrl) throw new Error('No upload URL from Drive')

      // 2. Upload the file
      const upRes = await fetch(uploadUrl, { method: 'PUT', body: file })
      if (!upRes.ok) throw new Error(`Upload failed: ${upRes.status}`)
      const uploaded = await upRes.json()

      // 3. Signed public URL for Kling
      const urlRes = await fetch(`/api/video/public-url?id=${encodeURIComponent(uploaded.id)}`)
      const urlData = await urlRes.json()
      if (!urlData.url) throw new Error(urlData.error || 'Failed to get video URL')
      setMotionVideoUrl(urlData.url)
      setMotionVideoLabel(`Uploaded: ${file.name}`)
      setDubFileId(uploaded.id)
    } catch (err: any) {
      setMotionVideoError(err.message)
    }
    setMotionVideoUploading(false)
  }

  // ── Avatar state ──
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [avatarAudioBase64, setAvatarAudioBase64] = useState<string | null>(null)
  const [avatarAudioName, setAvatarAudioName] = useState('')
  const [avatarAudioDuration, setAvatarAudioDuration] = useState(0)
  const avatarAudioRef = useRef<HTMLInputElement>(null)

  // ── Dubbing state ──
  // Источник видео переиспользует motionVideoUrl/motionVideoLabel (режимы взаимоисключающие)
  const [dubLang, setDubLang] = useState('SP')
  // Прослушка голоса: играем готовый preview_url от ElevenLabs (бесплатно, без генерации)
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null)
  function playVoicePreview(voiceId: string) {
    const v = dubVoices.find(x => x.id === voiceId)
    if (!v?.previewUrl) return
    voicePreviewRef.current?.pause()
    voicePreviewRef.current = new Audio(v.previewUrl)
    voicePreviewRef.current.play().catch(() => {})
  }
  const [dubFileId, setDubFileId] = useState<string | null>(null) // fileId, если видео из истории
  const [dubPreparing, setDubPreparing] = useState(false)
  const [dubPrepared, setDubPrepared] = useState<{ sourceText: string; sourceLang: string; translatedText: string; audioBase64: string | null; speakers: number; segments?: { speaker: string; text: string }[]; speakerIds?: string[]; speakerInfo?: { id: string; role: string; sample: string; start: number; voiceProfile?: string }[]; timings?: { index: number; start: number; end: number }[]; suggestedVoiceMap?: Record<string, string>; aligned?: boolean } | null>(null)
  const [dubOnScreen, setDubOnScreen] = useState<Record<string, boolean>>({})
  const [dubProgress, setDubProgress] = useState('')
  const [dubLipsync, setDubLipsync] = useState(true) // выкл = просто заменить дорожку без движения губ
  const [dubFaces, setDubFaces] = useState<{ image: string; startMs: number; endMs: number }[] | null>(null)
  const [dubFaceMap, setDubFaceMap] = useState<Record<string, number>>({}) // speaker → индекс лица
  const [dubFacesLoading, setDubFacesLoading] = useState(false)
  const [dubClonedIds, setDubClonedIds] = useState<string[]>([]) // клоны на удаление после дубляжа
  const [dubVoiceNote, setDubVoiceNote] = useState('') // статус клонирования для показа

  async function cleanupClonedVoices() {
    if (!dubClonedIds.length) return
    fetch('/api/dubbing/cleanup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceIds: dubClonedIds }),
    }).catch(() => {})
    setDubClonedIds([])
  }

  // Страховка: если вкладку закроют во время дубляжа, зависшие клоны всё равно
  // удаляются через sendBeacon (обычный fetch при закрытии не успевает уйти).
  const dubClonedRef = useRef<string[]>([])
  dubClonedRef.current = dubClonedIds
  useEffect(() => {
    function onLeave() {
      const ids = dubClonedRef.current
      if (ids.length && navigator.sendBeacon) {
        navigator.sendBeacon('/api/dubbing/cleanup', new Blob([JSON.stringify({ voiceIds: ids })], { type: 'application/json' }))
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])
  const [dubVoices, setDubVoices] = useState<{ id: string; label: string; previewUrl?: string | null }[]>(DUB_VOICES)

  // Полный список голосов ElevenLabs — один раз при входе в режим дубляжа
  useEffect(() => {
    if (videoMode !== 'dubbing') return
    fetch('/api/dubbing/voices')
      .then(r => r.json())
      .then(d => { if (d.voices?.length) setDubVoices(d.voices) })
      .catch(() => {})
  }, [videoMode])
  const [dubVoiceMap, setDubVoiceMap] = useState<Record<string, string>>({})
  const [dubVoicingDialogue, setDubVoicingDialogue] = useState(false)

  async function handleDubDialogueVoice() {
    if (!dubPrepared?.segments) return
    setDubVoicingDialogue(true); setDubError('')
    try {
      const segs = dubPrepared.segments || []
      // Каждая реплика — отдельная озвучка своим голосом, подгонка под её слот
      // из Scribe. Тайминги эталонные (Scribe), чужие таймстемпы не нужны.
      const lines = segs.map((seg: any) => ({
        text: seg.text,
        voiceId: dubVoiceMap[seg.speaker] || dubVoices[0].id,
        dstStartMs: seg.origStartMs ?? 0,
        dstEndMs: seg.origEndMs ?? 0,
      })).filter((l: any) => l.text?.trim() && l.dstEndMs > l.dstStartMs)

      // Длина дорожки = длина видео (не конец последней реплики)
      let totalMs = Math.max(...segs.map((s: any) => s.origEndMs || 0))
      try {
        const vDur = await new Promise<number>((resolve, reject) => {
          const v = document.createElement('video')
          v.preload = 'metadata'
          v.onloadedmetadata = () => resolve(Math.round(v.duration * 1000))
          v.onerror = () => reject(new Error('no video duration'))
          v.src = dubFileId ? `/api/video/file/${dubFileId}` : motionVideoUrl
        })
        if (vDur > totalMs) totalMs = vDur
      } catch {}

      const d = await dubPost('voice', '/api/dubbing/voice-lines', { lines, totalMs })
      // aligned=true — дорожка уже собрана по таймингам Scribe
      setDubPrepared(prev => prev ? { ...prev, audioBase64: d.audioBase64, aligned: true } : prev)
    } catch (e: any) { setDubError(e.message) }
    setDubVoicingDialogue(false)
  }

  // Ожидание задачи Kling (для последовательных проходов липсинка)
  // Безопасный POST: если сервер вернул не-JSON (HTML 504/500 при таймауте/падении),
  // даём внятную ошибку со шагом и кодом вместо "Unexpected token '<'"
  async function dubPost(step: string, url: string, body: any): Promise<any> {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      throw new Error(`${step}: server returned ${res.status} (${res.statusText || 'error'}) — likely timeout on a long video`)
    }
    const d = await res.json()
    if (d.error) throw new Error(`${step}: ${d.error}`)
    return d
  }

  async function waitKlingTask(taskId: string, type: string): Promise<{ url: string; id: string; duration?: string }> {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const sr = await fetch(`/api/video/status/${taskId}?type=${type}`)
      const sd = await sr.json()
      if (sd.task_status === 'succeed') {
        const v = sd.task_result?.videos?.[0]
        if (!v?.url) throw new Error('Task succeeded but no video URL')
        return { url: v.url, id: v.id ?? '', duration: v.duration }
      }
      if (sd.task_status === 'failed') throw new Error(sd.task_status_msg || 'Kling task failed')
    }
    throw new Error('Task timed out')
  }
  const [dubEditedText, setDubEditedText] = useState('')
  const [dubRevoicing, setDubRevoicing] = useState(false)
  const [dubProcessing, setDubProcessing] = useState(false)
  const [dubStatus, setDubStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const [dubError, setDubError] = useState('')
  const dubPollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  async function handleDubPrepare() {
    if (!motionVideoUrl) return
    setDubPreparing(true); setDubError(''); setDubPrepared(null)
    setDubFaces(null); setDubFaceMap({}); setDubFacesLoading(true)

    // Лица грузим ПАРАЛЛЕЛЬНО с prepare (транскрипция+перевод+клон — долго),
    // чтобы к моменту показа карточек миниатюры уже были готовы
    const src = dubFileId ? { fileId: dubFileId } : { videoUrl: motionVideoUrl }
    const facesPromise = fetch('/api/dubbing/faces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(src),
    }).then(r => r.json()).catch(() => ({ faces: [] }))

    try {
      const res = await fetch('/api/dubbing/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(dubFileId ? { fileId: dubFileId } : { videoUrl: motionVideoUrl }),
          targetLang: dubLang,
        }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setDubPrepared(d)
      setDubEditedText(d.translatedText)
      setDubClonedIds(d.clonedVoiceIds || [])
      setDubVoiceNote(d.voiceNote || '')
      // Стартовая раскладка голосов (и для одного говорящего, и для диалога):
      // автоподбор по голосам из видео, чего не хватило — по кругу.
      // Закадровых (narrator/voice-over) помечаем off-screen.
      if (d.speakerIds?.length) {
        const map: Record<string, string> = {}
        const onScreen: Record<string, boolean> = {}
        d.speakerIds.forEach((sp: string, i: number) => {
          map[sp] = d.suggestedVoiceMap?.[sp] || dubVoices[i % dubVoices.length].id
          const role = (d.speakerInfo?.find((s: any) => s.id === sp)?.role || '').toLowerCase()
          onScreen[sp] = !/narrator|voice[- ]?over|announcer/.test(role)
        })
        setDubVoiceMap(map)
        setDubOnScreen(onScreen)
      }
      // Забираем результат уже стартовавшего параллельно запроса лиц
      if (d.speakerIds?.length > 1) {
        const f = await facesPromise
        if (f.faces?.length) setDubFaces(f.faces)
      }
    } catch (e: any) { setDubError(e.message) }
    setDubPreparing(false); setDubFacesLoading(false)
  }

  async function handleDubRevoice() {
    if (!dubPrepared || !dubEditedText.trim()) return
    setDubRevoicing(true); setDubError('')
    try {
      const sp = dubPrepared.speakerIds?.[0] || ''
      const res = await fetch('/api/dubbing/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dubEditedText, voiceId: dubVoiceMap[sp] || dubVoices[0].id }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setDubPrepared(prev => prev ? { ...prev, translatedText: dubEditedText, audioBase64: d.audioBase64 } : prev)
    } catch (e: any) { setDubError(e.message) }
    setDubRevoicing(false)
  }

  function stopDubPoll() { if (dubPollRef.current) { clearInterval(dubPollRef.current); dubPollRef.current = null } }

  async function handleDubStart() {
    if (!dubPrepared?.audioBase64 || !motionVideoUrl) return
    const audioB64 = dubPrepared.audioBase64
    const prepared = dubPrepared
    // Временные куски (REF_cut_*) — удаляем при ЛЮБОМ исходе, чтобы не засоряли Drive
    const tempFileIds: string[] = []
    const purgeTempClips = () => {
      tempFileIds.forEach(id => fetch(`/api/video/file/${id}`, { method: 'DELETE' }).catch(() => {}))
      tempFileIds.length = 0
    }
    setDubProcessing(true); setDubStatus('processing'); setDubError(''); setDubProgress('')
    try {
      // Длительность mp3 берём из аудио-элемента
      const audioDurationMs = await new Promise<number>((resolve, reject) => {
        const a = new Audio(`data:audio/mpeg;base64,${audioB64}`)
        a.onloadedmetadata = () => resolve(Math.round(a.duration * 1000))
        a.onerror = () => reject(new Error('Failed to read audio duration'))
      })

      const isDialog = (prepared.speakers > 1) && !!prepared.segments?.length

      // Аудио уже выровнено на шаге Voice dialogue (prepared.aligned) — не трогаем.
      const workAudio = audioB64

      // Галочка Lip-sync выключена: губы не трогаем, просто кладём озвучку
      // поверх видео (оригинальный звук выключается), с выравниванием по паузам
      if (!dubLipsync) {
        setDubProgress('Mixing audio...')
        const finRes = await fetch('/api/dubbing/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(dubFileId ? { fileId: dubFileId } : { videoUrl: motionVideoUrl }),
            audioBase64: workAudio, // уже выровнена (для диалога), для одного голоса — как есть
            prompt: `[dubbed → ${dubLang}, no lip-sync] ${prepared.sourceText.slice(0, 120)}`,
            targetLang: dubLang,
            duration: String(Math.round(audioDurationMs / 1000)),
          }),
        })
        const fin = await finRes.json()
        if (fin.error) throw new Error(fin.error)
        setDubStatus('done'); setDubProcessing(false); setDubProgress(''); fetchHistory(); cleanupClonedVoices()
        return
      }

      if (!isDialog) {
        // Один говорящий: один проход на всю дорожку + сохранение результата Kling как есть
        setDubProgress('Lip-sync...')
        const res = await fetch('/api/dubbing/lipsync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(dubFileId ? { fileId: dubFileId } : { videoUrl: motionVideoUrl }),
            audioBase64: workAudio, audioDurationMs,
          }),
        })
        const d = await res.json()
        if (d.error) throw new Error(d.error)
        const result = await waitKlingTask(d.task_id, 'advanced-lip-sync')
        await fetch('/api/video/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: result.url, klingVideoId: result.id,
            prompt: `[dubbed → ${dubLang}] ${prepared.sourceText.slice(0, 120)}`,
            model: 'dubbing', duration: result.duration || '0',
            aspectRatio: '', sound: 'on', inputType: 'dubbing',
          }),
        })
        setDubStatus('done'); setDubProcessing(false); setDubProgress(''); fetchHistory(); cleanupClonedVoices()
        return
      }

      // ── Диалог: НАРЕЗКА оригинала на непрерывные куски + липсинк по кускам ──
      // Каждая реплика = один кусок [origStart..origEnd]. Экранная и ≥2с → в Kling
      // (в куске одно активное лицо, наложения проходов нет). Закадровая/короткая →
      // кусок без липсинка. Промежутки между репликами — тоже отдельные куски.
      // В конце всё склеивается, звук — выровненный workAudio.
      const LEAD_MS = 80 // должно совпадать с LEAD_MS в /api/dubbing/align
      const segs = prepared.segments!.map((seg: any) => ({
        startMs: seg.origStartMs ?? 0,
        endMs: seg.origEndMs ?? 0,
        speaker: seg.speaker,
        onScreen: dubOnScreen[seg.speaker] !== false,
      })).filter((s: any) => s.endMs > s.startMs).sort((a: any, b: any) => a.startMs - b.startMs)

      // Строим непрерывное покрытие [0..videoEnd]: реплики + промежутки-паузы
      type Piece = { startMs: number; endMs: number; lipsync: boolean; speaker?: string }
      const pieces: Piece[] = []
      let cursor = 0
      const videoEndMs = Math.max(...segs.map((s: any) => s.endMs), Math.round(audioDurationMs))
      for (const s of segs) {
        if (s.startMs > cursor + 50) pieces.push({ startMs: cursor, endMs: s.startMs, lipsync: false }) // пауза
        // ≥2.2с: после укорочения окна звука на 150мс останется ≥2с (минимум Kling),
        // и звук гарантированно короче куска видео (иначе Kling: "audio end > video")
        const longEnough = (s.endMs - s.startMs) >= 2200
        pieces.push({ startMs: s.startMs, endMs: s.endMs, lipsync: s.onScreen && longEnough, speaker: s.speaker })
        cursor = s.endMs
      }
      if (cursor < videoEndMs - 50) pieces.push({ startMs: cursor, endMs: videoEndMs, lipsync: false })

      const lipCount = pieces.filter(p => p.lipsync).length
      const clipUrls: string[] = []
      let done = 0

      for (const p of pieces) {
        // 1. Вырезаем кусок оригинала
        setDubProgress(`Preparing clips (${clipUrls.length + 1}/${pieces.length})...`)
        const cut = await dubPost('cut', '/api/dubbing/cut', { ...(dubFileId ? { fileId: dubFileId } : { videoUrl: motionVideoUrl }), startMs: p.startMs, endMs: p.endMs })
        tempFileIds.push(cut.fileId)
        let clipUrl: string = cut.url

        // 2. Если кусок под липсинк — прогоняем его через Kling целиком.
        // Звук — срез workAudio для этой реплики, вставляется с 0 (кусок начинается с неё)
        if (p.lipsync) {
          done++
          setDubProgress(`Lip-sync ${done}/${lipCount}...`)
          // Эталон лица говорящего: если в куске окажется несколько лиц
          // (сплошной план — оба в кадре), GPT-vision выберет нужное по картинке
          const faceIdx = p.speaker ? dubFaceMap[p.speaker] : undefined
          const faceImageUrl = (dubFaces && faceIdx !== undefined && dubFaces[faceIdx]) ? dubFaces[faceIdx].image : undefined
          const ld = await dubPost('lip-sync', '/api/dubbing/lipsync', {
            videoUrl: clipUrl,
            audioBase64: workAudio, audioDurationMs,
            // окно короче куска на 150мс — чтобы конец звука не вышел за длину видео
            window: { soundStartMs: p.startMs + LEAD_MS, soundEndMs: p.endMs + LEAD_MS - 150, insertMs: 0 },
            originalAudioVolume: 0,
            faceImageUrl,
          })
          const result = await waitKlingTask(ld.task_id, 'advanced-lip-sync')
          clipUrl = result.url
        }
        clipUrls.push(clipUrl)
      }

      // 3. Склейка кусков + выровненная озвучка поверх
      setDubProgress('Stitching final video...')
      await dubPost('stitch', '/api/dubbing/stitch', {
        clipUrls, audioBase64: workAudio, tempFileIds,
        prompt: `[dubbed → ${dubLang}] ${prepared.sourceText.slice(0, 120)}`,
        targetLang: dubLang, duration: String(Math.round(audioDurationMs / 1000)),
      })

      setDubStatus('done'); setDubProcessing(false); setDubProgress(''); fetchHistory(); cleanupClonedVoices(); purgeTempClips()
    } catch (e: any) { setDubError(e.message); setDubStatus('error'); setDubProcessing(false); setDubProgress(''); cleanupClonedVoices(); purgeTempClips() }
  }

  // ── Generation state ──
  const [status, setStatus] = useState<TaskStatus>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [savingToDrive, setSavingToDrive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)


  // ── History state ──
  const [history, setHistory] = useState<VideoItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<VideoItem | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── Derived ──
  const canUseDubbing = DUBBING_ALLOWED_EMAILS.has(session?.user?.email || '')
  const currentModel = MODELS.find(m => m.id === model)!

  // Если dubbing остался в localStorage у пользователя без доступа — сбрасываем
  useEffect(() => {
    if (model === 'dubbing' && session && !canUseDubbing) setModel('kling-v3')
  }, [model, session, canUseDubbing])
  const totalShotsDuration = shots.reduce((s, sh) => s + sh.duration, 0)
  const isTurboModel = TURBO_MODELS.has(model)
  const isOmniModel = OMNI_MODELS.has(model)

  const estimatedCost = useMemo(() => {
    const durationSec = videoMode === 'multishot' ? totalShotsDuration : videoMode === 'avatar' ? avatarAudioDuration : duration
    return estimateCost({ model, qualityMode: mode, sound, videoMode, hasImage: !!firstFrame, durationSec })
  }, [model, mode, sound, videoMode, firstFrame, duration, totalShotsDuration, avatarAudioDuration])

  const canGenerate = useMemo(() => {
    if (status === 'pending' || status === 'processing') return false
    if (videoMode === 'standard') return prompt.trim().length > 0
    if (videoMode === 'multishot') return (shots.some(s => s.prompt.trim().length > 0) || shotDescription.trim().length > 0) && totalShotsDuration <= 15
    if (videoMode === 'motionControl') return !!motionImage && !!motionVideoUrl
    if (videoMode === 'avatar') return !!avatarImage && !!avatarAudioBase64
    if (videoMode === 'dubbing') return false // у дубляжа свои кнопки
    return false
  }, [status, videoMode, prompt, shots, shotDescription, motionImage, motionVideoUrl, avatarImage, avatarAudioBase64])

  const historyUsers = Array.from(
    new Map(history.filter(v => v.userEmail).map(v => [v.userEmail, v])).values()
  ).map(v => ({ email: v.userEmail, name: v.userName, image: v.userImage }))

  const filteredHistory = selectedEmails.size ? history.filter(v => selectedEmails.has(v.userEmail)) : history
  function toggleEmail(email: string) {
    setSelectedEmails(prev => {
      const next = new Set(prev)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  // ── Reset videoMode when model changes and mode not supported ──
  useEffect(() => {
    if (!currentModel.modes.includes(videoMode)) {
      setVideoMode(currentModel.modes[0])
    }
  }, [model]) // eslint-disable-line

  // Тихое автообновление сетки каждые 3 минуты (без перерендера, если новых нет;
  // новое подклеивается сверху; пауза при открытой карточке)
  const selectedItemRef = useRef(selectedItem)
  selectedItemRef.current = selectedItem
  useEffect(() => {
    const id = setInterval(async () => {
      if (selectedItemRef.current) return
      try {
        const res = await fetch('/api/video/history')
        const data = await res.json()
        const fresh: VideoItem[] = data.items || []
        if (!fresh.length) return
        setHistory(prev => {
          if (!prev.length) return fresh
          if (prev[0]?.id === fresh[0]?.id) return prev // ничего нового
          const known = new Set(prev.map(p => p.id))
          const newOnes = fresh.filter(it => !known.has(it.id))
          return newOnes.length ? [...newOnes, ...prev] : prev
        })
      } catch {}
    }, 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── History load ──
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/video/history')
      const data = await res.json()
      setHistory(data.items || [])
      setNextPageToken(data.nextPageToken || null)
    } catch {}
    setHistoryLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/video/history?pageToken=${encodeURIComponent(nextPageToken)}`)
      const data = await res.json()
      setHistory(prev => [...prev, ...(data.items || [])])
      setNextPageToken(data.nextPageToken || null)
    } catch {}
    setLoadingMore(false)
  }, [nextPageToken, loadingMore])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  useEffect(() => {
    const el = sentinelRef.current; if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [loadMore])

  // ── Polling ──
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollStatus = useCallback((taskId: string, type: string, savePayload: any) => {
    stopPolling()
    const startedAt = Date.now()
    const TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        stopPolling()
        setQueueActive('kling', false)
        setError('Generation timed out after 10 minutes. Please try again.')
        setStatus('error')
        return
      }
      try {
        const res = await fetch(`/api/video/status/${taskId}?type=${type}`)
        const data = await res.json()
        if (data.task_status === 'succeed') {
          stopPolling()
          setQueueActive('kling', false)
          const url = data.task_result?.videos?.[0]?.url ?? null
          const vid = data.task_result?.videos?.[0]?.id ?? ''
          setVideoUrl(url); setStatus('done')
          if (url) {
            setSavingToDrive(true)
            fetch('/api/video/save', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoUrl: url, klingVideoId: vid, ...savePayload }),
            }).then(r => r.json()).then(d => {
              setSavingToDrive(false)
              if (d.error) setError('Video generated but failed to save: ' + d.error)
              else fetchHistory()
            }).catch(e => { setSavingToDrive(false); setError('Video generated but failed to save to Drive: ' + e.message) })
          }
        } else if (data.task_status === 'failed') {
          stopPolling()
          setQueueActive('kling', false)
          setError(data.task_status_msg ?? 'Generation failed'); setStatus('error')
        }
      } catch (e: any) {
        console.warn('[poll] fetch error:', e.message)
      }
    }, 5000)
  }, [stopPolling, fetchHistory])

  // ── Handlers ──

  function addShot() {
    if (shots.length >= 6) return
    const remaining = 15 - totalShotsDuration
    setShots(prev => [...prev, { id: Math.random().toString(36).slice(2), prompt: '', duration: Math.min(3, remaining) }])
  }
  function removeShot(id: string) {
    if (shots.length <= 1) return
    setShots(prev => prev.filter(s => s.id !== id))
  }
  function updateShot(id: string, field: 'prompt' | 'duration', value: string | number) {
    setShots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function handleAvatarAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const b64 = dataUrl.split(',')[1]
      setAvatarAudioBase64(b64)
      setAvatarAudioName(file.name)
      // Read audio duration via AudioContext
      try {
        const ctx = new AudioContext()
        dataUrl.split(',')[0] // just to confirm it's there
        const raw = atob(b64)
        const buf = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
        ctx.decodeAudioData(buf.buffer, decoded => {
          setAvatarAudioDuration(Math.round(decoded.duration))
          ctx.close()
        }, () => { ctx.close() })
      } catch {}
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleAssetUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)
        setAssets(prev => [...prev, { id: Math.random().toString(36).slice(2), name, base64 }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function handlePromptKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { setAtPopup(false); setAtQuery(''); return }
    const ta = e.currentTarget
    const val = ta.value; const pos = ta.selectionStart ?? 0
    const before = val.slice(0, pos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx !== -1 && !before.slice(atIdx).includes(' ')) {
      setAtQuery(before.slice(atIdx + 1)); setAtPopup(true)
    } else { setAtPopup(false); setAtQuery('') }
  }

  function insertAssetMention(name: string) {
    const ta = textareaRef.current; if (!ta) return
    const val = ta.value; const pos = ta.selectionStart ?? 0
    const before = val.slice(0, pos); const atIdx = before.lastIndexOf('@')
    const newVal = val.slice(0, atIdx) + `@${name}` + val.slice(pos)
    setPrompt(newVal); setAtPopup(false); setAtQuery('')
    setTimeout(() => { ta.focus(); ta.setSelectionRange(atIdx + name.length + 1, atIdx + name.length + 1) }, 0)
  }

  function handlePickerSelect(b64: string) {
    if (pickerTarget === 'first') setFirstFrame(b64)
    else if (pickerTarget === 'last') setLastFrame(b64)
    else if (pickerTarget === 'motion') setMotionImage(b64)
    else if (pickerTarget === 'avatar') setAvatarImage(b64)
    setPickerTarget(null)
  }

  // ── Enhance prompt ──
  async function handleEnhancePrompt() {
    if (enhancing) return
    setEnhancing(true)
    try {
      // Collect all images: firstFrame + assets
      const images: string[] = []
      if (firstFrame) images.push(firstFrame)
      assets.forEach(a => {
        const raw = a.base64.startsWith('data:') ? a.base64 : `data:image/jpeg;base64,${a.base64}`
        images.push(raw)
      })
      const res = await fetch('/api/video/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim() || 'Create a cinematic video',
          mode: 'standard',
          model: currentModel.label,
          aspectRatio: firstFrame ? '' : aspectRatio,
          duration,
          images: images.length ? images : undefined,
        }),
      })
      const data = await res.json()
      if (data.prompt) setPrompt(data.prompt)
      else if (data.error) setError(data.error)
    } catch {}
    setEnhancing(false)
  }

  // ── Enhance shots ──
  async function handleEnhanceShots() {
    const description = shotDescription.trim() || shots.map(s => s.prompt).join(' ').trim()
    if (!description || enhancingShots) return
    setEnhancingShots(true)
    try {
      const images: string[] = []
      if (firstFrame) {
        // Compress before sending — raw firstFrame can exceed Next.js body limit
        const compressed = await shrinkForVideo('data:image/jpeg;base64,' + firstFrame, 512)
        images.push(compressed) // send as full data URL
      }
      const res = await fetch('/api/video/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: description,
          mode: 'multishot',
          model: currentModel.label,
          shots: shots.map(s => ({ duration: s.duration })),
          images: images.length ? images : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (Array.isArray(data.shots) && data.shots.length > 0) {
        setShots(prev => {
          const result = prev.map((s, i) => data.shots[i] ? { ...s, prompt: data.shots[i] } : s)
          // Auto-add shots if GPT returned more than we currently have
          for (let i = result.length; i < Math.min(data.shots.length, 6); i++) {
            const used = result.reduce((sum: number, sh: any) => sum + sh.duration, 0)
            const remaining = 15 - used
            if (remaining <= 0) break
            result.push({ id: Math.random().toString(36).slice(2), prompt: data.shots[i], duration: Math.min(3, remaining) })
          }
          return result
        })
      }
    } catch (e: any) {
      setError(e.message || 'Failed to write shots')
    }
    setEnhancingShots(false)
  }

  // ── Fetch with retry (handles 429 / rate-limit errors) ──
  async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 3): Promise<any> {
    let lastError: Error = new Error('Unknown error')
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(url, options)
      const data = await res.json()
      if (res.status === 429 || (data.error && /rate.?limit|too many|429/i.test(String(data.error)))) {
        lastError = new Error(data.error || 'Rate limit exceeded')
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, attempt * 3000)) // 3s, 6s backoff
          continue
        }
        throw lastError
      }
      if (data.error) throw new Error(data.error)
      return data
    }
    throw lastError
  }

  // ── Generate ──
  const handleGenerate = async () => {
    if (!canGenerate) return
    setStatus('pending'); setVideoUrl(null); setError(null)
    setQueueActive('kling', true)

    try {
      // Compress firstFrame/lastFrame/avatarImage before sending — Vercel 4.5MB limit
      const ff = firstFrame ? (await shrinkForVideo('data:image/jpeg;base64,' + firstFrame, 1024)).split(',')[1] : null
      const lf = lastFrame ? (await shrinkForVideo('data:image/jpeg;base64,' + lastFrame, 1024)).split(',')[1] : null
      const ai = avatarImage ? (await shrinkForVideo('data:image/jpeg;base64,' + avatarImage, 1024)).split(',')[1] : null
      const mi = motionImage ? (await shrinkForVideo('data:image/jpeg;base64,' + motionImage, 1024)).split(',')[1] : null
      if (videoMode === 'motionControl') {
        const motionModel = (model === 'kling-v3' || model === 'kling-v3-omni') ? 'kling-v3' : 'kling-v2-6'
        const data = await fetchWithRetry('/api/video/motion-control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: mi, video_url: motionVideoUrl, prompt, model_name: motionModel, character_orientation: motionOrientation, keep_original_sound: motionKeepSound ? 'yes' : 'no', mode }),
        })
        setStatus('processing')
        pollStatus(data.task_id, 'motion-control', { prompt: prompt || 'Motion control video', model, duration: String(duration), aspectRatio: '', sound: 'off', inputType: 'motion', units: estimatedCost ?? 0 })
        return
      }

      if (videoMode === 'avatar') {
        const data = await fetchWithRetry('/api/video/avatar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: ai, sound_file: avatarAudioBase64, prompt, mode }),
        })
        setStatus('processing')
        pollStatus(data.task_id, 'avatar', { prompt: prompt || 'Avatar video', model, duration: String(avatarAudioDuration || duration), aspectRatio: '', sound: 'off', inputType: 'avatar', units: estimatedCost ?? 0 })
        return
      }

      if (videoMode === 'multishot') {
        const charPrefix = shotCharacterPrompt.trim() ? `[Character: ${shotCharacterPrompt.trim()}] ` : ''
        const allShotsHavePrompts = shots.every(s => s.prompt.trim())
        const effectivePrompt = allShotsHavePrompts
          ? shots.map((s, i) => `shot ${i + 1}, ${s.duration}, ${charPrefix}${s.prompt}`).join('; ')
          : (charPrefix + shotDescription)
        const totalDur = totalShotsDuration

        if (isTurboModel) {
          const data = await fetchWithRetry('/api/video/turbo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_name: model, prompt: effectivePrompt, first_frame: ff, duration: totalDur, aspect_ratio: aspectRatio }),
          })
          setStatus('processing')
          pollStatus(data.task_id, 'turbo', { prompt: effectivePrompt, model, duration: String(totalDur), aspectRatio: '', sound: 'off', inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
        } else if (isOmniModel) {
          const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'
          const body: any = allShotsHavePrompts
            ? {
                model_name: model, multi_shot: true, duration: totalDur, mode, sound: soundParam,
                multi_prompt: shots.map((s, i) => ({ index: i + 1, prompt: `${charPrefix}${s.prompt}`, duration: String(s.duration) })),
              }
            : { model_name: model, prompt: effectivePrompt, duration: totalDur, mode, sound: soundParam }
          if (ff) body.first_frame = ff
          else body.aspect_ratio = aspectRatio
          const data = await fetchWithRetry('/api/video/omni', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
          setStatus('processing')
          pollStatus(data.task_id, 'omni-video', { prompt: effectivePrompt, model, duration: String(totalDur), aspectRatio: ff ? '' : aspectRatio, sound: soundParam, inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
        } else {
          const type = firstFrame ? 'image2video' : 'text2video'
          const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'
          const body = firstFrame
            ? { model_name: model, image: ff, prompt: effectivePrompt, mode, duration: String(totalDur), sound: soundParam }
            : { model_name: model, prompt: effectivePrompt, mode, duration: String(totalDur), aspect_ratio: aspectRatio, sound: soundParam }
          const data = await fetchWithRetry(`/api/video/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          setStatus('processing')
          pollStatus(data.task_id, type, { prompt: effectivePrompt, model, duration: String(totalDur), aspectRatio: firstFrame ? '' : aspectRatio, sound: soundParam, inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
        }
        return
      }

      // Standard mode
      if (isTurboModel) {
        const data = await fetchWithRetry('/api/video/turbo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: model, prompt, first_frame: ff, duration, aspect_ratio: aspectRatio }),
        })
        setStatus('processing')
        pollStatus(data.task_id, 'turbo', { prompt, model, duration: String(duration), aspectRatio: '', sound: 'off', inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
      } else if (isOmniModel) {
        const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'
        const body: any = { model_name: model, prompt, duration, mode, sound: soundParam }
        if (ff) body.first_frame = ff
        else body.aspect_ratio = aspectRatio
        const data = await fetchWithRetry('/api/video/omni', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        setStatus('processing')
        pollStatus(data.task_id, 'omni-video', { prompt, model, duration: String(duration), aspectRatio: ff ? '' : aspectRatio, sound: soundParam, inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
      } else {
        const type = firstFrame ? 'image2video' : 'text2video'
        const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'
        const body = firstFrame
          ? { model_name: model, image: ff, ...(lastFrame && currentModel.supportsLastFrame ? { image_tail: lf } : {}), prompt, negative_prompt: negPrompt, mode, duration: String(duration), sound: soundParam }
          : { model_name: model, prompt, negative_prompt: negPrompt, mode, duration: String(duration), aspect_ratio: aspectRatio, sound: soundParam }
        const data = await fetchWithRetry(`/api/video/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        setStatus('processing')
        pollStatus(data.task_id, type, { prompt, model, duration: String(duration), aspectRatio: firstFrame ? '' : aspectRatio, sound: soundParam, inputType: firstFrame ? 'image' : 'text', units: estimatedCost ?? 0 })
      }
    } catch (e: any) { setQueueActive('kling', false); setError(e.message); setStatus('error') }
  }

  const filteredAtAssets = assets.filter(a => a.name.toLowerCase().includes(atQuery.toLowerCase()))

  return (
    <div className="flex flex-1 min-h-0">

      {/* ── Left sidebar ── */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ width: 340, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex flex-col gap-0 p-4">

          {/* Model selector */}
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Model</div>
            <ModelDropdown model={model} onSelect={setModel}
              hiddenIds={canUseDubbing ? undefined : new Set(['dubbing'])} />
          </div>

          {/* Mode selector */}
          {currentModel.modes.length > 1 && (
            <div className="mb-4">
              <div className="flex gap-0 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {currentModel.modes.map((m, i) => (
                  <button key={m} onClick={() => setVideoMode(m)}
                    className="flex-1 py-2 text-[11px] font-medium transition-all"
                    style={{
                      background: videoMode === m ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.02)',
                      color: videoMode === m ? 'var(--accent)' : 'var(--text-muted)',
                      borderRight: i < currentModel.modes.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Standard Mode ── */}
          {videoMode === 'standard' && (
            <>
              {/* Frames — above prompt */}
              <div className="mb-3 flex gap-2">
                <div className="flex-1">
                  <ImageUploadBox label="First frame" preview={firstFrame}
                    onUpload={setFirstFrame} onClear={() => setFirstFrame(null)}
                    onPickFromLibrary={() => setPickerTarget('first')} compact />
                </div>
                {currentModel.supportsLastFrame && (
                  <div className="flex-1">
                    <ImageUploadBox label="Last frame" preview={lastFrame}
                      onUpload={setLastFrame} onClear={() => setLastFrame(null)}
                      onPickFromLibrary={() => setPickerTarget('last')} compact />
                  </div>
                )}
              </div>

              {/* Assets — only for Omni (image_list support) */}
              {currentModel.supportsImageList && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {assets.map(asset => (
                      <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                        style={{ background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.25)', color: 'var(--text)' }}>
                        <img src={asset.base64} alt={asset.name} className="w-4 h-4 rounded object-cover" />
                        <span className="font-mono" style={{ color: 'var(--accent)' }}>@{asset.name}</span>
                        <button onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))} className="ml-0.5 opacity-50 hover:opacity-100" style={{ color: 'var(--text-muted)' }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => assetInputRef.current?.click()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span> Asset
                    </button>
                    <input ref={assetInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAssetUpload} />
                  </div>
                </div>
              )}

              {/* Prompt */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {firstFrame ? 'Motion prompt' : 'Prompt'}
                  </div>
                  <button onClick={handleEnhancePrompt} disabled={enhancing}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                    style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                    {enhancing ? (
                      <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    ) : '✦'} Enhance
                  </button>
                </div>
                <div className="relative">
                  <textarea ref={textareaRef} value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyUp={currentModel.supportsImageList ? handlePromptKeyUp : undefined}
                    placeholder={firstFrame ? 'Describe how it should move...' : 'Describe the video...'}
                    maxLength={2500}
                    rows={5} className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${prompt ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text)', caretColor: 'var(--accent)', fontFamily: 'inherit' }} />
                  {prompt.length > 2200 && (
                    <span className="absolute bottom-2 right-2 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(0,0,0,0.6)', color: prompt.length >= 2500 ? '#f87171' : 'rgba(255,255,255,0.5)' }}>
                      {prompt.length}/2500
                    </span>
                  )}
                  {currentModel.supportsImageList && atPopup && filteredAtAssets.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden z-40"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}>
                      {filteredAtAssets.map(asset => (
                        <button key={asset.id} onMouseDown={e => { e.preventDefault(); insertAssetMention(asset.name) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:bg-white/5">
                          <img src={asset.base64} alt={asset.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                          <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>@{asset.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Negative prompt */}
              <div className="mb-3">
                <button onClick={() => setNegOpen(o => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-1.5 transition-all"
                  style={{ color: negOpen ? 'var(--text)' : 'var(--text-muted)' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${negOpen ? 'rotate-180' : ''}`}>
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Negative prompt
                </button>
                {negOpen && (
                  <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)} placeholder="What to avoid..." rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                )}
              </div>
            </>
          )}

          {/* ── Multishot Mode ── */}
          {videoMode === 'multishot' && (
            <>
              {/* First frame — at the top */}
              <ImageUploadBox label="First frame (optional)" preview={firstFrame}
                onUpload={setFirstFrame} onClear={() => setFirstFrame(null)}
                onPickFromLibrary={() => setPickerTarget('first')} compact />

              {/* General prompt for enhance */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Script prompt</div>
                  <button onClick={handleEnhanceShots} disabled={enhancingShots || (!shotDescription.trim() && !shots.some(s => s.prompt.trim()))}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                    style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                    {enhancingShots ? (
                      <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    ) : '✦'} Write shots
                  </button>
                </div>
                <textarea value={shotDescription} onChange={e => setShotDescription(e.target.value)}
                  placeholder="Describe the video idea, GPT will write per-shot prompts..." rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }} />
              </div>

              {/* Character lock */}
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Character prompt</div>
                  <span title="Prepended to every shot — keeps character appearance, voice and style consistent across all scenes."
                    className="text-[10px] w-4 h-4 rounded-full flex items-center justify-center cursor-help flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>?</span>
                </div>
                <textarea value={shotCharacterPrompt} onChange={e => setShotCharacterPrompt(e.target.value)}
                  placeholder="e.g. 30-year-old woman, red curly hair, white linen shirt, soft natural light..." rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${shotCharacterPrompt ? 'rgba(79,110,247,0.4)' : 'var(--border)'}`, color: 'var(--text)', fontFamily: 'inherit' }} />
              </div>

              {/* Shot builder */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Shots</div>
                  <span className="text-[11px] font-medium" style={{ color: totalShotsDuration >= 15 ? '#f87171' : 'var(--text-muted)' }}>
                    {totalShotsDuration} / 15s
                  </span>
                </div>
                {shots.map((shot, i) => (
                  <div key={shot.id} className="mb-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Shot {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>{shot.duration}s</span>
                        {shots.length > 1 && (
                          <button onClick={() => removeShot(shot.id)} className="text-xs leading-none opacity-50 hover:opacity-100" style={{ color: '#f87171' }}>×</button>
                        )}
                      </div>
                    </div>
                    <textarea value={shot.prompt} onChange={e => updateShot(shot.id, 'prompt', e.target.value)}
                      placeholder={`Describe shot ${i + 1}...`} rows={2}
                      className="w-full rounded-lg px-2.5 py-2 text-xs resize-none outline-none mb-2"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }} />
                    <input type="range" min={1} max={15} step={1}
                      value={shot.duration} onChange={e => updateShot(shot.id, 'duration', Number(e.target.value))}
                      className="w-full" style={{ accentColor: totalShotsDuration > 15 ? '#f87171' : 'var(--accent)' }} />
                  </div>
                ))}
                <button onClick={addShot}
                  disabled={shots.length >= 6}
                  className="w-full py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: shots.length >= 6 ? 'rgba(255,255,255,0.03)' : 'rgba(79,110,247,0.08)',
                    color: shots.length >= 6 ? 'rgba(255,255,255,0.2)' : 'var(--accent)',
                    border: '1px dashed var(--border)',
                    cursor: shots.length >= 6 ? 'not-allowed' : 'pointer',
                  }}>
                  + Add shot {shots.length >= 6 ? '(max 6)' : ''}
                </button>
              </div>

            </>
          )}

          {/* ── Motion Control Mode ── */}
          {videoMode === 'motionControl' && (
            <>
              <ImageUploadBox label="Character photo" preview={motionImage}
                onUpload={setMotionImage} onClear={() => setMotionImage(null)}
                onPickFromLibrary={() => setPickerTarget('motion')} />

              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Motion reference video</div>
                {motionVideoUrl ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid var(--border)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                    </svg>
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text)' }}>{motionVideoLabel || motionVideoUrl}</span>
                    <button onClick={() => { setMotionVideoUrl(''); setMotionVideoLabel('') }}
                      className="opacity-50 hover:opacity-100 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>×</button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setMotionVideoPicker(true)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                        🎬 From history
                      </button>
                      <button onClick={() => motionVideoInputRef.current?.click()} disabled={motionVideoUploading}
                        className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                        {motionVideoUploading ? 'Uploading...' : '⬆ Upload .mp4 / .mov'}
                      </button>
                    </div>
                    <input value={motionVideoUrl} onChange={e => { setMotionVideoUrl(e.target.value); setMotionVideoLabel('') }}
                      placeholder="or paste URL: https://... (.mp4 or .mov)"
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </>
                )}
                <input ref={motionVideoInputRef} type="file" accept=".mp4,.mov,video/mp4,video/quicktime" className="hidden" onChange={handleMotionVideoUpload} />
                {motionVideoError && <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>{motionVideoError}</p>}
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Min 3s · Max {motionOrientation === 'image' ? '10s' : '30s'} · up to 100MB
                </p>
              </div>

              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt (optional)</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder="Clothing, scene details..." rows={2} maxLength={2500}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Character orientation</div>
                  <span title="'By photo' — character faces as in the photo (video max 10s). 'By video' — character follows orientation from the reference video (video max 30s)."
                    className="text-[10px] w-4 h-4 rounded-full flex items-center justify-center cursor-help flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>?</span>
                </div>
                <div className="flex gap-2">
                  {([['image', 'By photo'], ['video', 'By video']] as ['image' | 'video', string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setMotionOrientation(val)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: motionOrientation === val ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: motionOrientation === val ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${motionOrientation === val ? 'var(--accent)' : 'var(--border)'}` }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Keep original sound</span>
                <button onClick={() => setMotionKeepSound(s => !s)}
                  className="relative w-9 h-5 rounded-full transition-all"
                  style={{ background: motionKeepSound ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: motionKeepSound ? '18px' : '2px' }} />
                </button>
              </div>
            </>
          )}

          {/* ── Avatar Mode ── */}
          {videoMode === 'avatar' && (
            <>
              <ImageUploadBox label="Avatar photo" preview={avatarImage}
                onUpload={setAvatarImage} onClear={() => setAvatarImage(null)}
                onPickFromLibrary={() => setPickerTarget('avatar')} />

              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Audio file</div>
                {avatarAudioBase64 ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid var(--border)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text)' }}>{avatarAudioName}</span>
                    <button onClick={() => { setAvatarAudioBase64(null); setAvatarAudioName(''); setAvatarAudioDuration(0) }}
                      className="opacity-50 hover:opacity-100 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => avatarAudioRef.current?.click()}
                    className="w-full py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                    Upload .mp3 / .wav / .m4a / .aac
                  </button>
                )}
                <input ref={avatarAudioRef} type="file" accept=".mp3,.wav,.m4a,.aac" className="hidden" onChange={handleAvatarAudio} />
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>2–300 seconds · max 5MB</p>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Prompt (optional)</div>
                  <button onClick={handleEnhancePrompt} disabled={enhancing}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                    style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                    {enhancing ? (
                      <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    ) : '✦'} Enhance
                  </button>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder="Gestures, emotions, camera movements..." rows={3} maxLength={2500}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </>
          )}

          {/* ── Dubbing Mode ── */}
          {videoMode === 'dubbing' && (
            <>
              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Video to dub</div>
                {motionVideoUrl ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid var(--border)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                      </svg>
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text)' }}>{motionVideoLabel || motionVideoUrl}</span>
                      <button onClick={() => { setMotionVideoUrl(''); setMotionVideoLabel(''); setDubFileId(null); setDubPrepared(null); setDubStatus('idle') }}
                        className="opacity-50 hover:opacity-100 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>×</button>
                    </div>
                    {/* Плеер исходника: послушать, кто как звучит, перед раздачей голосов */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video controls preload="metadata" src={dubFileId ? `/api/video/file/${dubFileId}` : motionVideoUrl}
                      className="w-full rounded-xl" style={{ maxHeight: 180, border: '1px solid var(--border)' }} />
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setMotionVideoPicker(true)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      🎬 From history
                    </button>
                    <button onClick={() => motionVideoInputRef.current?.click()} disabled={motionVideoUploading}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      {motionVideoUploading ? 'Uploading...' : '⬆ Upload .mp4 / .mov'}
                    </button>
                  </div>
                )}
                <input ref={motionVideoInputRef} type="file" accept=".mp4,.mov,video/mp4,video/quicktime" className="hidden" onChange={handleMotionVideoUpload} />
                {motionVideoError && <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>{motionVideoError}</p>}
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>2–60 seconds · one visible speaker · up to 100MB</p>
              </div>

              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Target language</div>
                <select value={dubLang} onChange={e => { setDubLang(e.target.value); setDubPrepared(null); setDubStatus('idle') }}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {DUB_LANGUAGES.map(([code, name]) => <option key={code} value={code} style={{ background: '#1a1a2e' }}>{name}</option>)}
                </select>
              </div>

              {!dubPrepared && (
                <button onClick={handleDubPrepare} disabled={!motionVideoUrl || dubPreparing}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 mb-3"
                  style={{ background: motionVideoUrl && !dubPreparing ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: motionVideoUrl && !dubPreparing ? '#fff' : 'var(--text-muted)' }}>
                  {dubPreparing ? (
                    <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>Transcribing & translating...</>
                  ) : '1 · Transcribe → Translate → Voice'}
                </button>
              )}

              {dubPrepared && (
                <>
                  <div className="mb-2">
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Original ({dubPrepared.sourceLang})</div>
                    <p className="text-xs px-2 py-1.5 rounded-lg max-h-20 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>{dubPrepared.sourceText}</p>
                  </div>

                  {/* Статус клонирования голосов */}
                  {dubVoiceNote && (
                    <p className="text-[11px] mb-2 px-2 py-1.5 rounded-lg"
                      style={{
                        background: dubVoiceNote.includes('✓') ? 'rgba(52,168,83,0.1)' : 'rgba(251,188,5,0.1)',
                        color: dubVoiceNote.includes('✓') ? '#34a853' : '#fbbc05',
                      }}>
                      {dubVoiceNote.includes('✓') ? '🎙 ' : '⚠ '}{dubVoiceNote}
                    </p>
                  )}

                  {dubPrepared.speakers > 1 && dubPrepared.segments ? (
                    /* Диалог: реплики + раздача голосов по говорящим */
                    <div className="mb-2">
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                        Dialogue — {dubPrepared.speakers} speakers, assign voices
                      </div>
                      <div className="flex flex-col gap-1.5 mb-2">
                        {(dubPrepared.speakerIds || []).map((sp, i) => {
                          const info = dubPrepared.speakerInfo?.find(s => s.id === sp)
                          return (
                            <div key={sp} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-mono flex-shrink-0 px-1 py-0.5 rounded" style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
                                  {info ? `${Math.floor(info.start / 60)}:${String(Math.floor(info.start % 60)).padStart(2, '0')}` : ''}
                                </span>
                                <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>
                                  S{i + 1}{info?.role ? ` · ${info.role}` : ''}
                                </span>
                                {info?.sample && (
                                  <span className="text-[10px] italic truncate flex-1" style={{ color: 'var(--text-muted)' }}>«{info.sample}»</span>
                                )}
                                <label className="flex items-center gap-1 text-[10px] cursor-pointer flex-shrink-0" style={{ color: 'var(--text-muted)' }}
                                  title="On-screen: lips of the visible face are synced during this speaker's lines. Off-screen (voice-over): lips are left untouched.">
                                  <input type="checkbox" checked={dubOnScreen[sp] !== false}
                                    onChange={e => setDubOnScreen(prev => ({ ...prev, [sp]: e.target.checked }))} />
                                  On-screen
                                </label>
                              </div>
                              {info?.voiceProfile && (
                                <div className="text-[9px] mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  🎙 voice in source: {info.voiceProfile}{dubPrepared.suggestedVoiceMap?.[sp] === dubVoiceMap[sp] ? ' · auto-matched' : ''}
                                </div>
                              )}
                              {/* Индикатор загрузки лиц — чтобы не выглядело пусто, пока грузятся */}
                              {dubOnScreen[sp] !== false && dubFacesLoading && !dubFaces && (
                                <div className="flex items-center gap-1.5 mb-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                  <span className="animate-spin">⟳</span> detecting faces…
                                </div>
                              )}
                              {/* Привязка к лицу: критично, когда в кадре несколько человек */}
                              {dubOnScreen[sp] !== false && dubFaces && dubFaces.length > 1 && (
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Face:</span>
                                  {dubFaces.map((f, fi) => (
                                    <button key={fi} onClick={() => setDubFaceMap(prev => ({ ...prev, [sp]: fi }))}
                                      title={`Face ${fi + 1} · visible ${Math.round(f.startMs / 1000)}–${Math.round(f.endMs / 1000)}s`}
                                      className="rounded-lg overflow-hidden transition-all flex-shrink-0"
                                      style={{
                                        width: 32, height: 32, padding: 0,
                                        border: dubFaceMap[sp] === fi ? '2px solid var(--accent)' : '2px solid var(--border)',
                                        opacity: dubFaceMap[sp] === fi ? 1 : 0.6,
                                      }}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={f.image} alt={`Face ${fi + 1}`} className="w-full h-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {dubClonedIds.includes(dubVoiceMap[sp]) ? (
                                <div className="text-[11px] px-2 py-1 rounded-lg" style={{ background: 'rgba(52,168,83,0.1)', color: '#34a853' }}>
                                  🎙 Original voice (cloned)
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <select value={dubVoiceMap[sp] || dubVoices[0].id}
                                    onChange={e => setDubVoiceMap(prev => ({ ...prev, [sp]: e.target.value }))}
                                    className="flex-1 min-w-0 rounded-lg px-2 py-1 text-xs outline-none"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', textOverflow: 'ellipsis' }}>
                                    {dubVoices.map(v => <option key={v.id} value={v.id} style={{ background: '#1a1a2e' }}>{v.label}</option>)}
                                  </select>
                                  <button onClick={() => playVoicePreview(dubVoiceMap[sp] || dubVoices[0].id)} title="Listen to a sample of this voice"
                                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                                    style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)', fontSize: 9 }}>▶</button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded-lg px-2 py-1.5 mb-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {dubPrepared.segments.map((s, i) => (
                          <p key={i} className="text-xs mb-1">
                            <span className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>
                              S{(dubPrepared.speakerIds || []).indexOf(s.speaker) + 1}:
                            </span>{' '}
                            <span style={{ color: 'var(--text)' }}>{s.text}</span>
                          </p>
                        ))}
                      </div>
                      <button onClick={handleDubDialogueVoice} disabled={dubVoicingDialogue || dubFacesLoading}
                        className="w-full py-2 rounded-lg text-xs font-medium transition-all mb-1"
                        style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: dubFacesLoading ? 0.5 : 1 }}>
                        {dubVoicingDialogue ? 'Voicing dialogue...' : dubFacesLoading ? 'Detecting faces…' : dubPrepared.audioBase64 ? '↻ Re-voice dialogue' : '🎭 Voice dialogue'}
                      </button>
                    </div>
                  ) : (
                    /* Один говорящий: голос + редактируемый перевод */
                    <div className="mb-2">
                      {(() => {
                        const sp = dubPrepared.speakerIds?.[0] || ''
                        const info = dubPrepared.speakerInfo?.[0]
                        return (
                          <div className="mb-2">
                            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Voice</div>
                            {dubClonedIds.includes(dubVoiceMap[sp]) ? (
                              <div className="text-[11px] px-2 py-1.5 rounded-lg" style={{ background: 'rgba(52,168,83,0.1)', color: '#34a853' }}>
                                🎙 Original voice (cloned from the source)
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select value={dubVoiceMap[sp] || dubVoices[0].id}
                                  onChange={e => { setDubVoiceMap(prev => ({ ...prev, [sp]: e.target.value })); setDubPrepared(prev => prev ? { ...prev, audioBase64: null } : prev) }}
                                  className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs outline-none"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', textOverflow: 'ellipsis' }}>
                                  {dubVoices.map(v => <option key={v.id} value={v.id} style={{ background: '#1a1a2e' }}>{v.label}</option>)}
                                </select>
                                <button onClick={() => playVoicePreview(dubVoiceMap[sp] || dubVoices[0].id)} title="Listen to a sample of this voice"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                                  style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)', fontSize: 10 }}>▶</button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Translation — edit if needed</div>
                        <button onClick={handleDubRevoice}
                          disabled={dubRevoicing || (!!dubPrepared.audioBase64 && dubEditedText === dubPrepared.translatedText)}
                          className="text-[10px] px-2 py-0.5 rounded-lg font-medium"
                          style={{ background: 'rgba(79,110,247,0.12)', color: (!dubPrepared.audioBase64 || dubEditedText !== dubPrepared.translatedText) ? 'var(--accent)' : 'rgba(255,255,255,0.2)', border: '1px solid var(--border)' }}>
                          {dubRevoicing ? 'Voicing...' : dubPrepared.audioBase64 ? '↻ Re-voice' : '🔊 Voice'}
                        </button>
                      </div>
                      <textarea value={dubEditedText} onChange={e => setDubEditedText(e.target.value)} rows={3}
                        className="w-full rounded-lg resize-none outline-none text-xs p-2"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </div>
                  )}

                  {dubPrepared.audioBase64 && (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <audio controls src={`data:audio/mpeg;base64,${dubPrepared.audioBase64}`} className="w-full mb-2" style={{ height: 32 }} />
                  )}
                  {/* Липсинк можно выключить: тогда озвучка просто ляжет поверх видео
                      по таймингам оригинала — быстро и без затрат юнитов Kling */}
                  <label className="flex items-center gap-2 mb-2 cursor-pointer text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={dubLipsync} onChange={e => setDubLipsync(e.target.checked)} />
                    Lip-sync (Kling) — {dubLipsync ? 'lips will match the new audio' : 'off: audio overlay only, free & fast'}
                  </label>
                  {(() => {
                    // Если лиц несколько и включён липсинк — требуем привязать лицо
                    // каждому экранному говорящему, иначе Kling озвучит не того
                    const onScreenSpeakers = (dubPrepared.speakerIds || []).filter(sp => dubOnScreen[sp] !== false)
                    const needFace = dubLipsync && !!dubFaces && dubFaces.length > 1 &&
                      onScreenSpeakers.some(sp => dubFaceMap[sp] === undefined)
                    if (dubStatus === 'done') return <p className="text-xs mb-2" style={{ color: '#34a853' }}>✓ Dubbed video saved to history</p>
                    return (
                      <>
                        {needFace && (
                          <p className="text-[11px] mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(251,188,5,0.1)', color: '#fbbc05' }}>
                            ⚠ Choose a face for each on-screen speaker above before dubbing
                          </p>
                        )}
                        <button onClick={handleDubStart} disabled={dubProcessing || !dubPrepared.audioBase64 || needFace}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 mb-3"
                          style={{ background: (!dubProcessing && !needFace) ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: (!dubProcessing && !needFace) ? '#fff' : 'var(--text-muted)' }}>
                          {dubProcessing ? (
                            <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>{dubProgress || 'Lip-syncing...'}</>
                          ) : '2 · Dub video (lip-sync)'}
                        </button>
                      </>
                    )
                  })()}
                </>
              )}
              {dubError && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{dubError}</p>}
            </>
          )}

          {/* ── Settings (model-dependent) ── */}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 12, marginTop: 4 }} />

          {/* Quality */}
          {videoMode !== 'avatar' && videoMode !== 'motionControl' && videoMode !== 'dubbing' && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Quality</div>
              <div className="flex gap-2">
                {(['std', 'pro'] as Mode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: mode === m ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: mode === m ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}` }}>
                    {m === 'std' ? '720p Std' : '1080p Pro'}
                  </button>
                ))}
                {currentModel.supports4K && (
                  <button onClick={() => setMode('4k')}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: mode === '4k' ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: mode === '4k' ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === '4k' ? 'var(--accent)' : 'var(--border)'}` }}>
                    4K
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Duration slider */}
          {videoMode !== 'multishot' && videoMode !== 'avatar' && videoMode !== 'dubbing' && videoMode !== 'motionControl' && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Duration</div>
                <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{duration}s</span>
              </div>
              <input type="range" min={3} max={15} step={1} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full" style={{ accentColor: 'var(--accent)' }} />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>3s</span>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>15s</span>
              </div>
            </div>
          )}

          {/* Aspect ratio — для text2video выбираем; при загруженном кадре Kling берёт
              пропорции картинки, поэтому селектор не скрываем, а блокируем и показываем
              автоопределённый формат */}
          {videoMode === 'standard' && currentModel.aspectRatios.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Aspect ratio</div>
                {firstFrame && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· auto from image</span>}
              </div>
              <div className="flex flex-wrap gap-1.5" style={{ opacity: firstFrame ? 0.6 : 1, pointerEvents: firstFrame ? 'none' : 'auto' }}>
                {currentModel.aspectRatios.map(r => {
                  const active = firstFrame ? detectedAspect === r : aspectRatio === r
                  return (
                    <button key={r} onClick={() => setAspectRatio(r)} disabled={!!firstFrame}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{ background: active ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>
                      {r}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sound */}
          {currentModel.supportsSound && (videoMode === 'standard' || videoMode === 'multishot') && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sound</span>
              <button onClick={() => setSound(s => !s)}
                className="relative w-9 h-5 rounded-full transition-all"
                style={{ background: sound ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: sound ? '18px' : '2px' }} />
              </button>
            </div>
          )}

          {/* Turbo: sound is built-in and always on, no API control */}
          {model === 'kling-v3-turbo' && (videoMode === 'standard' || videoMode === 'multishot') && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sound</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>🔊 Always on — built into the model</span>
            </div>
          )}

          {/* Motion Control mode quality selector */}
          {videoMode === 'motionControl' && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Quality</div>
              <div className="flex gap-2">
                {(['std', 'pro'] as Mode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: mode === m ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: mode === m ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}` }}>
                    {m === 'std' ? '720p Std' : '1080p Pro'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Avatar quality selector */}
          {videoMode === 'avatar' && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Quality</div>
              <div className="flex gap-2">
                {(['std', 'pro'] as Mode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: mode === m ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: mode === m ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}` }}>
                    {m === 'std' ? '720p Std' : '1080p Pro'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate button (у дубляжа свой двухшаговый флоу) */}
          {videoMode !== 'dubbing' && (
          <button onClick={handleGenerate} disabled={!canGenerate}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: canGenerate ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: canGenerate ? '#fff' : 'var(--text-muted)', cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
            {status === 'pending' || status === 'processing' ? (
              <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>Generating...</>
            ) : (
              <div className="flex items-center justify-between w-full px-1">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Generate video
                </div>
                {estimatedCost !== null && (
                  <span className="text-xs font-normal opacity-80">{estimatedCost} units</span>
                )}
              </div>
            )}
          </button>
          )}

          {/* Личный лимит видео-юнитов (полная инфа по Kling-балансу — в админке) */}
          <div className="mt-2 flex justify-center">
            <UsageBadge kind="video" refreshKey={status} />
          </div>
        </div>
      </div>

      {/* ── Right area ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">

        {status !== 'idle' && (
          <div className="flex-shrink-0 flex items-center justify-center p-6"
            style={{ borderBottom: '1px solid var(--border)', minHeight: 200 }}>
            {(status === 'pending' || status === 'processing') && (
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {status === 'pending' ? 'Submitting...' : 'Generating video...'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>1–3 minutes</p>
              </div>
            )}
            {status === 'done' && videoUrl && (
              <div className="w-full max-w-xl flex flex-col gap-3">
                <video src={videoUrl} controls autoPlay loop className="w-full rounded-xl" style={{ border: '1px solid var(--border)' }} />
                <div className="flex items-center gap-2">
                  {savingToDrive
                    ? <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>Saving to Drive...
                      </span>
                    : <span className="text-xs" style={{ color: '#34a853' }}>✓ Saved to Drive</span>
                  }
                  <button onClick={() => setStatus('idle')} className="ml-auto text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                    New video
                  </button>
                </div>
              </div>
            )}
            {status === 'error' && (
              <div className="text-center max-w-sm">
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Generation failed</p>
                <p className="text-xs px-4 py-3 rounded-xl mb-3"
                  style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {error}
                </p>
                <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* History */}
        <div className="p-5">
          {historyUsers.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              {historyUsers.map(u => (
                <button key={u.email} onClick={() => toggleEmail(u.email)}
                  title={u.name} className="transition-all"
                  style={{ borderRadius: '50%', outline: selectedEmails.has(u.email) ? '2px solid var(--accent)' : '2px solid transparent', outlineOffset: 2, opacity: selectedEmails.size && !selectedEmails.has(u.email) ? 0.4 : 1 }}>
                  <UserAvatar name={u.name} email={u.email} image={u.image} size={32} />
                </button>
              ))}
              {selectedEmails.size > 0 && (
                <button onClick={() => setSelectedEmails(new Set())} className="text-[10px] px-2 py-1 rounded-lg ml-1"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {historyLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '1/1', background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : filteredHistory.length === 0 && status === 'idle' ? (
            <div className="flex items-center justify-center" style={{ minHeight: 140 }}>
              <div className="text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selectedEmails.size ? 'No videos from selected users' : 'Generate a video to get started'}
                </p>
              </div>
            </div>
          ) : filteredHistory.length > 0 ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {filteredHistory.map((item, idx) => (
                  <VideoCard key={item.id} item={item} featured={idx === 0} onSelect={() => setSelectedItem(item)} />
                ))}
              </div>
              <div ref={sentinelRef} className="h-8 flex items-center justify-center mt-2">
                {loadingMore && (
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {selectedItem && <VideoCardModal item={selectedItem} onClose={() => setSelectedItem(null)} onRefresh={fetchHistory} />}
      {pickerTarget && <ImagePickerModal onSelect={handlePickerSelect} onClose={() => setPickerTarget(null)} />}
      {motionVideoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setMotionVideoPicker(false) }}>
          <div className="rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold">Pick a reference video</span>
              <button onClick={() => setMotionVideoPicker(false)} className="opacity-50 hover:opacity-100">×</button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No generated videos yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {history.map(item => (
                  <button key={item.id} onClick={() => pickMotionVideoFromHistory(item)}
                    className="rounded-xl overflow-hidden text-left transition-all hover:ring-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                    <video src={`/api/video/file/${item.id}`} muted preload="metadata" className="w-full h-28 object-cover" />
                    <div className="p-2">
                      <div className="text-[10px] font-mono" style={{ color: 'var(--accent)' }}>{item.model.replace('kling-', '')} · {item.duration}s</div>
                      {item.prompt && <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.prompt}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
