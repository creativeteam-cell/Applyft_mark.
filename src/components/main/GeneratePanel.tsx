'use client'

import { useRef, useState, useEffect, useReducer } from 'react'
import { HighlightTextarea } from './HighlightTextarea'

// Shrink a base64 data URL to max 1024px on the longest side (JPEG 80%).
// Reduces payload from ~3MB (2K PNG) to ~150-300KB before sending to the API.
function shrinkImage(dataUrl: string, maxPx = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => resolve(dataUrl) // fallback
    img.src = dataUrl
  })
}

export interface Asset {
  name: string
  base64: string
}

type AssetsAction =
  | { type: 'confirm'; name: string; base64: string }
  | { type: 'remove'; name: string }

function assetsReducer(state: Asset[], action: AssetsAction): Asset[] {
  if (action.type === 'confirm') {
    return [...state.filter(a => a.name !== action.name), { name: action.name, base64: action.base64 }]
  }
  if (action.type === 'remove') {
    return state.filter(a => a.name !== action.name)
  }
  return state
}

interface GeneratePanelProps {
  prompt: string
  onPromptChange: (v: string) => void
  reference: string | null
  onReferenceChange: (v: string | null) => void
  mode: 'new' | 'var'
  onModeChange: (mode: 'new' | 'var') => void
  varNumber: string
  onVarNumberChange: (v: string) => void
  onVarLettersChange: (letters: string[]) => void
  lettersFetchKey?: number
  onGenerate: () => void
  onOpenDraft: () => void
  appCode: string
  availableLogos: string[]
  selectedLogo: string | null
  onLogoChange: (logo: string | null) => void
  assets: Asset[]
  onAssetsChange: (assets: Asset[]) => void
}

