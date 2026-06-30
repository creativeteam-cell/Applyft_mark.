'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { setQueueActive } from '@/lib/queueClient'
import { VideoPage } from '@/components/video/VideoPage'

// Shrink image to max px on longest side (JPEG) to stay under Vercel's 4.5MB payload limit
function shrinkImage(dataUrl: string, maxPx = 1536): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

interface ModelDef {
  id: string
  provider: 'gemini' | 'openai'
  apiModel: string
  label: string
  providerLabel: string
  description: string
  tags: string[]
  supportsReference: boolean
  sizes: { label: string }[]
}

const MODELS: ModelDef[] = [
  {
    id: 'banana2',
    provider: 'gemini',
    apiModel: 'gemini-3.1-flash-image',
    label: 'Banana 2',
    providerLabel: 'Gemini Image',
    description: 'Fast, stable generation for high-volume tasks',
    tags: ['Fast', 'Stable', 'HD'],
    supportsReference: true,
    sizes: [{ label: '4x5' }, { label: '1x1' }, { label: '9x16' }, { label: '1.91x1' }],
  },
  {
    id: 'bananapro',
    provider: 'gemini',
    apiModel: 'gemini-3-pro-image',
    label: 'Banana Pro',
    providerLabel: 'Gemini Image',
    description: 'Studio-quality 4K visuals, best for complex scenes and text',
    tags: ['4K', 'Best quality', 'Slow'],
    supportsReference: true,
    sizes: [{ label: '4x5' }, { label: '1x1' }, { label: '9x16' }, { label: '1.91x1' }],
  },
  {
    id: 'nanobanana',
    provider: 'gemini',
    apiModel: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    providerLabel: 'Gemini Image · 2.5',
    description: 'State-of-the-art creative image workflows',
    tags: ['Fast', 'Creative', 'Flexible'],
    supportsReference: true,
    sizes: [{ label: '4x5' }, { label: '1x1' }, { label: '9x16' }, { label: '1.91x1' }],
  },
  {
    id: 'gptimage1',
    provider: 'openai',
    apiModel: 'gpt-image-1',
    label: 'GPT Image 1',
    providerLabel: 'OpenAI',
    description: 'Precise editing, excellent for text in images',
    tags: ['Text', 'Editing', 'HD'],
    supportsReference: true,
    sizes: [{ label: '1x1' }, { label: '16x9' }, { label: '9x16' }],
  },
]

const PROVIDERS = [
  { id: 'gemini' as const, label: 'Gemini Image' },
  { id: 'openai' as const, label: 'OpenAI' },
]

const MODAL_SIZES_BY_PROVIDER: Record<string, string[]> = {
  gemini: ['4x5', '1x1', '9x16', '1.91x1'],
  openai: ['1x1', '16x9', '9x16'],
}

