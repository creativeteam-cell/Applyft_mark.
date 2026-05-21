'use client'

import { useRef } from 'react'

interface App { code: string; name: string }

interface GeneratePanelProps {
  apps: App[]
  selectedApp: string
  onAppChange: (code: string) => void
  prompt: string
  onPromptChange: (v: string) => void
  reference: string | null
  onReferenceChange: (v: string | null) => void
  onGenerate: () => void
}

export function GeneratePanel({
  apps, selectedApp, onAppChange,
  prompt, onPromptChange,
  reference, onReferenceChange,
  onGenerate,
}: GeneratePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onReferenceChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
      
      {/* Top bar с фильтрами */}
      <div className="flex items-center gap-4 px-8 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}>
        
        {/* App selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">App</span>
          <select
            value={selectedApp}
            onChange={e => onAppChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {apps.map(app => (
              <option key={app.code} value={app.code}>
                {app.code} — {app.name}
              </option>
            ))}
          </select>
        </div>

        {/* Место для будущих фильтров */}
        <div className="flex-1" />
        
        <span className="text-xs text-gray-600 font-mono">
          {apps.find(a => a.code === selectedApp)?.name}
        </span>
      </div>

      {/* Generate bar */}
      <div className="flex items-center gap-3 px-8 py-3">
        
        {/* Референс */}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        
        {reference ? (
          <div className="relative flex-shrink-0">
            <img src={reference} alt="ref" className="w-10 h-10 rounded-lg object-cover" />
            <button
              onClick={() => onReferenceChange(null)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
            >×</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
            title="Upload reference"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
        )}

        {/* Промпт */}
        <input
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder="Describe what to generate... or just upload a reference"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          onKeyDown={e => e.key === 'Enter' && onGenerate()}
        />

        {/* Generate button */}
        <button
          onClick={onGenerate}
          className="flex-shrink-0 flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{ background: 'var(--accent)' }}
        >
          <span>✦</span>
          Generate
        </button>
      </div>
    </div>
  )
}
