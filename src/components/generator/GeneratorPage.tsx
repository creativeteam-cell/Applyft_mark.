'use client'

import { useState, useRef } from 'react'

const ENGINES = [
  { id: 'gemini', label: 'Banana', sublabel: 'Gemini 3.1 Flash' },
  { id: 'dalle',  label: 'GPT',    sublabel: 'DALL-E 3' },
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

const MOCK_HISTORY = [
  { id: '1', prompt: 'Fitness app ad, woman running at sunrise, motivational', engine: 'Banana', size: '4×5' },
  { id: '2', prompt: 'Family tracker app, happy family portrait', engine: 'GPT', size: '1×1' },
  { id: '3', prompt: 'Dating app, couple on a date, warm lighting', engine: 'Banana', size: '9×16' },
  { id: '4', prompt: 'Security app, phone with shield icon, dark theme', engine: 'Banana', size: '1.91×1' },
  { id: '5', prompt: 'Health tracking app, clean UI screenshot mockup', engine: 'GPT', size: '1×1' },
  { id: '6', prompt: 'Travel app ad, scenic mountain landscape', engine: 'Banana', size: '4×5' },
]

export function GeneratorPage() {
  const [tab, setTab] = useState<'image' | 'video'>('image')
  const [engineOpen, setEngineOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [engine, setEngine] = useState<'gemini' | 'dalle'>('gemini')
  const [selectedSize, setSelectedSize] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [aiPrompt, setAiPrompt] = useState(true)
  const [reference, setReference] = useState<string | null>(null)
  const referenceRef = useRef<HTMLInputElement>(null)

  const sizes = SIZES[engine]
  const currentEngine = ENGINES.find(e => e.id === engine)!
  const currentSize = sizes[selectedSize] || sizes[0]

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setReference(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh', paddingTop: 56, background: 'var(--bg)' }}>

      {/* Top tabs: Image / Video */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {(['image', 'video'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2 text-sm font-medium capitalize transition-all relative"
            style={{ color: tab === t ? 'var(--accent)' : 'var(--text-muted)' }}
          >
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
          <p style={{ color: 'var(--text-muted)' }} className="text-sm">Video generation — coming soon</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* LEFT SIDEBAR */}
          <div className="flex-shrink-0 flex flex-col overflow-y-auto"
            style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>

            <div className="flex flex-col gap-0 p-4 flex-1">

              {/* Model */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Model</div>
                <div className="relative">
                  <button
                    onClick={() => { setEngineOpen(o => !o); setSizeOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
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
                        <button
                          key={eng.id}
                          onClick={() => { setEngine(eng.id as any); setSelectedSize(0); setEngineOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-all hover:bg-white/5 text-left"
                          style={{ color: engine === eng.id ? 'var(--accent)' : 'var(--text)' }}
                        >
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
                  <button
                    onClick={() => { setSizeOpen(o => !o); setEngineOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                  >
                    <span className="font-medium">{currentSize.label}</span>
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
                        <button
                          key={s.label}
                          onClick={() => { setSelectedSize(i); setSizeOpen(false) }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all hover:bg-white/5 text-left"
                          style={{ color: selectedSize === i ? 'var(--accent)' : 'var(--text)' }}
                        >
                          <span className="font-mono font-medium">{s.label}</span>
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
                    <button
                      onClick={() => setReference(null)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.75)' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => referenceRef.current?.click()}
                    className="w-full h-20 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span className="text-xs">Add reference</span>
                  </button>
                )}
                <input ref={referenceRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>

              {/* Prompt */}
              <div className="flex-1 flex flex-col mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}>Prompt</div>
                <div className="flex-1 rounded-lg flex flex-col overflow-hidden"
                  style={{ border: '1px solid var(--accent)', background: 'rgba(79,110,247,0.04)' }}>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Describe your image — be specific about style, mood, composition..."
                    className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed p-3 min-h-[120px]"
                    style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
                  />
                  {/* AI prompt toggle */}
                  <div className="flex items-center justify-between px-3 py-2"
                    style={{ borderTop: '1px solid rgba(79,110,247,0.2)' }}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAiPrompt(v => !v)}
                        className="relative w-8 h-4 rounded-full transition-all flex-shrink-0"
                        style={{ background: aiPrompt ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}
                      >
                        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                          style={{ left: aiPrompt ? 'calc(100% - 14px)' : 2 }} />
                      </button>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>AI prompt</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Generate button — pinned to bottom */}
            <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: prompt.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.06)', color: prompt.trim() ? 'white' : 'var(--text-muted)', cursor: prompt.trim() ? 'pointer' : 'default' }}
                disabled={!prompt.trim()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Generate
              </button>
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="flex-1 overflow-y-auto p-6 min-w-0">

            {/* Empty state */}
            <div className="mb-8 rounded-xl flex items-center justify-center"
              style={{ minHeight: 280, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex flex-col items-center gap-3 text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"
                  style={{ color: 'rgba(255,255,255,0.1)' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Your generation will appear here
                </p>
              </div>
            </div>

            {/* History */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Recent</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saved to Google Drive</span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {MOCK_HISTORY.map(item => (
                <div key={item.id}
                  className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="aspect-[4/5] flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"
                      style={{ color: 'rgba(255,255,255,0.1)' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="M21 15l-5-5L5 21"/>
                    </svg>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {item.prompt}
                    </p>
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
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