const STYLE_GROUPS = [
  {
    label: 'Realism',
    styles: [
      { id: 'photo',      image: 'Photo.png',      label: 'Photo',      suffix: ', photorealistic, high-resolution DSLR photography, natural lighting, sharp details' },
      { id: 'cinematic',  image: 'Cinematic.png',  label: 'Cinematic',  suffix: ', cinematic shot, dramatic moody lighting, film color grading, anamorphic lens bokeh' },
      { id: 'aerial',     image: 'Aerial.png',     label: 'Aerial',     suffix: ', aerial drone photography, bird\'s eye view, wide angle, sharp details from above' },
    ],
  },
  {
    label: '3D / Animation',
    styles: [
      { id: 'pixar',   image: 'Pixar.png',   label: 'Pixar',   suffix: ', Pixar 3D animation style, Disney character design, soft studio lighting, smooth surfaces' },
      { id: 'clay',    image: 'Clay.png',    label: 'Clay',    suffix: ', claymation style, colorful clay texture, soft rounded shapes, stop-motion aesthetic' },
      { id: 'neon3d',  image: 'neon3d.png',  label: 'Neon 3D', suffix: ', glossy 3D render, neon glow lighting, dark background, reflective surfaces, cyberpunk palette' },
    ],
  },
  {
    label: 'Illustrated',
    styles: [
      { id: 'anime',      image: 'Anime.png',      label: 'Anime',       suffix: ', Japanese anime illustration style, clean line art, vibrant colors, manga aesthetic' },
      { id: 'handdrawn',  image: 'handdrawn.png',  label: 'Hand Drawn',  suffix: ', hand-drawn pencil and ink sketch, crosshatching, vintage illustration, black and white' },
      { id: 'watercolor', image: 'Watercolor.png', label: 'Watercolor',  suffix: ', watercolor painting, soft color washes, wet-on-wet technique, delicate brushstrokes' },
      { id: 'comic',      image: 'Comic.png',      label: 'Comic',       suffix: ', pop-art comic book style, bold outlines, halftone dots, bright flat colors' },
    ],
  },
  {
    label: 'Texture / Art',
    styles: [
      { id: 'origami',   image: 'Origami.png',   label: 'Origami',   suffix: ', origami paper folding art style, geometric paper shapes, clean folds, minimalist' },
      { id: 'quilling',  image: 'Quilling.png',  label: 'Quilling',  suffix: ', paper quilling art, colorful rolled paper strips, intricate swirls, handcraft texture' },
      { id: 'marble',    image: 'Marble.png',    label: 'Marble',    suffix: ', marble stone sculpture, classical Greco-Roman style, white and grey stone texture, museum quality' },
      { id: 'sticker',   image: 'Sticker.png',   label: 'Sticker',   suffix: ', sticker illustration, thick white outline, flat colors, cute cartoon style' },
    ],
  },
]

const ALL_STYLES = STYLE_GROUPS.flatMap(g => g.styles)

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
  name: string; email: string; image?: string; size?: number; selected?: boolean; onClick?: () => void
}) {
  const color = colorFromString(email || name)
  return (
    <button onClick={onClick} title={name}
      className="rounded-full flex-shrink-0 transition-all overflow-hidden"
      style={{ width: size, height: size,
        outline: selected ? '2px solid white' : '2px solid transparent',
        outlineOffset: 1,
        opacity: selected === undefined ? 1 : selected ? 1 : 0.4 }}>
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

// Maps size label → CSS aspect-ratio value
const SIZE_ASPECT: Record<string, string> = {
  '4x5':    '4 / 5',
  '1x1':    '1 / 1',
  '9x16':   '9 / 16',
  '1.91x1': '1.91 / 1',
}

function HistoryGrid({ items, onSelect }: { items: HistoryItem[]; onSelect?: (item: HistoryItem) => void }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>No generations yet</p>
      </div>
    )
  }
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {items.map(item => {
        const aspect = SIZE_ASPECT[item.size] ?? '4 / 5'
        return (
        <div key={item.id} onClick={() => onSelect?.(item)}
          className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="w-full overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: aspect, background: 'rgba(255,255,255,0.02)' }}>
            {item.thumbnailLink ? (
              <img src={item.thumbnailLink} alt={item.prompt} className="w-full h-full object-fill" />
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
        )
      })}
    </div>
  )
}

function PeopleFilter({ items, selectedEmails, onToggle, onClear }: {
  items: HistoryItem[]; selectedEmails: Set<string>; onToggle: (email: string) => void; onClear: () => void
}) {
  const users = Array.from(
    new Map(items.map(i => [i.userEmail, { email: i.userEmail, name: i.userName, image: i.userImage }])).values()
  ).filter(u => u.email)
  if (users.length === 0) return null
  return (
    <div className="flex items-center gap-2 mb-4">
      {users.map(u => (
        <UserAvatar key={u.email} name={u.name} email={u.email} image={u.image} size={30}
          selected={selectedEmails.size === 0 ? undefined : selectedEmails.has(u.email)}
          onClick={() => onToggle(u.email)} />
      ))}
      {selectedEmails.size > 0 && (
        <button onClick={onClear} className="text-xs px-2 py-1 rounded-lg transition-all"
          style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}>
          Clear
        </button>
      )}
    </div>
  )
}

function StylePicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 8)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 8)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8)
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Style</span>
        {selected && (
          <button onClick={() => onSelect(null)} className="text-xs px-2 py-0.5 rounded transition-all"
            style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}>
            Clear
          </button>
        )}
      </div>
      <div className="relative">
        <div ref={scrollRef} onScroll={handleScroll}
          className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' } as any}>
          {ALL_STYLES.map(style => (
            <button key={style.id}
              onClick={() => onSelect(selected === style.id ? null : style.id)}
              className="flex-shrink-0 flex flex-col items-center gap-1 transition-all"
              title={style.label}>
              <div className="rounded-lg overflow-hidden transition-all"
                style={{ width: 52, height: 68,
                  outline: selected === style.id ? '2px solid var(--accent)' : '2px solid transparent',
                  outlineOffset: 2,
                  opacity: selected && selected !== style.id ? 0.45 : 1 }}>
                <img src={`/styles/${style.image}`} alt={style.label} className="w-full h-full object-cover" />
              </div>
              <span className="text-center leading-tight"
                style={{ fontSize: 9,
                  color: selected === style.id ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: selected === style.id ? 600 : 400,
                  maxWidth: 52, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {style.label}
              </span>
            </button>
          ))}
        </div>
        {/* Left arrow */}
        {!atStart && (
          <div className="absolute top-0 left-0 h-full flex items-center justify-start"
            style={{ width: 40, background: 'linear-gradient(to left, transparent, var(--surface) 70%)' }}>
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all hover:bg-white/10"
              style={{ marginLeft: 2, color: 'var(--text-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
        {/* Right arrow */}
        {!atEnd && (
          <div className="absolute top-0 right-0 h-full flex items-center justify-end"
            style={{ width: 40, background: 'linear-gradient(to right, transparent, var(--surface) 70%)' }}>
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all hover:bg-white/10"
              style={{ marginRight: 2, color: 'var(--text-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared model picker sub-component ────────────────────────────────────────

function ModelPicker({ selectedModelId, onSelect }: {
  selectedModelId: string
  onSelect: (id: string) => void
}) {
  const [provider, setProvider] = useState<'gemini' | 'openai'>(() => {
    return MODELS.find(m => m.id === selectedModelId)?.provider ?? 'gemini'
  })
  const [modelOpen, setModelOpen] = useState(false)
  const providerModels = MODELS.filter(m => m.provider === provider)
  const current = MODELS.find(m => m.id === selectedModelId) ?? MODELS[0]

  function switchProvider(p: 'gemini' | 'openai') {
    setProvider(p)
    setModelOpen(false)
    const first = MODELS.find(m => m.provider === p)
    if (first && first.id !== selectedModelId) onSelect(first.id)
  }

  return (
    <div>
      {/* Provider tabs */}
      <div className="flex rounded-lg overflow-hidden mb-2" style={{ border: '1px solid var(--border)' }}>
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => switchProvider(p.id)}
            className="flex-1 py-1.5 text-xs font-medium transition-all"
            style={{
              background: provider === p.id ? 'var(--accent)' : 'transparent',
              color: provider === p.id ? 'white' : 'var(--text-muted)',
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Sub-model dropdown */}
      <div className="relative mb-2">
        <button onClick={() => setModelOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
            <span className="font-medium">{current.label}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            className={`transition-transform ${modelOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {modelOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-30"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            {providerModels.map(m => (
              <button key={m.id}
                onClick={() => { onSelect(m.id); setModelOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/5 text-left"
                style={{ color: m.id === selectedModelId ? 'var(--accent)' : 'var(--text)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: m.id === selectedModelId ? 'var(--accent)' : 'var(--border)' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{m.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Model info tags */}
      <div className="flex gap-1 flex-wrap">
        {current.tags.map(tag => (
          <span key={tag} className="rounded px-1.5 py-0.5 text-xs"
            style={{ background: 'rgba(79,110,247,0.1)', color: 'var(--text-muted)' }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Image Card Modal ──────────────────────────────────────────────────────────

function ImageCardModal({ item, onClose, onGenerated }: {
  item: HistoryItem; onClose: () => void; onGenerated: () => void
}) {
  const normalizedItemSize = item.size.replace(/[^\dx.]/g, 'x')
  const defaultModelId = item.engine === 'GPT' ? 'gptimage1' : 'banana2'

  const [selectedModelId, setSelectedModelId] = useState(defaultModelId)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  const currentModel = MODELS.find(m => m.id === selectedModelId) ?? MODELS[0]
  const availableSizes = currentModel.sizes.map(s => s.label)

  const [selectedSize, setSelectedSize] = useState<string>(() =>
    availableSizes.includes(normalizedItemSize) ? normalizedItemSize : availableSizes[0]
  )

  // When model changes, reset size if not compatible
  function handleModelSelect(id: string) {
    setSelectedModelId(id)
    const m = MODELS.find(x => x.id === id)!
    const sizes = m.sizes.map(s => s.label)
    if (!sizes.includes(selectedSize)) setSelectedSize(sizes[0])
  }

  useEffect(() => { setImgSrc(`/api/generator/image/${item.id}`) }, [item.id])

  function handleCopyPrompt() {
    navigator.clipboard.writeText(item.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setQueueActive('gemini', true)
    setError(null)
    try {
      if (!newPrompt.trim()) {
        const res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recomposeFileId: item.id, targetSize: selectedSize }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Recompose failed')
        onGenerated(); onClose()
      } else {
        const res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: newPrompt.trim(),
            engine: currentModel.provider === 'openai' ? 'dalle' : 'gemini',
            modelId: selectedModelId,
            size: selectedSize,
            referenceFileId: item.id,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Generation failed')
        onGenerated(); onClose()
      }
    } catch (e: any) {
      setError(e.message)
    }
    setQueueActive('gemini', false)
    setGenerating(false)
  }

  function handleDownload() {
    const link = document.createElement('a')
    link.href = `/api/generator/image/${item.id}?download=1`
    link.download = `generated-${item.id}.jpg`
    link.click()
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

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

        {/* Image preview */}
        <div className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 340, background: 'rgba(0,0,0,0.3)' }}>
          {imgSrc ? (
            <img src={imgSrc} alt={item.prompt} className="max-w-full max-h-[90vh] object-contain"
              onError={() => { if (item.thumbnailLink) setImgSrc(item.thumbnailLink) }} />
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
              style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>{item.engine}</span>
            <span className="rounded px-2 py-1 text-xs font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{item.size}</span>
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
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Prompt</span>
              <button onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ background: copied ? 'rgba(52,168,83,0.15)' : 'rgba(255,255,255,0.06)', color: copied ? '#34a853' : 'var(--text-muted)' }}>
                {copied ? (
                  <><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Copied</>
                ) : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                )}
              </button>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              {item.prompt || <span style={{ color: 'var(--text-muted)' }}>No prompt saved</span>}
            </p>
          </div>

          <div className="mb-4" style={{ height: 1, background: 'var(--border)' }} />

          {/* Model picker */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Model</div>
            <ModelPicker selectedModelId={selectedModelId} onSelect={handleModelSelect} />
          </div>

          {/* Size dropdown */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Size</div>
            <div className="relative">
              <button onClick={() => setSizeOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                <span className="font-mono font-medium">{selectedSize}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                  className={`transition-transform ${sizeOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              {sizeOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {availableSizes.map(s => (
                    <button key={s} onClick={() => { setSelectedSize(s); setSizeOpen(false) }}
                      className="w-full px-3 py-2.5 text-sm hover:bg-white/5 text-left font-mono font-medium"
                      style={{ color: selectedSize === s ? 'var(--accent)' : 'var(--text)' }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* New prompt */}
          <div className="mb-4 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              New prompt
              <span className="ml-1 font-normal normal-case" style={{ color: 'rgba(255,255,255,0.25)' }}>(leave empty to resize only)</span>
            </div>
            <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
              placeholder="Describe a variation, or leave empty to recompose at new size..."
              rows={3} className="w-full rounded-lg resize-none outline-none text-sm leading-relaxed p-3"
              style={{ background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${newPrompt ? 'var(--accent)' : 'var(--border)'}`,
                color: 'var(--text)', caretColor: 'var(--accent)', transition: 'border-color 0.2s' }} />
          </div>

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          <div className="flex gap-2 mt-auto">
            <button onClick={handleGenerate} disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: !generating ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: !generating ? 'white' : 'var(--text-muted)' }}>
              {generating ? (
                <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>{newPrompt.trim() ? 'Generating...' : 'Resizing...'}</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>{newPrompt.trim() ? 'Generate' : 'Resize'}</>
              )}
            </button>
            <button onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
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

// Main Page

export function GeneratorPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<'image' | 'video'>('image')

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
    } catch { }
    setHistoryLoading(false)
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const [sizeOpen, setSizeOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState('banana2')
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [aiPrompt, setAiPrompt] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [describing, setDescribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const referenceRef = useRef<HTMLInputElement>(null)

  const currentModel = MODELS.find(m => m.id === selectedModelId) ?? MODELS[0]
  const currentSize = currentModel.sizes[selectedSizeIdx] ?? currentModel.sizes[0]

  function handleModelSelect(id: string) {
    setSelectedModelId(id)
    const m = MODELS.find(x => x.id === id)!
    // Keep size index if valid, else reset
    if (selectedSizeIdx >= m.sizes.length) setSelectedSizeIdx(0)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setter(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const styleSuffix = selectedStyle ? (ALL_STYLES.find(s => s.id === selectedStyle)?.suffix ?? '') : ''
  const hasPrompt = prompt.trim().length > 0
  const hasStyle = !!selectedStyle
  const isRestyle = !hasPrompt && hasStyle && !!reference
  const isResize  = !hasPrompt && !hasStyle && !!reference
  const canGenerate = (hasPrompt || hasStyle || !!reference) && !generating
  const btnLabel = generating
    ? (isRestyle ? 'Restyling...' : isResize ? 'Resizing...' : 'Generating...')
    : (isRestyle ? 'Restyle' : isResize ? 'Resize' : 'Generate')

  async function handleMakePrompt() {
    if (!reference) return
    setDescribing(true)
    setQueueActive('openai', true)
    try {
      const res = await fetch('/api/generator/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: reference }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
      if (data.description) setPrompt(data.description)
    } catch (e: any) {
      console.error('[describe]', e)
    }
    setQueueActive('openai', false)
    setDescribing(false)
  }

  async function handleGenerate() {
    if (!canGenerate) return
    setGenerating(true)
    setQueueActive('gemini', true)
    setError(null)
    try {
      // Shrink reference before sending — 2K image = ~3-5MB base64, Vercel limit is 4.5MB
      const refSmall = reference ? await shrinkImage(reference) : null

      let res: Response
      if (isResize) {
        res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recomposeBase64: refSmall, targetSize: currentSize.label }),
        })
      } else {
        const finalPrompt = isRestyle
          ? `Recreate this image in the following style${styleSuffix}`
          : prompt + styleSuffix
        res = await fetch('/api/generator/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: finalPrompt,
            engine: currentModel.provider === 'openai' ? 'dalle' : 'gemini',
            modelId: selectedModelId,
            size: currentSize.label,
            referenceBase64: currentModel.supportsReference ? refSmall : undefined,
            aiPrompt,
          }),
        })
      }
      const contentType = res.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await res.json() : { error: await res.text() }
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      fetchHistory()
    } catch (e: any) {
      setError(e.message)
    }
    setQueueActive('gemini', false)
    setGenerating(false)
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh', paddingTop: 56, background: 'var(--bg)' }}>

      {selectedItem && (
        <ImageCardModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onGenerated={() => { fetchHistory(); setSelectedItem(null) }}
        />
      )}

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
        <VideoPage />
      ) : (
        <div className="flex flex-1 min-h-0">

          <div className="flex-shrink-0 flex flex-col overflow-y-auto"
            style={{ width: 270, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex flex-col gap-0 p-4 flex-1">

              {/* Model */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Model</div>
                <ModelPicker selectedModelId={selectedModelId} onSelect={id => { handleModelSelect(id); setSizeOpen(false) }} />
              </div>

              {/* Format */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Format</div>
                <div className="relative">
                  <button onClick={() => setSizeOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                    <span className="font-mono font-medium">{currentSize.label}</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                      className={`transition-transform ${sizeOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}>
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {sizeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {currentModel.sizes.map((s, i) => (
                        <button key={s.label} onClick={() => { setSelectedSizeIdx(i); setSizeOpen(false) }}
                          className="w-full px-3 py-2.5 text-sm hover:bg-white/5 text-left font-mono font-medium"
                          style={{ color: selectedSizeIdx === i ? 'var(--accent)' : 'var(--text)' }}>{s.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Reference */}
              {currentModel.supportsReference && (
                <div className="mb-5">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Reference</div>
                  <input ref={referenceRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleFileUpload(e, setReference)} />
                  {reference ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="relative rounded-lg overflow-hidden" style={{ height: 80 }}>
                        <img src={reference} alt="reference" className="w-full h-full object-cover" />
                        <button onClick={() => setReference(null)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.6)' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                      <button onClick={handleMakePrompt} disabled={describing}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs transition-all"
                        style={{ background: 'rgba(79,110,247,0.1)', color: describing ? 'var(--text-muted)' : 'var(--accent)',
                          border: '1px solid rgba(79,110,247,0.25)' }}>
                        {describing ? (
                          <><svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                          </svg>Describing...</>
                        ) : (
                          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>Make prompt</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => referenceRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all hover:bg-white/5"
                      style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                      Upload reference
                    </button>
                  )}
                </div>
              )}

              {/* Style */}
              <div className="mb-5">
                <StylePicker selected={selectedStyle} onSelect={setSelectedStyle} />
              </div>

              {/* Prompt */}
              <div className="mb-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Prompt</span>
                  <button onClick={() => setAiPrompt(o => !o)}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-all"
                    style={{ background: aiPrompt ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.05)',
                      color: aiPrompt ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${aiPrompt ? 'var(--accent)' : 'transparent'}` }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    AI
                  </button>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={isRestyle ? 'Restyle reference with selected style...' : 'Describe the image...'}
                  rows={4} className="w-full rounded-lg resize-none outline-none text-sm leading-relaxed p-3 flex-1"
                  style={{ background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${prompt ? 'var(--accent)' : 'var(--border)'}`,
                    color: 'var(--text)', caretColor: 'var(--accent)', transition: 'border-color 0.2s' }} />
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            </div>

            {/* Generate button */}
            <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={handleGenerate} disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: canGenerate ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                  color: canGenerate ? 'white' : 'var(--text-muted)' }}>
                {generating ? (
                  <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>{btnLabel}</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>{btnLabel}</>
                )}
              </button>
            </div>
          </div>

          {/* Right panel — history */}
          <div className="flex-1 overflow-y-auto p-6">
            <PeopleFilter items={history} selectedEmails={selectedEmails} onToggle={toggleEmail} onClear={() => setSelectedEmails(new Set())} />
            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
              </div>
            ) : (
              <HistoryGrid items={filteredHistory} onSelect={setSelectedItem} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
