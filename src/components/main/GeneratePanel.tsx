'use client'

import { useRef, useState } from 'react'

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
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onReferenceChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleUrlFetch() {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    setUrlError('')
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setUrlError(data.error)
      } else {
        onReferenceChange(data.imageBase64)
        setUrlInput('')
      }
    } catch {
      setUrlError('Failed to fetch')
    } finally {
      setUrlLoading(false)
    }
  }

  return (
    <div className="fixed left-0 right-0 z-39 border-b px-8 py-4"
      style={{ top: '104px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      <div className="flex gap-4">

        {/* Левая колонка — референс */}
        <div className="flex flex-col gap-2" style={{ width: 160 }}>

          {reference ? (
            <div className="relative">
              <img src={reference} alt="reference"
                className="w-full rounded-xl object-cover cursor-pointer"
                style={{ height: 100 }}
                onClick={() => fileRef.current?.click()} />
              <button onClick={() => onReferenceChange(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-lg">
                ×
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all"
              style={{ height: 100, background: 'var(--surface)', border: '1.5px dashed var(--border)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span className="text-xs text-gray-500">Upload reference</span>
            </button>
          )}

          {/* URL + кнопка Fetch */}
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              <input
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError('') }}
                placeholder="Paste a link..."
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${urlError ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`,
                  color: 'var(--text)',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = urlError ? 'rgba(248,113,113,0.5)' : 'var(--border)'}
                onKeyDown={e => e.key === 'Enter' && handleUrlFetch()}
              />
              {urlError && (
                <div className="absolute left-0 -bottom-4 text-xs text-red-400 whitespace-nowrap">{urlError}</div>
              )}
            </div>
            <button
              onClick={handleUrlFetch}
              disabled={!urlInput.trim() || urlLoading}
              className="px-2 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex-shrink-0"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {urlLoading ? '⟳' : '↓'}
            </button>
          </div>

        </div>

        {/* Правая колонка — промпт + генерация */}
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            placeholder="Describe what to generate... (optional)"
            rows={4}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none leading-relaxed"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            onKeyDown={e => e.key === 'Enter' && e.metaKey && onGenerate()}
          />
          <div className="flex justify-end">
            <button onClick={onGenerate}
              className="flex items-center gap-2 px-6 py-2 rounded-xl font-semibold text-sm"
              style={{ background: 'var(--accent)' }}>
              <span>✦</span>
              Generate
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
