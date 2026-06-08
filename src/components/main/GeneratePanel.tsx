'use client'

import { useRef, useState } from 'react'

interface GeneratePanelProps {
  prompt: string
  onPromptChange: (v: string) => void
  reference: string | null
  onReferenceChange: (v: string | null) => void
  mode: 'new' | 'var'
  onModeChange: (mode: 'new' | 'var') => void
  varNumber: string
  onVarNumberChange: (v: string) => void
  varLetters: [string, string, string]
  onVarLettersChange: (letters: [string, string, string]) => void
  onGenerate: () => void
  appCode: string
  availableLogos: string[]
  selectedLogo: string | null
  onLogoChange: (logo: string | null) => void
}

export function GeneratePanel({
  prompt, onPromptChange,
  reference, onReferenceChange,
  mode, onModeChange,
  varNumber, onVarNumberChange,
  varLetters, onVarLettersChange,
  onGenerate,
  appCode,
  availableLogos,
  selectedLogo,
  onLogoChange,
}: GeneratePanelProps) {
  const [logoOpen, setLogoOpen] = useState(false)
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

  function handleLetterChange(index: number, value: string) {
    const letter = value.replace(/[^a-z]/g, '').slice(-1)
    const newLetters = [...varLetters] as [string, string, string]
    newLetters[index] = letter
    onVarLettersChange(newLetters)
  }

  function handleNumberChange(value: string) {
    const num = value.replace(/\D/g, '').slice(0, 3)
    onVarNumberChange(num)
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
            <button onClick={handleUrlFetch} disabled={!urlInput.trim() || urlLoading}
              className="px-2 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex-shrink-0"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {urlLoading ? '⟳' : '↓'}
            </button>
          </div>
        </div>

        {/* Правая колонка */}
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

          {/* New / Var toggle */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl overflow-hidden text-sm font-semibold"
              style={{ border: '1px solid var(--accent)' }}>
              <button
                onClick={() => onModeChange('new')}
                className="px-5 py-2 transition-all"
                style={{
                  background: mode === 'new' ? 'var(--accent)' : 'transparent',
                  color: mode === 'new' ? '#fff' : 'var(--accent)',
                }}>
                New
              </button>
              <button
                onClick={() => onModeChange('var')}
                className="px-5 py-2 transition-all"
                style={{
                  background: mode === 'var' ? 'var(--accent)' : 'transparent',
                  color: mode === 'var' ? '#fff' : 'var(--accent)',
                }}>
                Var
              </button>
            </div>

            {/* Var поля */}
            {mode === 'var' && (
              <div className="flex items-center gap-2">
                {/* NUMBER */}
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1 uppercase tracking-widest font-mono">Number</span>
                  <input
                    value={varNumber}
                    onChange={e => handleNumberChange(e.target.value)}
                    placeholder="001"
                    maxLength={3}
                    className="w-16 px-3 py-2 rounded-xl text-sm outline-none text-center font-mono"
                    style={{ background: 'var(--surface)', border: `1px solid ${!varNumber ? 'rgba(248,113,113,0.6)' : 'var(--border)'}`, color: 'var(--text)' }}
                  />
                </div>

                {/* Letter boxes */}
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1 uppercase tracking-widest font-mono">Variant</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 text-sm">_</span>
                    {([0, 1, 2] as const).map(i => (
                      <input
                        key={i}
                        value={varLetters[i]}
                        onChange={e => handleLetterChange(i, e.target.value.toLowerCase())}
                        placeholder="a"
                        maxLength={1}
                        className="w-9 px-2 py-2 rounded-xl text-sm outline-none text-center font-mono"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                    ))}
                  </div>
                </div>

                {/* Preview названия */}
                <div className="flex flex-col justify-end pb-1">
                  <span className="text-xs text-gray-600 font-mono">
                    {varNumber
                      ? `${appCode}_${varNumber.padStart(3, '0')}${varLetters.filter(Boolean).map(l => `_${l}`).join('')}`
                      : <span className="text-red-400">enter number</span>}
                  </span>
                </div>
              </div>
            )}

            <div className="flex-1 flex items-center justify-end gap-3">

              {/* Logo switcher */}
              {availableLogos.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (logoOpen) { setLogoOpen(false) }
                      else { setLogoOpen(true) }
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{
                      background: selectedLogo ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                      border: `1px solid ${selectedLogo ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {selectedLogo
                      ? <img src={selectedLogo} alt="logo" className="w-5 h-5 object-contain" />
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    }
                    <span className="text-xs font-medium">{selectedLogo ? 'Logo on' : 'Logo'}</span>
                  </button>

                  {logoOpen && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <button
                        onClick={() => { onLogoChange(null); setLogoOpen(false) }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-gray-500 hover:text-red-400 transition-all"
                        style={{ background: selectedLogo === null ? 'var(--border)' : 'transparent' }}
                        title="No logo">
                        ✕
                      </button>
                      {availableLogos.map((logo, i) => (
                        <button key={i}
                          onClick={() => { onLogoChange(logo); setLogoOpen(false) }}
                          className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center transition-all"
                          style={{
                            background: 'var(--bg)',
                            border: `2px solid ${selectedLogo === logo ? 'var(--accent)' : 'transparent'}`,
                          }}>
                          <img src={logo} alt={`logo ${i + 1}`} className="w-full h-full object-contain p-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
    </div>
  )
}
