'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const ENGINES = [
  { id: 'gemini', label: 'Banana', sublabel: 'Gemini 3.1 Flash' },
  { id: 'dalle',  label: 'GPT',    sublabel: 'OpenAI · DALL-E 3' },
]

const SIZES: Record<string, { label: string }[]> = {
  gemini: [
    { label: '4×5' },
    { label: '1×1' },
    { label: '9×16' },
    { label: '1.91×1' },
  ],
  dalle: [
    { label: '1×1' },
    { label: '16×9' },
    { label: '9×16' },
  ],
}

// All sizes available in the modal (for recompose, Gemini handles all)
const MODAL_SIZES = ['4×5', '1×1', '9×16', '1.91×1']

// Derive a consistent color from email/name
function colorFromString(str: string) {
  const colors = ['#4f6ef7', '#e05c8a', '#34a853', '#fbbc05', '#e8453c', '#9c27b0', '#00acc1']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

interface HistoryItem {
  id: string
  prompt: string
  engine: string
  size: string
  userName: string
  userEmail: string
  userImage: string
  thumbnailLink: string | null
  webViewLink: string | null
  createdTime: string
}

function UserAvatar({ name, email, image, size = 28, selected, onClick }: {
  name: string
  email: string
  image?: string
  size?: number
  selected?: boolean
  onClick?: () => void
}) {
  const color = colorFromString(email || name)
  return (
    <button
      onClick={onClick}
      title={name}
      className="rounded-full flex-shrink-0 transition-all overflow-hidden"
      style={{
        width: size, height: size,
        outline: selected ? '2px solid white' : '2px solid transparent',
        outlineOffset: 1,
        opacity: selected === undefined ? 1 : selected ? 1 : 0.4,
      }}
    >
      {image ? (
        <img src={image} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-semibold"
          style={{ background: color, color: 'white', fontSize: size * 0.35 }}>
          {initials(name)}
        </div>
      )}
    </button>
  )
}

function HistoryGrid({ items, onSelect, filterLabel }: {
  items: HistoryItem[]
  onSelect?: (item: HistoryItem) => void
  filterLabel?: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {filterLabel || 'No generations yet'}
        </p>
      </div>
    )
  }
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {items.map(item => (
        <div key={item.id}
          onClick={() => onSelect?.(item)}
          className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="aspect-[4/5] flex items-center justify-center overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            {item.thumbnailLink ? (
              <img src={item.thumbnailLink} alt={item.prompt} className="w-full h-full object-cover" />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"
                style={{ color: 'rgba(255,255,255,0.1)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            )}
          </div>
          <div className="p-2.5">
            <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
              {item.prompt || item.id}
            </p>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className="rounded px-1.5 py-0.5 font-mono"
                  style={{ fontSize: 10, background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
                  {item.engine}
                </span>
                <span className="rounded px-1.5 py-0.5 font-mono"
                  style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  {item.size}
                </span>
              </div>
              {item.userName && (
                <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={20} />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PeopleFilter({ items, selectedEmails, onToggle, onClear }: {
  items: HistoryItem[]
  selectedEmails: Set<string>
  onToggle: (email: string) => void
  onClear: () => void
}) {
  const users = Array.from(
    new Map(items.map(i => [i.userEmail, { email: i.userEmail, name: i.userName, image: i.userImage }])).values()
  ).filter(u => u.email)

  if (users.length === 0) return null
  return (
    <div className="flex items-center gap-2 mb-4">
      {users.map(u => (
        <UserAvatar
          key={u.email}
          name={u.name}
          email={u.email}
          image={u.image}
          size={30}
          selected={selectedEmails.size === 0 ? undefined : selectedEmails.has(u.email)}
          onClick={() => onToggle(u.email)}
        />
      ))}
      {selectedEmails.size > 0 && (
        <button onClick={onClear}
          className="text-xs px-2 py-1 rounded-lg transition-all"
          style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}>
          Clear
        </button>
      )}
    </div>
  )
}

// ─── Image Card Modal ────────────────────────────────────────────────────────

function ImageCardModal({ item, onClose, onGenerated }: {
  item: HistoryItem
  onClose: () => void
  onGenerated: () => void
}) {
  const defaultSizeIdx = Math.max(0, MODAL_SIZES.indexOf(item.size))
  const [sizeIdx, setSizeIdx] = useState(defaultSizeIdx)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  // Load full image from our API
  useEffect(() => {
    setImgSrc(`/api/generator/image/${item.id}`)
  }, [item.id])

  function handleCopyPrompt() {
    navigator.clipboard.writeText(item.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError(null)

    const targetSize = MODAL_SIZES[sizeIdx]
    const sizeCode = targetSize.replace('×', 'x')

    try {
      if (!newPrompt.trim()) {
        // Recompose: send fileId to server — it fetches from Drive directly (avoids 413)
        const res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recomposeFileId: item.id, targetSize }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Recompose failed')
        onGenerated()
        onClose()
      } else {
        // Generate new image with the new prompt, same engine as original
        const engine = item.engine === 'GPT' ? 'dalle' : 'gemini'
        const res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: newPrompt.trim(), engine, size: targetSize }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Generation failed')
        onGenerated()
        onClose()
      }
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  function handleDownload() {
    const link = document.createElement('a')
    link.href = `/api/generator/image/${item.id}?download=1`
    link.download = `generated-${item.id}.jpg`
    link.click()
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="relative flex rounded-2xl overflow-hidden max-h-[90vh] w-full max-w-3xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Image */}
        <div className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 340, background: 'rgba(0,0,0,0.3)' }}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={item.prompt}
              className="max-w-full max-h-[90vh] object-contain"
              onError={() => {
                // Fallback to thumbnail
                if (item.thumbnailLink) setImgSrc(item.thumbnailLink)
              }}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-64">
              <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10"/>
              </svg>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5">

          {/* Meta */}
          <div className="flex items-center gap-2 mb-4">
            <span className="rounded px-2 py-1 text-xs font-mono font-medium"
              style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
              {item.engine}
            </span>
            <span className="rounded px-2 py-1 text-xs font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              {item.size}
            </span>
            {item.userName && (
              <div className="flex items-center gap-1.5 ml-auto">
                <UserAvatar name={item.userName} email={item.userEmail} image={item.userImage} size={22} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.userName}</span>
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Prompt
              </span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-all"
                style={{
                  background: copied ? 'rgba(52,168,83,0.15)' : 'rgba(255,255,255,0.06)',
                  color: copied ? '#34a853' : 'var(--text-muted)',
                }}
              >
                {copied ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              {item.prompt || <span style={{ color: 'var(--text-muted)' }}>No prompt saved</span>}
            </p>
          </div>

          {/* Divider */}
          <div className="mb-5" style={{ height: 1, background: 'var(--border)' }} />

          {/* Size selector */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Size</div>
            <div className="relative">
              <button
                onClick={() => setSizeOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
              >
                <span className="font-mono font-medium">{MODAL_SIZES[sizeIdx]}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                  className={`transition-transform ${sizeOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              {sizeOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {MODAL_SIZES.map((s, i) => (
                    <button key={s} onClick={() => { setSizeIdx(i); setSizeOpen(false) }}
                      className="w-full px-3 py-2.5 text-sm hover:bg-white/5 text-left font-mono font-medium"
                      style={{ color: sizeIdx === i ? 'var(--accent)' : 'var(--text)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* New prompt */}
          <div className="mb-4 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>
              New prompt
              <span className="ml-1 font-normal normal-case" style={{ color: 'rgba(255,255,255,0.25)' }}>
                (leave empty to resize only)
              </span>
            </div>
            <textarea
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
              placeholder="Describe a variation, or leave empty to recompose at new size..."
              rows={3}
              className="w-full rounded-lg resize-none outline-none text-sm leading-relaxed p-3"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${newPrompt ? 'var(--accent)' : 'var(--border)'}`,
                color: 'var(--text)',
                caretColor: 'var(--accent)',
                transition: 'border-color 0.2s',
              }}
            />
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: !generating ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: !generating ? 'white' : 'var(--text-muted)',
              }}
            >
              {generating ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                  {newPrompt.trim() ? 'Generating...' : 'Resizing...'}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  {newPrompt.trim() ? 'Generate' : 'Resize'}
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
              title="Download original"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function GeneratorPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<'image' | 'video'>('image')

  // Shared history state
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null)

  const filteredHistory = selectedEmails.size === 0
    ? history
    : history.filter(h => selectedEmails.has(h.userEmail))

  function toggleEmail(email: string) {
    setSelectedEmails(prev => {
      const next = new Set(prev)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/generator/history')
      const data = await res.json()
      setHistory(data.items || [])
    } catch { /* silent */ }
    setHistoryLoading(false)
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // Image tab state
  const [engineOpen, setEngineOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [engine, setEngine] = useState<'gemini' | 'dalle'>('gemini')
  const [selectedSize, setSelectedSize] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [aiPrompt, setAiPrompt] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [logo] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const referenceRef = useRef<HTMLInputElement>(null)

  const sizes = SIZES[engine]
  const currentEngine = ENGINES.find(e => e.id === engine)!
  const currentSize = sizes[selectedSize] || sizes[0]

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setter(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleGenerate() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, engine, size: currentSize.label, referenceBase64: reference, aiPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setResult(data.imageBase64)
      fetchHistory()
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh', paddingTop: 56, background: 'var(--bg)' }}>

      {/* Modal */}
      {selectedItem && (
        <ImageCardModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onGenerated={() => { fetchHistory(); setSelectedItem(null) }}
        />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {(['image', 'video'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-2 text-sm font-medium capitalize transition-all relative"
            style={{ color: tab === t ? 'var(--accent)' : 'var(--text-muted)' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>

      {tab === 'video' ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
            style={{ color: 'rgba(255,255,255,0.1)' }}>
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Video generation — coming soon</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* LEFT SIDEBAR */}
          <div className="flex-shrink-0 flex flex-col overflow-y-auto"
            style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex flex-col gap-0 p-4 flex-1">

              {/* Engine */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Model</div>
                <div className="relative">
                  <button onClick={() => { setEngineOpen(o => !o); setSizeOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                      <span className="font-medium">{currentEngine.label}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{currentEngine.sublabel}</span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                      className={`transition-transform ${engineOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-muted)' }}>
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {engineOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {ENGINES.map(eng => (
                        <button key={eng.id}
                          onClick={() => { setEngine(eng.id as any); setSelectedSize(0); setEngineOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/5 text-left"
                          style={{ color: engine === eng.id ? 'var(--accent)' : 'var(--text)' }}>
                          <span className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: engine === eng.id ? 'var(--accent)' : 'var(--border)' }} />
                          <span className="font-medium">{eng.label}</span>
                          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{eng.sublabel}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Format */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Format</div>
                <div className="relative">
                  <button onClick={() => { setSizeOpen(o => !o); setEngineOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                    <span className="font-mono font-medium">{currentSize.label}</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                      className={`transition-transform ${sizeOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-muted)' }}>
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {sizeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {sizes.map((s, i) => (
                        <button key={s.label} onClick={() => { setSelectedSize(i); setSizeOpen(false) }}
                          className="w-full px-3 py-2.5 text-sm hover:bg-white/5 text-left font-mono font-medium"
                          style={{ color: selectedSize === i ? 'var(--accent)' : 'var(--text)' }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Reference */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Reference</div>
                {reference ? (
                  <div className="relative group">
                    <img src={reference} alt="ref" className="w-full h-28 object-cover rounded-lg" />
                    <button onClick={() => setReference(null)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.75)' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => referenceRef.current?.click()}
                    className="w-full h-20 rounded-lg border-2 border-dashed flex items-center justify-center gap-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span className="text-xs">Add reference</span>
                  </button>
                )}
                <input ref={referenceRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleFileUpload(e, setReference)} />
              </div>

              {/* Prompt */}
              <div className="flex-1 flex flex-col mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Prompt</div>
                <div className="flex-1 rounded-lg flex flex-col overflow-hidden"
                  style={{ border: `1px solid ${prompt ? 'var(--accent)' : 'var(--border)'}`, background: 'rgba(79,110,247,0.04)', transition: 'border-color 0.2s' }}>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="Describe your image..."
                    className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed p-3 min-h-[100px]"
                    style={{ color: 'var(--text)', caretColor: 'var(--accent)' }} />
                  <div className="flex items-center px-3 py-2"
                    style={{ borderTop: '1px solid rgba(79,110,247,0.15)' }}>
                    <button onClick={() => setAiPrompt(v => !v)}
                      className="relative w-8 h-4 rounded-full transition-all flex-shrink-0"
                      style={{ background: aiPrompt ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}>
                      <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                        style={{ left: aiPrompt ? 'calc(100% - 14px)' : 2 }} />
                    </button>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>AI prompt</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Generate button */}
            <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              {error && (
                <p className="text-xs text-red-400 mb-2 text-center">{error}</p>
              )}
              <button onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: prompt.trim() && !generating ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                  color: prompt.trim() && !generating ? 'white' : 'var(--text-muted)',
                }}>
                {generating ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="flex-1 overflow-y-auto p-6 min-w-0">

            {/* Recent */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Recent</h2>
              <div className="flex items-center gap-2">
                {historyLoading && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</span>}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saved to Google Drive</span>
              </div>
            </div>
            <PeopleFilter
              items={history}
              selectedEmails={selectedEmails}
              onToggle={toggleEmail}
              onClear={() => setSelectedEmails(new Set())}
            />
            <HistoryGrid
              items={filteredHistory}
              onSelect={item => setSelectedItem(item)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
