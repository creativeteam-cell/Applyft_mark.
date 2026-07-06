'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type Mode = 'std' | 'pro'
type Duration = '5' | '10' | '15'
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
type TaskStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'
type KlingModel = 'kling-v3' | 'kling-v2-6' | 'kling-v2-5-turbo' | 'kling-v2-master' | 'kling-v2-1-master' | 'kling-v1-6'

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

const MODELS: { id: KlingModel; label: string; description: string; tags: string[]; supportsSound: boolean }[] = [
  { id: 'kling-v3',          label: 'Kling 3.0',        description: 'Latest model, audio sync, storyboarding',   tags: ['Best', 'HOT'], supportsSound: true  },
  { id: 'kling-v2-6',        label: 'Kling 2.6',        description: 'See the sound, hear the visual',             tags: ['Audio', 'NEW'], supportsSound: true  },
  { id: 'kling-v2-5-turbo',  label: 'Kling 2.5 Turbo',  description: 'Max creativity with exceptional value',      tags: ['Stable'],       supportsSound: false },
  { id: 'kling-v2-master',   label: 'Kling 2 Master',   description: 'High quality, cinematic realism',            tags: ['HD'],           supportsSound: false },
  { id: 'kling-v2-1-master', label: 'Kling 2.1 Master', description: 'Enhanced quality and motion control',        tags: [],               supportsSound: false },
  { id: 'kling-v1-6',        label: 'Kling 1.6',        description: 'Fast and reliable, great for drafts',        tags: ['Fast'],         supportsSound: false },
]

const ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4']

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

// ── Try parse JSON prompt ──────────────────────────────────────────────────

