'use client'

import { useRef } from 'react'

interface GeneratePanelProps {
  prompt: string
  onPromptChange: (v: string) => void
  reference: string | null
  onReferenceChange: (v: string | null) => void
  onGenerate: () => void
}

export function GeneratePanel({
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
    <div className="fixed left-0 right-0 z-39 border-b flex items-center gap-3 px-8 py-2.5"
      style={{ top: '104px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {reference ? (
        <div className="relative flex-shrink-0">
          <img src={reference} alt="ref" className="w-9 h-9 rounded-lg object-cover" />
          <button
            onClick={() => onReferenceChange(null)}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
          >×</button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
          title="Upload reference"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
      )}

      <input
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
        placeholder="Describe what to generate... or just upload a reference"
        className="flex-1 px-4 py-2 rounded-xl text-sm outline-none transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        onKeyDown={e => e.key === 'Enter' && onGenerate()}
      />

      <button
        onClick={onGenerate}
        className="flex-shrink-0 flex items-center gap-2 px-6 py-2 rounded-xl font-semibold text-sm transition-all"
        style={{ background: 'var(--accent)' }}
      >
        <span>✦</span>
        Generate
      </button>
    </div>
  )
}
