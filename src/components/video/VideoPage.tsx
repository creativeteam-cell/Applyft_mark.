'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type InputTab = 'text' | 'image'
type Mode = 'std' | 'pro'
type Duration = '5' | '10' | '15'
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
type TaskStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'
type KlingModel = 'kling-v3' | 'kling-v3-turbo' | 'kling-v2-6' | 'kling-v2-5-turbo'

interface VideoItem {
  id: string; prompt: string; model: string; duration: string
  aspectRatio: string; sound: string; inputType: string
  klingVideoId: string; userName: string; userEmail: string; userImage: string
  thumbnailLink: string | null; webViewLink: string | null; createdTime: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const MODELS: { id: KlingModel; label: string; short: string; supportsSound: boolean }[] = [
  { id: 'kling-v3',        label: 'Kling 3.0',       short: '3.0',   supportsSound: true  },
  { id: 'kling-v3-turbo',  label: 'Kling 3.0 Turbo', short: '3.0 T', supportsSound: true  },
  { id: 'kling-v2-6',      label: 'Kling 2.6',       short: '2.6',   supportsSound: false },
  { id: 'kling-v2-5-turbo',label: 'Kling 2.5 Turbo', short: '2.5 T', supportsSound: false },
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

// ── VideoCard ──────────────────────────────────────────────────────────────

function VideoCard({ item, onSelect }: { item: VideoItem; onSelect: () => void }) {
  const [thumbError, setThumbError] = useState(false)

  return (
    <div onClick={onSelect}
      className="relative rounded-xl overflow-hidden cursor-pointer group flex-shrink-0"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', aspectRatio: '16/10' }}>
      {item.thumbnailLink && !thumbError ? (
        <img src={item.thumbnailLink} alt={item.prompt} className="w-full h-full object-cover"
          onError={() => setThumbError(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
            style={{ color: 'rgba(255,255,255,0.15)' }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      {/* Badges */}
      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-end justify-between"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
        <div className="flex gap-1 flex-wrap">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium"
            style={{ background: 'rgba(79,110,247,0.8)', color: '#fff' }}>{item.duration}s</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}>{item.model.replace('kling-','')}</span>
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
  const [extendPrompt, setExtendPrompt] = useState('')
  const [extending, setExtending] = useState(false)
  const [extendStatus, setExtendStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const [extendError, setExtendError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  async function handleExtend() {
    if (!item.klingVideoId) { setExtendError('No Kling video ID — cannot extend.'); return }
    setExtending(true); setExtendStatus('processing'); setExtendError('')
    try {
      const res = await fetch('/api/video/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klingVideoId: item.klingVideoId, prompt: extendPrompt }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      const taskId = d.task_id

      stopPoll()
      pollRef.current = setInterval(async () => {
        const sr = await fetch(`/api/video/status/${taskId}?type=video-extend`)
        const sd = await sr.json()
        if (sd.task_status === 'succeed') {
          stopPoll()
          const videoUrl = sd.task_result?.videos?.[0]?.url
          const klingVideoId = sd.task_result?.videos?.[0]?.id ?? ''
          if (videoUrl) {
            await fetch('/api/video/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl, klingVideoId,
                prompt: item.prompt + (extendPrompt ? ' [extended: ' + extendPrompt + ']' : ' [extended]'),
                model: item.model, duration: item.duration,
                aspectRatio: item.aspectRatio, sound: item.sound, inputType: item.inputType,
              }),
            })
          }
          setExtendStatus('done')
          setExtending(false)
          onRefresh()
        } else if (sd.task_status === 'failed') {
          stopPoll()
          setExtendError(sd.task_status_msg || 'Extend failed')
          setExtendStatus('error')
          setExtending(false)
        }
      }, 4000)
    } catch (e: any) {
      setExtendError(e.message)
      setExtendStatus('error')
      setExtending(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this video from Google Drive?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/video/file/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed') }
      onRefresh(); onClose()
    } catch (e: any) { setError(e.message) }
    setDeleting(false)
  }

  function handleBackdrop(e: React.MouseEvent) { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}>
      <div className="relative flex rounded-2xl overflow-hidden max-h-[90vh] w-full max-w-3xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Video */}
        <div className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 340, background: 'rgba(0,0,0,0.5)' }}>
          <video src={`/api/video/file/${item.id}`} controls autoPlay loop
            className="w-full max-h-[90vh] object-contain" />
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

          {/* Prompt */}
          {item.prompt && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt</div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{item.prompt}</p>
            </div>
          )}

          <div className="mb-4" style={{ height: 1, background: 'var(--border)' }} />

          {/* Extend */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Extend video
              <span className="ml-1.5 font-normal normal-case" style={{ color: 'rgba(255,255,255,0.25)' }}>(adds ~5s)</span>
            </div>
            <textarea value={extendPrompt} onChange={e => setExtendPrompt(e.target.value)}
              placeholder="Optional: describe the continuation..."
              rows={2} className="w-full rounded-lg resize-none outline-none text-sm p-3 mb-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            {extendStatus === 'done' && (
              <p className="text-xs mb-2" style={{ color: '#34a853' }}>✓ Extended and saved to history</p>
            )}
            {extendError && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{extendError}</p>}
            <button onClick={handleExtend} disabled={extending || !item.klingVideoId}
              className="w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{ background: extending ? 'rgba(255,255,255,0.05)' : 'rgba(79,110,247,0.15)', color: extending ? 'var(--text-muted)' : 'var(--accent)', border: '1px solid var(--border)' }}>
              {extending ? (
                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>Extending...</>
              ) : '⚡ Extend'}
            </button>
          </div>

          {error && <p className="text-xs mb-3" style={{ color: '#f87171' }}>{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <a href={`/api/video/file/${item.id}?download=1`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </a>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
              {deleting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
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

function ImageUploadBox({ label, preview, onUpload, onClear }: {
  label: string; preview: string | null; onUpload: (b64: string) => void; onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      onUpload(url.split(',')[1])
    }
    reader.readAsDataURL(file)
  }
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div onClick={() => ref.current?.click()}
        className="rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center transition-all hover:border-[var(--accent)] overflow-hidden"
        style={{ borderColor: preview ? 'transparent' : 'var(--border)', minHeight: 80 }}>
        {preview ? (
          <div className="relative w-full">
            <img src={`data:image/jpeg;base64,${preview}`} alt={label} className="w-full object-cover rounded-xl" style={{ maxHeight: 130 }} />
            <button onClick={e => { e.stopPropagation(); onClear(); ref.current!.value = '' }}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
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
  // Controls
  const [inputTab, setInputTab] = useState<InputTab>('text')
  const [model, setModel] = useState<KlingModel>('kling-v3')
  const [prompt, setPrompt] = useState('')
  const [negPrompt, setNegPrompt] = useState('')
  const [mode, setMode] = useState<Mode>('std')
  const [duration, setDuration] = useState<Duration>('5')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [sound, setSound] = useState(false)
  const [firstFrame, setFirstFrame] = useState<string | null>(null)
  const [lastFrame, setLastFrame] = useState<string | null>(null)

  // Generation state
  const [status, setStatus] = useState<TaskStatus>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [klingVideoId, setKlingVideoId] = useState<string | null>(null)
  const [savingToDrive, setSavingToDrive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  // History
  const [history, setHistory] = useState<VideoItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<VideoItem | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const currentModel = MODELS.find(m => m.id === model)!
  const canGenerate = status !== 'pending' && status !== 'processing' &&
    (inputTab === 'text' ? prompt.trim().length > 0 : firstFrame !== null)

  // ── History fetch ──────────────────────────────────────────────────────

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
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // ── Polling ────────────────────────────────────────────────────────────

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
          setVideoUrl(url)
          setKlingVideoId(vid)
          setStatus('done')
          // Auto-save to Drive
          if (url) {
            setSavingToDrive(true)
            fetch('/api/video/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: url, klingVideoId: vid ?? '',
                prompt, model, duration,
                aspectRatio: inputTab === 'text' ? aspectRatio : '',
                sound: sound ? 'on' : 'off',
                inputType: inputTab,
              }),
            }).then(() => { setSavingToDrive(false); fetchHistory() })
              .catch(() => setSavingToDrive(false))
          }
        } else if (data.task_status === 'failed') {
          stopPolling()
          setError(data.task_status_msg ?? 'Generation failed')
          setStatus('error')
        }
      } catch {}
    }, 4000)
  }, [stopPolling, prompt, model, duration, aspectRatio, sound, inputTab, fetchHistory])

  // ── Generate ───────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!canGenerate) return
    setStatus('pending'); setVideoUrl(null); setKlingVideoId(null); setError(null)

    try {
      const type = inputTab === 'text' ? 'text2video' : 'image2video'
      const soundParam = currentModel.supportsSound && sound ? 'on' : 'off'

      const body = inputTab === 'text'
        ? { model_name: model, prompt, negative_prompt: negPrompt, mode, duration, aspect_ratio: aspectRatio, sound: soundParam }
        : { model_name: model, image: firstFrame, ...(lastFrame ? { image_tail: lastFrame } : {}), prompt, negative_prompt: negPrompt, mode, duration, sound: soundParam }

      const res = await fetch(`/api/video/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStatus('processing')
      pollStatus(data.task_id, type)
    } catch (e: any) {
      setError(e.message); setStatus('error')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0">

      {/* ── Left sidebar ── */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ width: 280, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>

        {/* Input tabs */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {(['text', 'image'] as InputTab[]).map(t => (
            <button key={t} onClick={() => setInputTab(t)}
              className="flex-1 py-2.5 text-xs font-medium transition-all capitalize"
              style={{
                color: inputTab === t ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: inputTab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}>{t}</button>
          ))}
        </div>

        <div className="flex flex-col gap-0 p-4">

          {/* Model */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Model</div>
            <div className="grid grid-cols-2 gap-1.5">
              {MODELS.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className="py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center"
                  style={{
                    background: model === m.id ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)',
                    color: model === m.id ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${model === m.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}>{m.short}</button>
              ))}
            </div>
          </div>

          {/* Image inputs */}
          {inputTab === 'image' && (
            <div className="mb-4 flex flex-col gap-3">
              <ImageUploadBox label="First frame" preview={firstFrame}
                onUpload={setFirstFrame} onClear={() => setFirstFrame(null)} />
              <ImageUploadBox label="Last frame (optional)" preview={lastFrame}
                onUpload={setLastFrame} onClear={() => setLastFrame(null)} />
            </div>
          )}

          {/* Prompt */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {inputTab === 'image' ? 'Motion prompt' : 'Prompt'}
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder={inputTab === 'text' ? 'Describe the video...' : 'Describe how it should move...'}
              rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${prompt ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text)', caretColor: 'var(--accent)' }} />
          </div>

          {/* Negative prompt */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Negative prompt</div>
            <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)}
              placeholder="What to avoid..."
              rows={2} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          {/* Quality */}
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

          {/* Duration */}
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

          {/* Aspect ratio — text only */}
          {inputTab === 'text' && (
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

          {/* Sound */}
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

          {/* Generate */}
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

        {/* Current result */}
        {status !== 'idle' && (
          <div className="flex-shrink-0 flex items-center justify-center p-6"
            style={{ borderBottom: '1px solid var(--border)', minHeight: 200 }}>

            {(status === 'pending' || status === 'processing') && (
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {status === 'pending' ? 'Submitting...' : 'Generating video...'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This may take 1–3 minutes</p>
              </div>
            )}

            {status === 'done' && videoUrl && (
              <div className="w-full max-w-xl flex flex-col gap-3">
                <video src={videoUrl} controls autoPlay loop className="w-full rounded-xl"
                  style={{ border: '1px solid var(--border)' }} />
                <div className="flex items-center gap-2">
                  {savingToDrive && (
                    <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                      </svg>Saving to Drive...
                    </span>
                  )}
                  {!savingToDrive && (
                    <span className="text-xs" style={{ color: '#34a853' }}>✓ Saved to Drive</span>
                  )}
                  <button onClick={() => setStatus('idle')} className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-all"
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

        {/* Idle hero */}
        {status === 'idle' && history.length === 0 && !historyLoading && (
          <div className="flex-shrink-0 flex items-center justify-center p-10" style={{ minHeight: 160 }}>
            <div className="text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"
                className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Generate a video or browse history below</p>
            </div>
          </div>
        )}

        {/* History grid */}
        <div className="p-5">
          {historyLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '16/10', background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : history.length > 0 ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {history.map(item => (
                  <VideoCard key={item.id} item={item} onSelect={() => setSelectedItem(item)} />
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
    </div>
  )
}