function JsonPromptDisplay({ prompt }: { prompt: string }) {
  const trimmed = prompt.trim()
  let parsed: any = null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { parsed = JSON.parse(trimmed) } catch {}
  }

  if (!parsed) {
    return <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{prompt}</p>
  }

  function renderValue(val: any, depth = 0): React.ReactNode {
    if (val === null) return <span style={{ color: '#94a3b8' }}>null</span>
    if (typeof val === 'boolean') return <span style={{ color: '#f59e0b' }}>{String(val)}</span>
    if (typeof val === 'number') return <span style={{ color: '#34a853' }}>{val}</span>
    if (typeof val === 'string') return <span style={{ color: '#a5f3fc' }}>"{val}"</span>
    if (Array.isArray(val)) {
      if (val.length === 0) return <span style={{ color: 'var(--text-muted)' }}>[]</span>
      return (
        <span>
          {'['}
          <div style={{ paddingLeft: 16 }}>
            {val.map((item, i) => (
              <div key={i}>{renderValue(item, depth + 1)}{i < val.length - 1 ? ',' : ''}</div>
            ))}
          </div>
          {']'}
        </span>
      )
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val)
      return (
        <span>
          {'{'}
          <div style={{ paddingLeft: 16 }}>
            {keys.map((k, i) => (
              <div key={k}>
                <span style={{ color: '#c084fc' }}>"{k}"</span>
                <span style={{ color: 'var(--text-muted)' }}>: </span>
                {renderValue(val[k], depth + 1)}
                {i < keys.length - 1 ? ',' : ''}
              </div>
            ))}
          </div>
          {'}'}
        </span>
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

function ModelDropdown({ model, onSelect }: { model: KlingModel; onSelect: (m: KlingModel) => void }) {
  const [open, setOpen] = useState(false)
  const current = MODELS.find(m => m.id === model)!

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
          {MODELS.map(m => (
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
              {!m.supportsSound && (
                <p className="text-[10px] ml-4 mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>No sound support</p>
              )}
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
    fetchPage().then(data => {
      setItems(data.items || [])
      setNextPageToken(data.nextPageToken || null)
      setLoading(false)
    })
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
    obs.observe(el)
    return () => obs.disconnect()
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
      onSelect(b64)
      onClose()
    } catch (e) {
      console.error('Failed to load image', e)
    }
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
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                style={{ color: 'var(--text-muted)' }}/>
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse"
                  style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)' }} />
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
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
                          style={{ color: 'rgba(255,255,255,0.15)' }}>
                          <rect x="3" y="3" width="18" height="18" rx="3"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                    {fetchingId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                          <path d="M12 2a10 10 0 0 1 10 10"/>
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

// ── VideoCard ──────────────────────────────────────────────────────────────

function VideoCard({ item, onSelect, featured = false }: { item: VideoItem; onSelect: () => void; featured?: boolean }) {
  const [thumbErr, setThumbErr] = useState(false)
  const thumbSrc = `/api/video/thumb/${item.id}`
  return (
    <div onClick={onSelect}
      className="relative rounded-xl overflow-hidden cursor-pointer group"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        aspectRatio: featured ? '21/9' : '16/10',
        gridColumn: featured ? 'span 2' : undefined,
      }}>
      {!thumbErr ? (
        <img src={thumbSrc} alt={item.prompt} className="w-full h-full object-cover"
          onError={() => setThumbErr(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
            style={{ color: 'rgba(255,255,255,0.15)' }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      {featured && (
        <div className="absolute top-2 left-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: 'rgba(79,110,247,0.8)', color: '#fff' }}>Latest</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-end justify-between"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
        <div className="flex gap-1 flex-wrap">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium"
            style={{ background: 'rgba(79,110,247,0.8)', color: '#fff' }}>{item.duration}s</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}>
            {item.model.replace('kling-','')}
          </span>
        </div>
        {item.userName && (
          <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={20} />
        )}
      </div>
    </div>
  )
}

// ── VideoCardModal ─────────────────────────────────────────────────────────

function VideoCardModal({ item, onClose, onRefresh }: { item: VideoItem; onClose: () => void; onRefresh: () => void }) {
  const [extPrompt, setExtPrompt] = useState('')
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
        body: JSON.stringify({ prompt: extPrompt, duration: '5' }),
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
        body: JSON.stringify({ klingVideoId: item.klingVideoId, prompt: extPrompt }),
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

        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Video player */}
        <div className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 360, background: 'rgba(0,0,0,0.5)' }}>
          <video src={`/api/video/file/${item.id}`} controls autoPlay loop className="w-full max-h-[90vh] object-contain" />
        </div>

        {/* Right panel */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5">
          {/* Meta */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="rounded px-2 py-1 text-xs font-mono font-medium"
              style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
              {item.model.replace('kling-','')}
            </span>
            <span className="rounded px-2 py-1 text-xs font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{item.duration}s</span>
            {item.aspectRatio && (
              <span className="rounded px-2 py-1 text-xs font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{item.aspectRatio}</span>
            )}
            {item.createdTime && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {new Date(item.createdTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {item.userName && (
              <div className="flex items-center gap-1.5 ml-auto">
                <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={22} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.userName}</span>
              </div>
            )}
          </div>

          {/* Prompt — JSON-aware display */}
          {item.prompt && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt</div>
              <JsonPromptDisplay prompt={item.prompt} />
            </div>
          )}

          <div className="mb-4" style={{ height: 1, background: 'var(--border)' }} />

          {/* Extend */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Extend video <span className="font-normal normal-case" style={{ color: 'rgba(255,255,255,0.2)' }}>~5s</span>
              </div>
              <button onClick={handleEnhanceExt} disabled={enhancingExt || !extPrompt.trim()}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                style={{
                  background: extPrompt.trim() ? 'rgba(79,110,247,0.12)' : 'rgba(255,255,255,0.04)',
                  color: extPrompt.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                  border: '1px solid var(--border)',
                }}
                title="Convert to professional JSON prompt">
                {enhancingExt ? (
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                ) : '✦'} JSON
              </button>
            </div>
            <textarea value={extPrompt} onChange={e => setExtPrompt(e.target.value)}
              placeholder="Optional: describe the continuation..." rows={2}
              className="w-full rounded-lg resize-none outline-none text-sm p-3 mb-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            {extStatus === 'done' && <p className="text-xs mb-2" style={{ color: '#34a853' }}>✓ Extended and saved</p>}
            {extError && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{extError}</p>}
            <button onClick={handleExtend} disabled={extending || !item.klingVideoId}
              className="w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              {extending ? (
                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>Extending...</>
              ) : '⚡ Extend'}
            </button>
          </div>

          {err && <p className="text-xs mb-3" style={{ color: '#f87171' }}>{err}</p>}

          <div className="flex gap-2 mt-auto">
            <a href={`/api/video/file/${item.id}?download=1`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>Download
            </a>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center justify-center px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
              {deleting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ImageUploadBox ─────────────────────────────────────────────────────────

function ImageUploadBox({ label, preview, onUpload, onClear, onPickFromLibrary, compact }: {
  label: string; preview: string | null
  onUpload: (b64: string) => void; onClear: () => void; onPickFromLibrary: () => void
  compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { const url = ev.target?.result as string; onUpload(url.split(',')[1]) }
    reader.readAsDataURL(file)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
        {!preview && (
          <button onClick={onPickFromLibrary}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Pick from your image library">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Library
          </button>
        )}
      </div>
      <div onClick={() => ref.current?.click()}
        className="rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center transition-all hover:border-[var(--accent)] overflow-hidden"
        style={{ borderColor: preview ? 'transparent' : 'var(--border)', minHeight: compact ? 70 : 80 }}>
        {preview ? (
          <div className="relative w-full">
            <img src={`data:image/jpeg;base64,${preview}`} alt={label}
              className="w-full object-cover rounded-xl" style={{ maxHeight: compact ? 70 : 130 }} />
            <button onClick={e => { e.stopPropagation(); onClear(); if (ref.current) ref.current.value = '' }}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="text-center p-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="mx-auto mb-1" style={{ color: 'var(--text-muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Upload</div>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  )
}

// ── Main VideoPage ─────────────────────────────────────────────────────────

export function VideoPage() {
  const [model, setModel] = useState<KlingModel>('kling-v3')
  const [prompt, setPrompt] = useState('')
  const [negPrompt, setNegPrompt] = useState('')
  const [negOpen, setNegOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('std')
  const [duration, setDuration] = useState<Duration>('5')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [sound, setSound] = useState(false)
  const [firstFrame, setFirstFrame] = useState<string | null>(null)
  const [lastFrame, setLastFrame] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<'first' | 'last' | null>(null)

  const [assets, setAssets] = useState<{ id: string; name: string; base64: string }[]>([])
  const assetInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [atPopup, setAtPopup] = useState(false)
  const [atQuery, setAtQuery] = useState('')

  const [status, setStatus] = useState<TaskStatus>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [savingToDrive, setSavingToDrive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  const [history, setHistory] = useState<VideoItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<VideoItem | null>(null)
  const [filterEmail, setFilterEmail] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const currentModel = MODELS.find(m => m.id === model)!
  const canGenerate = status !== 'pending' && status !== 'processing' && prompt.trim().length > 0

  // Unique users from history for filter
  const historyUsers = Array.from(
    new Map(history.filter(v => v.userEmail).map(v => [v.userEmail, v])).values()
  ).map(v => ({ email: v.userEmail, name: v.userName, image: v.userImage }))

  const filteredHistory = filterEmail ? history.filter(v => v.userEmail === filterEmail) : history

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
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollStatus = useCallback((taskId: string, type: 'text2video' | 'image2video') => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status/${taskId}?type=${type}`)
        const data = await res.json()
        if (data.task_status === 'succeed') {
          stopPolling()
          const url = data.task_result?.videos?.[0]?.url ?? null
          const vid = data.task_result?.videos?.[0]?.id ?? null
          setVideoUrl(url); setStatus('done')
          if (url) {
            setSavingToDrive(true)
            fetch('/api/video/save', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: url, klingVideoId: vid ?? '',
                prompt, model, duration,
                aspectRatio: firstFrame ? '' : aspectRatio,
                sound: sound ? 'on' : 'off',
                inputType: firstFrame ? 'image' : 'text',
              }),
            }).then(() => { setSavingToDrive(false); fetchHistory() }).catch(() => setSavingToDrive(false))
          }
        } else if (data.task_status === 'failed') {
          stopPolling(); setError(data.task_status_msg ?? 'Generation failed'); setStatus('error')
        }
      } catch {}
    }, 4000)
  }, [stopPolling, prompt, model, duration, aspectRatio, sound, firstFrame, fetchHistory])

  const handleGenerate = async () => {
    if (!canGenerate) return
    setStatus('pending'); setVideoUrl(null); setError(null)
    try {
      const type = firstFrame ? 'image2video' : 'text2video'
      const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'
      const body = firstFrame
        ? { model_name: model, image: firstFrame, ...(lastFrame ? { image_tail: lastFrame } : {}), prompt, negative_prompt: negPrompt, mode, duration, sound: soundParam }
        : { model_name: model, prompt, negative_prompt: negPrompt, mode, duration, aspect_ratio: aspectRatio, sound: soundParam }
      const res = await fetch(`/api/video/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStatus('processing')
      pollStatus(data.task_id, type)
    } catch (e: any) { setError(e.message); setStatus('error') }
  }

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || enhancing) return
    setEnhancing(true)
    try {
      const res = await fetch('/api/video/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: firstFrame ? '' : aspectRatio, duration, assets: assets.map(a => ({ name: a.name, base64: a.base64 })) }),
      })
      const data = await res.json()
      if (data.prompt) setPrompt(data.prompt)
    } catch {}
    setEnhancing(false)
  }

  function handlePickerSelect(b64: string) {
    if (pickerTarget === 'first') setFirstFrame(b64)
    else if (pickerTarget === 'last') setLastFrame(b64)
    setPickerTarget(null)
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
    const val = ta.value
    const pos = ta.selectionStart ?? 0
    const before = val.slice(0, pos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx !== -1 && !before.slice(atIdx).includes(' ')) {
      const query = before.slice(atIdx + 1)
      setAtQuery(query)
      setAtPopup(true)
    } else {
      setAtPopup(false)
      setAtQuery('')
    }
  }

  function insertAssetMention(name: string) {
    const ta = textareaRef.current
    if (!ta) return
    const val = ta.value
    const pos = ta.selectionStart ?? 0
    const before = val.slice(0, pos)
    const atIdx = before.lastIndexOf('@')
    const newVal = val.slice(0, atIdx) + `@${name}` + val.slice(pos)
    setPrompt(newVal)
    setAtPopup(false)
    setAtQuery('')
    setTimeout(() => { ta.focus(); ta.setSelectionRange(atIdx + name.length + 1, atIdx + name.length + 1) }, 0)
  }

  const filteredAtAssets = assets.filter(a => a.name.toLowerCase().includes(atQuery.toLowerCase()))

  return (
    <div className="flex flex-1 min-h-0">

      {/* ── Left sidebar ── */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ width: 340, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex flex-col gap-0 p-4">

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Model</div>
            <ModelDropdown model={model} onSelect={setModel} />
          </div>

          {/* Prompt section */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {firstFrame ? 'Motion prompt' : 'Prompt'}
              </div>
              <button onClick={handleEnhancePrompt} disabled={enhancing || !prompt.trim()}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all font-medium"
                style={{
                  background: prompt.trim() ? 'rgba(79,110,247,0.12)' : 'rgba(255,255,255,0.04)',
                  color: prompt.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                  border: '1px solid var(--border)',
                }}
                title="Convert to professional JSON prompt">
                {enhancing ? (
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                ) : '✦'} JSON
              </button>
            </div>
            <div className="relative">
              <textarea ref={textareaRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyUp={handlePromptKeyUp}
                placeholder={firstFrame ? 'Describe how it should move...' : 'Describe the video...'}
                rows={6} className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${prompt ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text)', caretColor: 'var(--accent)', fontFamily: 'inherit' }} />
              {atPopup && filteredAtAssets.length > 0 && (
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

          {/* Assets panel */}
          <div className="mb-3">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {assets.map(asset => (
                <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                  style={{ background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.25)', color: 'var(--text)' }}>
                  <img src={asset.base64} alt={asset.name} className="w-4 h-4 rounded object-cover" />
                  <span className="font-mono" style={{ color: 'var(--accent)' }}>@{asset.name}</span>
                  <button onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))}
                    className="ml-0.5 opacity-50 hover:opacity-100" style={{ color: 'var(--text-muted)' }}>×</button>
                </div>
              ))}
              <button onClick={() => assetInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span> Asset
              </button>
              <input ref={assetInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAssetUpload} />
            </div>
            {assets.length > 0 && !firstFrame && (
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Assets are used for AI prompt enhancement. Set a First Frame to use image2video.
              </p>
            )}
          </div>

          {/* First/Last frame side by side */}
          <div className="mb-4 flex gap-2">
            <div className="flex-1">
              <ImageUploadBox label="First frame" preview={firstFrame}
                onUpload={setFirstFrame} onClear={() => setFirstFrame(null)}
                onPickFromLibrary={() => setPickerTarget('first')} compact />
            </div>
            <div className="flex-1">
              <ImageUploadBox label="Last frame" preview={lastFrame}
                onUpload={setLastFrame} onClear={() => setLastFrame(null)}
                onPickFromLibrary={() => setPickerTarget('last')} compact />
            </div>
          </div>

          <div className="mb-4">
            <button onClick={() => setNegOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-1.5 transition-all"
              style={{ color: negOpen ? 'var(--text)' : 'var(--text-muted)' }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                className={`transition-transform ${negOpen ? 'rotate-180' : ''}`}>
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Negative prompt
            </button>
            {negOpen && (
              <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)}
                placeholder="What to avoid..." rows={2}
                className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            )}
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Quality</div>
            <div className="flex gap-2">
              {([['std','720p Std'],['pro','1080p Pro']] as [Mode,string][]).map(([m,label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: mode === m ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: mode === m ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Duration</div>
            <div className="flex gap-2">
              {(['5','10','15'] as Duration[]).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: duration === d ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: duration === d ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${duration === d ? 'var(--accent)' : 'var(--border)'}` }}>
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {!firstFrame && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Aspect ratio</div>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map(r => (
                  <button key={r} onClick={() => setAspectRatio(r)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background: aspectRatio === r ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)', color: aspectRatio === r ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${aspectRatio === r ? 'var(--accent)' : 'var(--border)'}` }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sound</span>
              {!currentModel.supportsSound && (
                <span className="ml-1.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>v3 only</span>
              )}
            </div>
            <button onClick={() => currentModel.supportsSound && setSound(s => !s)}
              className="relative w-9 h-5 rounded-full transition-all"
              style={{ background: sound && currentModel.supportsSound ? 'var(--accent)' : 'rgba(255,255,255,0.1)', opacity: currentModel.supportsSound ? 1 : 0.4 }}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: sound && currentModel.supportsSound ? '18px' : '2px' }} />
            </button>
          </div>

          <button onClick={handleGenerate} disabled={!canGenerate}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: canGenerate ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: canGenerate ? '#fff' : 'var(--text-muted)', cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
            {status === 'pending' || status === 'processing' ? (
              <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
              </svg>Generating...</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>Generate video</>
            )}
          </button>
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
                <video src={videoUrl} controls autoPlay loop className="w-full rounded-xl"
                  style={{ border: '1px solid var(--border)' }} />
                <div className="flex items-center gap-2">
                  {savingToDrive
                    ? <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                        </svg>Saving to Drive...
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
          {/* User filter */}
          {historyUsers.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              {historyUsers.map(u => (
                <button key={u.email} onClick={() => setFilterEmail(filterEmail === u.email ? null : u.email)}
                  title={u.name}
                  className="transition-all"
                  style={{
                    borderRadius: '50%',
                    outline: filterEmail === u.email ? '2px solid var(--accent)' : '2px solid transparent',
                    outlineOffset: 2,
                    opacity: filterEmail && filterEmail !== u.email ? 0.4 : 1,
                  }}>
                  <UserAvatar name={u.name} email={u.email} image={u.image} size={32} />
                </button>
              ))}
              {filterEmail && (
                <button onClick={() => setFilterEmail(null)}
                  className="text-[10px] px-2 py-1 rounded-lg ml-1"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {historyLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse"
                  style={{ aspectRatio: '16/10', background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : filteredHistory.length === 0 && status === 'idle' ? (
            <div className="flex items-center justify-center" style={{ minHeight: 140 }}>
              <div className="text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"
                  className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {filterEmail ? 'No videos from this user' : 'Generate a video to get started'}
                </p>
              </div>
            </div>
          ) : filteredHistory.length > 0 ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {filteredHistory.map((item, idx) => (
                  <VideoCard key={item.id} item={item}
                    featured={idx === 0}
                    onSelect={() => setSelectedItem(item)} />
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

      {selectedItem && (
        <VideoCardModal item={selectedItem} onClose={() => setSelectedItem(null)} onRefresh={fetchHistory} />
      )}
      {pickerTarget && (
        <ImagePickerModal onSelect={handlePickerSelect} onClose={() => setPickerTarget(null)} />
      )}
    </div>
  )
}
