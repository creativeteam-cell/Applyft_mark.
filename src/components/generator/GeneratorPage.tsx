'use client'

import { useState, useRef } from 'react'

const ENGINES = [
  {
    id: 'gemini',
    label: 'Banana',
    sublabel: 'Gemini 3.1 Flash',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#g1)"/>
        <defs>
          <linearGradient id="g1" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4285F4"/>
            <stop offset="0.5" stopColor="#34A853"/>
            <stop offset="1" stopColor="#FBBC05"/>
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'dalle',
    label: 'GPT',
    sublabel: 'DALL-E 3',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M22.28 9.28a5.76 5.76 0 0 0-.49-4.73 5.83 5.83 0 0 0-6.28-2.8A5.76 5.76 0 0 0 11.21 0a5.83 5.83 0 0 0-5.56 4.04 5.76 5.76 0 0 0-3.84 2.79 5.83 5.83 0 0 0 .72 6.84 5.76 5.76 0 0 0 .49 4.73 5.83 5.83 0 0 0 6.28 2.8A5.76 5.76 0 0 0 12.79 24a5.83 5.83 0 0 0 5.57-4.04 5.76 5.76 0 0 0 3.84-2.79 5.83 5.83 0 0 0-.72-6.84l-.2.15z" fill="currentColor"/>
      </svg>
    ),
  },
]

const SIZES: Record<string, { label: string; ratio: string; w: number; h: number }[]> = {
  gemini: [
    { label: '4×5', ratio: '4:5', w: 4, h: 5 },
    { label: '1×1', ratio: '1:1', w: 1, h: 1 },
    { label: '9×16', ratio: '9:16', w: 9, h: 16 },
    { label: '1.91×1', ratio: '1.91:1', w: 1.91, h: 1 },
  ],
  dalle: [
    { label: '1×1', ratio: '1:1', w: 1, h: 1 },
    { label: '16×9', ratio: '16:9', w: 16, h: 9 },
    { label: '9×16', ratio: '9:16', w: 9, h: 16 },
  ],
}

const MOCK_HISTORY = [
  { id: '1', prompt: 'Fitness app ad, woman running at sunrise, motivational', engine: 'Banana', size: '4×5', url: null },
  { id: '2', prompt: 'Family tracker app, happy family portrait', engine: 'GPT', size: '1×1', url: null },
  { id: '3', prompt: 'Dating app, couple on a date, warm lighting', engine: 'Banana', size: '9×16', url: null },
  { id: '4', prompt: 'Security app, phone with shield icon, dark theme', engine: 'Banana', size: '1.91×1', url: null },
]

export function GeneratorPage() {
  const [engine, setEngine] = useState<'gemini' | 'dalle'>('gemini')
  const [selectedSize, setSelectedSize] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const referenceRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  const sizes = SIZES[engine]

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string | null) => void) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setter(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const currentSize = sizes[selectedSize] || sizes[0]
  // Normalize for preview box (max 56px wide, 80px tall)
  const previewW = currentSize.w >= currentSize.h ? 56 : Math.round(56 * currentSize.w / currentSize.h)
  const previewH = currentSize.h >= currentSize.w ? 80 : Math.round(80 * currentSize.h / currentSize.w)

  return (
    <div className="min-h-screen pt-14" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Generator</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Generate ad creatives directly via API — no markup, no credits.
          </p>
        </div>

        <div className="flex gap-6">

          {/* LEFT PANEL — Controls */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-4">

            {/* Engine switcher */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Engine
              </div>
              <div className="flex gap-2">
                {ENGINES.map(eng => (
                  <button
                    key={eng.id}
                    onClick={() => { setEngine(eng.id as any); setSelectedSize(0) }}
                    className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-all"
                    style={{
                      background: engine === eng.id ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${engine === eng.id ? 'var(--accent)' : 'var(--border)'}`,
                      color: engine === eng.id ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {eng.icon}
                    <span className="text-sm font-semibold">{eng.label}</span>
                    <span className="text-xs opacity-60">{eng.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size selector */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Format
              </div>
              <div className="flex gap-2 flex-wrap">
                {sizes.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => setSelectedSize(i)}
                    className="flex flex-col items-center gap-2 py-3 px-3 rounded-lg transition-all"
                    style={{
                      background: selectedSize === i ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedSize === i ? 'var(--accent)' : 'var(--border)'}`,
                      color: selectedSize === i ? 'var(--accent)' : 'var(--text-muted)',
                      minWidth: 64,
                    }}
                  >
                    {/* Aspect ratio preview box */}
                    <div className="flex items-center justify-center" style={{ width: 40, height: 40 }}>
                      <div
                        className="rounded-sm"
                        style={{
                          width: s.w >= s.h ? 36 : Math.round(36 * s.w / s.h),
                          height: s.h >= s.w ? 36 : Math.round(36 * s.h / s.w),
                          background: selectedSize === i ? 'rgba(79,110,247,0.4)' : 'rgba(255,255,255,0.1)',
                          border: `1.5px solid ${selectedSize === i ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono font-semibold">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference image */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Reference
              </div>
              {reference ? (
                <div className="relative group">
                  <img src={reference} alt="reference" className="w-full h-32 object-cover rounded-lg" />
                  <button
                    onClick={() => setReference(null)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => referenceRef.current?.click()}
                  className="w-full h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:border-accent"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <span className="text-xs">Upload reference</span>
                </button>
              )}
              <input ref={referenceRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, setReference)} />
            </div>

            {/* Logo */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Logo
              </div>
              {logo ? (
                <div className="relative group">
                  <img src={logo} alt="logo" className="h-12 object-contain rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', padding: 8 }} />
                  <button
                    onClick={() => setLogo(null)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => logoRef.current?.click()}
                  className="w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all hover:border-accent"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  <span className="text-xs">Add logo</span>
                </button>
              )}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, setLogo)} />
            </div>

          </div>

          {/* RIGHT PANEL — Prompt + Result */}
          <div className="flex-1 flex flex-col gap-4">

            {/* Prompt */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Prompt
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what you want to generate..."
                rows={5}
                className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
                style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
              />
              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  {/* Format pill */}
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
                    {currentSize.label}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                    {engine === 'gemini' ? 'Banana' : 'GPT'}
                  </span>
                </div>
                <button
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: 'var(--accent)', color: 'white', opacity: prompt.trim() ? 1 : 0.4 }}
                  disabled={!prompt.trim()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  Generate
                </button>
              </div>
            </div>

            {/* Result area */}
            <div className="flex-1 rounded-xl flex items-center justify-center min-h-64"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex flex-col items-center gap-3 text-center px-8">
                {/* Aspect ratio preview */}
                <div
                  className="rounded-lg"
                  style={{
                    width: previewW * 2,
                    height: previewH * 2,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px dashed rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
                    style={{ color: 'rgba(255,255,255,0.15)' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Result will appear here
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* History */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Recent generations</h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saved to Google Drive</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {MOCK_HISTORY.map(item => (
              <div key={item.id} className="rounded-xl overflow-hidden group cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {/* Image placeholder */}
                <div className="aspect-[4/5] flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
                    style={{ color: 'rgba(255,255,255,0.1)' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>
                <div className="p-3">
                  <p className="text-xs leading-snug line-clamp-2 mb-2" style={{ color: 'var(--text-muted)' }}>
                    {item.prompt}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)', fontSize: 10 }}>
                      {item.engine}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: 10 }}>
                      {item.size}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