export function GeneratePanel({
  prompt, onPromptChange,
  reference, onReferenceChange,
  mode, onModeChange,
  varNumber, onVarNumberChange,
  onVarLettersChange,
  lettersFetchKey,
  onGenerate,
  onOpenDraft,
  appCode,
  availableLogos,
  selectedLogo,
  onLogoChange,
  assets: assetsProp,
  onAssetsChange,
}: GeneratePanelProps) {
  // useReducer guarantees reducer always receives latest state — no stale closures
  const [assets, dispatchAssets] = useReducer(assetsReducer, [])
  const onAssetsChangeRef = useRef(onAssetsChange)
  useEffect(() => { onAssetsChangeRef.current = onAssetsChange })
  const prevAssetsRef = useRef(assets)
  useEffect(() => {
    if (prevAssetsRef.current !== assets) {
      prevAssetsRef.current = assets
      onAssetsChangeRef.current(assets)
    }
  }, [assets])

  const [logoOpen, setLogoOpen] = useState(false)
  const [promptBorder, setPromptBorder] = useState('var(--border)')
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState('')
  const [describing, setDescribing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const assetFileRef = useRef<HTMLInputElement>(null)
  const [pendingAssetBase64, setPendingAssetBase64] = useState<string | null>(null)
  const [assetNameInput, setAssetNameInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')
  const urlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-computed next variant
  const [nextVarName, setNextVarName] = useState('')
  const [lettersLoading, setLettersLoading] = useState(false)
  const [lettersError, setLettersError] = useState('')
  const lettersDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (mode !== 'var' || !varNumber.trim() || !appCode) {
      setNextVarName('')
      setLettersError('')
      onVarLettersChange([])
      return
    }

    if (lettersDebounceRef.current) clearTimeout(lettersDebounceRef.current)

    lettersDebounceRef.current = setTimeout(async () => {
      setLettersLoading(true)
      setLettersError('')
      try {
        const res = await fetch(`/api/drive/next-letters?app=${appCode}&varNumber=${varNumber}`)
        const data = await res.json()
        if (data.error) {
          setLettersError('error')
          setNextVarName('')
        } else {
          setNextVarName(data.variantFolderName)
          onVarLettersChange(data.letters)
        }
      } catch {
        setLettersError('error')
        setNextVarName('')
      } finally {
        setLettersLoading(false)
      }
    }, 400)

    return () => {
      if (lettersDebounceRef.current) clearTimeout(lettersDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, varNumber, appCode, lettersFetchKey])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onReferenceChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleAssetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPendingAssetBase64(reader.result as string)
      // Auto-suggest name from filename (without extension, slugified)
      const suggested = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40)
      setAssetNameInput(suggested)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function confirmAsset() {
    const name = assetNameInput.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
    if (!name || !pendingAssetBase64) return
    dispatchAssets({ type: 'confirm', name, base64: pendingAssetBase64 })
    setPendingAssetBase64(null)
    setAssetNameInput('')
  }

  function removeAsset(name: string) {
    dispatchAssets({ type: 'remove', name })
  }

  async function handleEnhancePrompt() {
    setEnhancing(true)
    setEnhanceError('')
    try {
      // Shrink images client-side before sending — 2K PNG = ~3MB base64,
      // Vercel's request body limit is 4.5MB total. Shrink to 1024px first.
      const [refSmall, ...assetsSmall] = await Promise.all([
        reference ? shrinkImage(reference) : Promise.resolve(undefined),
        ...assets.map(a => shrinkImage(a.base64).then(b64 => ({ name: a.name, base64: b64 }))),
      ])
      const res = await fetch('/api/generator/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          referenceBase64: refSmall || undefined,
          assets: assetsSmall,
        }),
      })
      const data = await res.json()
      if (data.enhanced) {
        onPromptChange(data.enhanced)
      } else {
        setEnhanceError(data.error || 'No response')
        setTimeout(() => setEnhanceError(''), 5000)
      }
    } catch (e: any) {
      console.error('[enhance]', e)
      setEnhanceError(e.message || 'Network error')
      setTimeout(() => setEnhanceError(''), 5000)
    }
    setEnhancing(false)
  }

  async function handleMakePrompt() {
    if (!reference) return
    setDescribing(true)
    try {
      const res = await fetch('/api/generator/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: reference }),
      })
      const contentType = res.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await res.json() : { error: await res.text() }
      if (data.description) onPromptChange(data.description)
    } catch (e: any) {
      console.error('[describe]', e)
    }
    setDescribing(false)
  }

  async function handleUrlFetch(url: string) {
    if (!url.trim()) return
    setUrlLoading(true)
    setUrlError('')
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
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

  function handleNumberChange(value: string) {
    const num = value.replace(/\D/g, '').slice(0, 3)
    onVarNumberChange(num)
  }

  const generateDisabled = mode === 'var' && (!varNumber.trim() || lettersLoading || !!lettersError)

  return (
    <div className="fixed left-0 right-0 z-40 border-b px-8 py-4"
      style={{ top: '104px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <input ref={assetFileRef} type="file" accept="image/*" onChange={handleAssetFile} className="hidden" />

      <div className="flex gap-4">

        {/* Левая колонка — референс */}
        <div className="flex flex-col gap-2" style={{ width: 160 }}>
          {reference ? (
            <div className="flex flex-col gap-1.5">
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
              <button
                onClick={handleMakePrompt}
                disabled={describing}
                title="GPT-4o analyzes the image and writes a detailed generation prompt"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {describing ? (
                  <><svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>Reading...</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>Make prompt</>
                )}
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

          <div className="relative">
            <input
              value={urlInput}
              onChange={e => {
                const val = e.target.value
                setUrlInput(val)
                setUrlError('')
                if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current)
                if (val.trim()) {
                  urlDebounceRef.current = setTimeout(() => handleUrlFetch(val), 600)
                }
              }}
              onPaste={e => {
                const val = e.clipboardData.getData('text')
                if (val.trim()) {
                  if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current)
                  urlDebounceRef.current = setTimeout(() => handleUrlFetch(val), 100)
                }
              }}
              placeholder="Paste a link..."
              className="w-full px-3 py-2 rounded-xl text-xs outline-none pr-7"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${urlError ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`,
                color: 'var(--text)',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = urlError ? 'rgba(248,113,113,0.5)' : 'var(--border)'}
            />
            {urlLoading && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 animate-spin">⟳</span>
            )}
            {urlError && (
              <div className="absolute left-0 -bottom-4 text-xs text-red-400 whitespace-nowrap">{urlError}</div>
            )}
          </div>
        </div>

        {/* Правая колонка */}
        <div className="flex-1 flex flex-col gap-2">

          {/* Prompt with highlight */}
          <div className="relative">
            <button
              onClick={handleEnhancePrompt}
              disabled={enhancing}
              title="GPT reads your prompt + images and rewrites it for Gemini"
              className="absolute right-2 top-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: enhanceError ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${enhanceError ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`,
                color: enhanceError ? '#f87171' : 'var(--text-muted)',
              }}
            >
              {enhancing ? (
                <><svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>Enhancing...</>
              ) : enhanceError ? (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>{enhanceError.length > 30 ? 'Error — retry?' : enhanceError}</>
              ) : (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>Enhance</>
              )}
            </button>
          <HighlightTextarea
            value={prompt}
            onChange={onPromptChange}
            assets={assets}
            placeholder="Describe what to generate... use @assetname to reference uploaded assets"
            rows={4}
            borderColor={promptBorder}
            onFocus={() => setPromptBorder('var(--accent)')}
            onBlur={() => setPromptBorder('var(--border)')}
            onKeyDown={e => e.key === 'Enter' && e.metaKey && onGenerate()}
          />
          </div>

          {/* Assets row */}
          <div className="flex items-center gap-2 flex-wrap min-h-[28px]">
            {/* Existing assets */}
            {assets.map(asset => (
              <div key={asset.name}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid var(--accent)' }}>
                <img src={asset.base64} alt={asset.name}
                  className="w-5 h-5 rounded object-cover" />
                <span style={{ color: 'var(--accent)' }}>@{asset.name}</span>
                <button onClick={() => removeAsset(asset.name)}
                  className="text-gray-500 hover:text-red-400 transition-colors leading-none ml-0.5">
                  ×
                </button>
              </div>
            ))}

            {/* Pending asset — name input */}
            {pendingAssetBase64 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <img src={pendingAssetBase64} alt="pending"
                  className="w-5 h-5 rounded object-cover" />
                <span className="text-xs text-gray-500">@</span>
                <input
                  value={assetNameInput}
                  onChange={e => setAssetNameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())}
                  onKeyDown={e => { if (e.key === 'Enter') confirmAsset(); if (e.key === 'Escape') { setPendingAssetBase64(null); setAssetNameInput('') } }}
                  placeholder="name"
                  autoFocus
                  maxLength={40}
                  className="w-28 text-xs font-mono outline-none bg-transparent"
                  style={{ color: 'var(--text)' }}
                />
                <button onClick={confirmAsset}
                  disabled={!assetNameInput.trim()}
                  className="text-xs px-2 py-0.5 rounded disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
                  Add
                </button>
                <button onClick={() => { setPendingAssetBase64(null); setAssetNameInput('') }}
                  className="text-gray-500 hover:text-red-400 transition-colors text-xs">
                  ✕
                </button>
              </div>
            )}

            {/* Add asset button */}
            {!pendingAssetBase64 && (
              <button
                onClick={() => assetFileRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition-colors"
                style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
                title="Upload an asset image and reference it in your prompt with @name">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add asset
              </button>
            )}
          </div>

          {/* New / Var toggle + buttons */}
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

            {mode === 'var' && (
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1 uppercase tracking-widest font-mono">Number</span>
                  <input
                    value={varNumber}
                    onChange={e => handleNumberChange(e.target.value)}
                    placeholder="001"
                    maxLength={3}
                    className="w-16 px-3 py-2 rounded-xl text-sm outline-none text-center font-mono"
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${!varNumber ? 'rgba(248,113,113,0.6)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                  />
                </div>

                <div className="flex flex-col justify-end pb-0.5">
                  <span className="text-xs text-gray-500 mb-1 uppercase tracking-widest font-mono">Next variant</span>
                  <span className="text-sm font-mono" style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                    {!varNumber
                      ? <span className="text-red-400 text-xs">enter number</span>
                      : lettersLoading
                        ? <span className="text-gray-500 text-xs animate-pulse">computing…</span>
                        : lettersError
                          ? <span className="text-red-400 text-xs">error</span>
                          : <span style={{ color: 'var(--accent)' }}>{nextVarName}</span>
                    }
                  </span>
                </div>
              </div>
            )}

            <div className="flex-1 flex items-center justify-end gap-3">
              {availableLogos.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogoOpen(v => !v)}
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

              <button
                onClick={onOpenDraft}
                disabled={generateDisabled}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span>📋</span>
                From Draft
              </button>
              <button
                onClick={onGenerate}
                disabled={generateDisabled}
                className="flex items-center gap-2 px-6 py-2 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-40"
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
