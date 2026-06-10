'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface GenerateModalProps {
  appCode: string
  selectedPain: string
  selectedHook: string
  selectedConcept: string
  prompt: string
  reference: string | null
  competitor: string | null
  logoBase64: string | null
  marketerCode: string
  mode: 'new' | 'var'
  varNumber: string
  varLetters: string[]
  onClose: () => void
  onSaved?: () => void
}

async function compressImage(base64: string, maxWidth = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = base64
  })
}

type Stage = 'generating' | 'preview' | 'fixing' | 'generating-all' | 'done'

const SIZES = ['4x5', '1x1', '9x16', '1.91x1']
const MAX_HISTORY = 10

export function GenerateModal({ appCode, selectedPain, selectedHook, selectedConcept, prompt, reference, competitor, logoBase64, marketerCode, mode, varNumber, varLetters, onClose, onSaved }: GenerateModalProps) {
  const [stage, setStage] = useState<Stage>('generating')
  const [fixHistory, setFixHistory] = useState<string[]>([])
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  const [currentFixIndex, setCurrentFixIndex] = useState(0)

  // allImages: base set from handleApprove (kept for fallback)
  const [allImages, setAllImages] = useState<Record<string, string>>({})
  // sizeHistories: each fix run appends a new version per size
  const [sizeHistories, setSizeHistories] = useState<Record<string, string[]>>({})
  // sizeIndexes: currently selected version index per size
  const [sizeIndexes, setSizeIndexes] = useState<Record<string, number>>({})
  // hover zoom
  const [hoveredSize, setHoveredSize] = useState<string | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)

  const [fixNote, setFixNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFolder, setSavedFolder] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [nextFolderName, setNextFolderName] = useState<string | null>(null)

  // Per-size fix on done screen
  const [fixingSize, setFixingSize] = useState<string | null>(null)
  const [sizeFixNote, setSizeFixNote] = useState('')
  const [sizeFixLoading, setSizeFixLoading] = useState<string | null>(null)

  const previewImage = fixHistory[currentFixIndex] || null
  const currentPrompt = promptHistory[currentFixIndex] || null

  useEffect(() => {
    generateFirst()
  }, [])

  // Returns the currently selected image for a size (from history, fallback to allImages)
  function getSizeImage(size: string): string {
    const hist = sizeHistories[size]
    if (hist && hist.length > 0) return hist[sizeIndexes[size] ?? hist.length - 1] || ''
    return allImages[size] || ''
  }

  // Effective images for save/download — respects navigation through history
  function getEffectiveImages(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const size of SIZES) {
      result[size] = getSizeImage(size)
    }
    return result
  }

  async function generateFirst(fix?: string, prevImage?: string, customPrompt?: string) {
    setStage('generating')
    setError(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appCode,
          selectedPain,
          selectedHook: selectedHook !== 'none' ? selectedHook : undefined,
          userText: prompt,
          referenceBase64: reference,
          fixNote: fix,
          previousImageBase64: prevImage,
          customPrompt: customPrompt,
          logoBase64: logoBase64 || undefined,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setStage('preview')
        return
      }

      let finalImage = data.imageBase64
      try {
        const resizeRes = await fetch('/api/resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: data.imageBase64, size: '4x5' }),
        })
        const resizeData = await resizeRes.json()
        if (resizeData.imageBase64) finalImage = resizeData.imageBase64
      } catch { }

      const savedPrompt = data.prompt || customPrompt || ''

      if (!fix && !customPrompt) {
        setFixHistory([finalImage])
        setPromptHistory([savedPrompt])
        setCurrentFixIndex(0)
      } else {
        setFixHistory(prev => {
          const newHistory = [...prev, finalImage].slice(-MAX_HISTORY)
          setCurrentFixIndex(newHistory.length - 1)
          return newHistory
        })
        setPromptHistory(prev => [...prev, savedPrompt].slice(-MAX_HISTORY))
      }

      setStage('preview')
    } catch (e: any) {
      setError(e.message)
      setStage('preview')
    }
  }

  async function handleRecreate() {
    await generateFirst(undefined, undefined, currentPrompt || undefined)
  }

  async function handleApprove() {
    if (!previewImage) return
    setStage('generating-all')

    try {
      const results: Record<string, string> = { '4x5': previewImage }
      const compressedPreview = await compressImage(previewImage, 1200)

      async function recomposeSize(size: string): Promise<void> {
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recomposeBase64: compressedPreview, targetSize: size }),
          })
          const data = await res.json()
          if (!data.error && data.imageBase64) {
            try {
              const resizeRes = await fetch('/api/resize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: data.imageBase64, size }),
              })
              const resizeData = await resizeRes.json()
              results[size] = resizeData.imageBase64 || data.imageBase64
            } catch {
              results[size] = data.imageBase64
            }
          }
        } catch (e) {
          console.error(`Recompose failed for ${size}:`, e)
        }
      }

      await Promise.all(['1x1', '9x16', '1.91x1'].map(recomposeSize))

      setAllImages(results)

      // Initialize per-size histories
      const histories: Record<string, string[]> = {}
      const indexes: Record<string, number> = {}
      for (const [size, img] of Object.entries(results)) {
        histories[size] = [img]
        indexes[size] = 0
      }
      setSizeHistories(histories)
      setSizeIndexes(indexes)

      setFixHistory([])
      setStage('done')

      if (mode === 'new') {
        fetch(`/api/drive/next-number?app=${appCode}`)
          .then(r => r.json())
          .then(d => { if (d.nextName) setNextFolderName(d.nextName) })
          .catch(() => {})
      }
    } catch (e: any) {
      setError(e.message)
      setStage('preview')
    }
  }

  async function handleSubmitFix() {
    const baseImage = fixHistory[currentFixIndex]
    const compressed = baseImage ? await compressImage(baseImage) : undefined
    await generateFirst(fixNote, compressed)
    setFixNote('')
  }

  async function handleSaveToDrive() {
    setSaving(true)
    setSaveError(null)
    try {
      const effectiveImages = getEffectiveImages()
      const compressedImages: Record<string, string> = {}
      await Promise.all(
        Object.entries(effectiveImages).map(async ([size, base64]) => {
          if (base64) compressedImages[size] = await compressImage(base64, 1200)
        })
      )

      const res = await fetch('/api/drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appCode,
          marketerCode,
          images: compressedImages,
          mode,
          varNumber: mode === 'var' ? varNumber : undefined,
          varLetters: mode === 'var' ? varLetters : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSavedFolder(data.folderName)
      onSaved?.()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSizeFix(size: string) {
    if (!sizeFixNote.trim()) return
    setSizeFixLoading(size)
    setFixingSize(null)

    try {
      const currentImage = getSizeImage(size)
      const compressed = await compressImage(currentImage, 1200)

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appCode,
          selectedPain,
          selectedHook: selectedHook !== 'none' ? selectedHook : undefined,
          userText: prompt,
          fixNote: sizeFixNote,
          previousImageBase64: compressed,
          logoBase64: logoBase64 || undefined,
          targetSize: size,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      let finalImage = data.imageBase64
      try {
        const resizeRes = await fetch('/api/resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: data.imageBase64, size }),
        })
        const resizeData = await resizeRes.json()
        if (resizeData.imageBase64) finalImage = resizeData.imageBase64
      } catch {}

      // Append to size history, select latest
      setSizeHistories(prev => {
        const newHist = [...(prev[size] || []), finalImage]
        setSizeIndexes(idx => ({ ...idx, [size]: newHist.length - 1 }))
        return { ...prev, [size]: newHist }
      })

      setSizeFixNote('')
    } catch (e: any) {
      console.error(`Size fix failed for ${size}:`, e.message)
    } finally {
      setSizeFixLoading(null)
    }
  }

  function navigateSizeHistory(size: string, dir: -1 | 1) {
    setSizeIndexes(prev => {
      const hist = sizeHistories[size] || []
      const current = prev[size] ?? 0
      return { ...prev, [size]: Math.max(0, Math.min(hist.length - 1, current + dir)) }
    })
  }

  function getFileName(size: string): string {
    if (savedFolder) return `${savedFolder}_${size}_${marketerCode}_EN.jpg`
    if (mode === 'var' && varNumber) {
      const letters = varLetters.filter(Boolean)
      const variantName = `${appCode}_S_${String(varNumber).padStart(3, '0')}_${letters.join('_')}`
      return `${variantName}_${size}_${marketerCode}_EN.jpg`
    }
    const folder = nextFolderName || `${appCode}_S_???`
    return `${folder}_${size}_${marketerCode}_EN.jpg`
  }

  function downloadAll() {
    const effective = getEffectiveImages()
    Object.entries(effective).forEach(([size, base64], i) => {
      if (!base64) return
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = base64
        link.download = getFileName(size)
        link.click()
      }, i * 200)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        {stage !== 'generating' && stage !== 'generating-all' && (
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-white"
            style={{ background: 'var(--border)' }}>×</button>
        )}

        {/* Generating */}
        {(stage === 'generating' || stage === 'generating-all') && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-spin inline-block">⟳</div>
            <div className="text-lg font-semibold mb-2">
              {stage === 'generating-all' ? 'Recomposing for all sizes...' : 'Generating creative...'}
            </div>
            <div className="text-sm text-gray-500">
              {stage === 'generating-all'
                ? 'Adapting layout for 1×1, 9×16, 1.91×1'
                : 'Building prompt & creating 4×5 preview'}
            </div>
          </div>
        )}

        {/* Preview */}
        {stage === 'preview' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Preview — 4×5</h3>
              {fixHistory.length > 1 && (
                <span className="text-xs text-gray-500 font-mono">
                  {currentFixIndex + 1} / {fixHistory.length}
                </span>
              )}
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                {error}
              </div>
            )}

            {fixHistory.length > 0 && (
              <div className="relative mb-6" style={{ overflow: 'visible' }}>
                {fixHistory.map((img, i) => {
                  const offset = i - currentFixIndex
                  const isActive = offset === 0
                  const isVisible = Math.abs(offset) <= 1
                  return (
                    <div
                      key={i}
                      onClick={() => !isActive && setCurrentFixIndex(i)}
                      className="transition-all duration-300"
                      style={{
                        position: isActive ? 'relative' : 'absolute',
                        top: 0,
                        left: '50%',
                        transform: isActive
                          ? 'none'
                          : `translateX(calc(-50% + ${offset * 260}px)) scale(0.78)`,
                        opacity: isVisible ? (isActive ? 1 : 0.35) : 0,
                        zIndex: isActive ? 2 : 1,
                        cursor: isActive ? 'default' : 'pointer',
                        width: isActive ? '100%' : 'auto',
                        marginLeft: isActive ? 0 : undefined,
                      }}>
                      <img src={img} alt={`v${i + 1}`}
                        className="rounded-xl shadow-2xl"
                        style={{
                          width: isActive ? '100%' : 'auto',
                          height: isActive ? 'auto' : 310,
                          aspectRatio: '4/5',
                          display: 'block',
                          objectFit: 'contain',
                        }} />
                      {!isActive && isVisible && (
                        <div className="absolute inset-0 rounded-xl"
                          style={{ background: 'rgba(0,0,0,0.3)' }} />
                      )}
                    </div>
                  )
                })}

                {currentFixIndex > 0 && (
                  <button
                    onClick={() => setCurrentFixIndex(i => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    ←
                  </button>
                )}
                {currentFixIndex < fixHistory.length - 1 && (
                  <button
                    onClick={() => setCurrentFixIndex(i => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    →
                  </button>
                )}
              </div>
            )}

            {!error && previewImage && (
              <div>
                <div className="flex gap-3 justify-center mb-3">
                  <button onClick={handleApprove}
                    className="px-8 py-3 rounded-xl font-semibold"
                    style={{ background: 'var(--accent)' }}>✓ Approve</button>
                  <button onClick={() => setStage('fixing')}
                    className="px-8 py-3 rounded-xl font-semibold"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>✎ Fix</button>
                  <button onClick={handleRecreate}
                    className="px-8 py-3 rounded-xl font-semibold"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>↺ Recreate</button>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => {
                    const link = document.createElement('a')
                    link.href = previewImage!
                    link.download = `${appCode}_preview_4x5.png`
                    link.click()
                  }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-all flex items-center gap-1.5 px-4 py-2 rounded-lg"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    ⬇ Download preview
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center">
                <button onClick={onClose} className="px-8 py-3 rounded-xl font-semibold"
                  style={{ background: 'var(--border)' }}>Close</button>
              </div>
            )}
          </div>
        )}

        {/* Fix */}
        {stage === 'fixing' && (
          <div>
            <h3 className="text-lg font-bold mb-2">What to fix?</h3>
            <p className="text-xs text-gray-500 mb-4">
              Fixing version {currentFixIndex + 1} — the rest will stay the same
            </p>
            {previewImage && (
              <div className="flex justify-center mb-4">
                <img src={previewImage} alt="preview" className="rounded-xl object-cover opacity-70"
                  style={{ maxHeight: 180, aspectRatio: '4/5' }} />
              </div>
            )}
            <textarea
              value={fixNote}
              onChange={e => setFixNote(e.target.value)}
              placeholder="e.g. Make the text bigger, change background to dark blue... (any language)"
              rows={3}
              className="w-full rounded-xl p-4 text-sm outline-none resize-none mb-4"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleSubmitFix} disabled={!fixNote.trim()}
                className="flex-1 py-3 rounded-xl font-semibold disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                Regenerate with fix
              </button>
              <button onClick={() => setStage('preview')}
                className="px-6 py-3 rounded-xl"
                style={{ background: 'var(--border)' }}>Back</button>
            </div>
          </div>
        )}

        {/* Done */}
        {stage === 'done' && (
          <div>
            <h3 className="text-lg font-bold mb-6">All sizes ready! 🎉</h3>

            {/* Size grid — overflow visible so hover zoom isn't clipped */}
            <div className="grid grid-cols-4 gap-3 mb-3" style={{ overflow: 'visible' }}>
              {SIZES.map(size => {
                const img = getSizeImage(size)
                const hist = sizeHistories[size] || []
                const currentIdx = sizeIndexes[size] ?? 0
                const hasHistory = hist.length > 1
                return (
                  <div
                    key={size}
                    className="relative"
                    style={{ overflow: 'visible' }}
                    onMouseEnter={e => {
                      if (img) {
                        setHoveredSize(size)
                        setHoverRect(e.currentTarget.getBoundingClientRect())
                      }
                    }}
                    onMouseLeave={() => { setHoveredSize(null); setHoverRect(null) }}>

                    {/* Label row */}
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <span className="text-xs font-mono text-gray-500">{size}</span>
                      <button
                        onClick={() => { setFixingSize(fixingSize === size ? null : size); setSizeFixNote('') }}
                        title={`Fix ${size}`}
                        className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                        style={{
                          color: fixingSize === size ? 'var(--accent)' : 'var(--text-muted, #6b7280)',
                          fontSize: 11,
                          opacity: sizeFixLoading ? 0.4 : 1,
                        }}
                        disabled={!!sizeFixLoading}>
                        ✎
                      </button>
                    </div>

                    {/* Card — overflow-hidden clips image only */}
                    <div
                      className="rounded-lg overflow-hidden cursor-default"
                      style={{
                        border: `1px solid ${fixingSize === size ? 'var(--accent)' : 'var(--border)'}`,
                        aspectRatio: sizeToRatio(size),
                        transition: 'border-color 0.2s',
                        position: 'relative',
                      }}>

                      {sizeFixLoading === size ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <span className="animate-spin text-xl">⟳</span>
                        </div>
                      ) : img ? (
                        <img src={img} alt={size} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <span className="text-gray-600 text-xs">—</span>
                        </div>
                      )}
                    </div>

                    {/* History navigation */}
                    {hasHistory && (
                      <div className="flex items-center justify-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => navigateSizeHistory(size, -1)}
                          disabled={currentIdx === 0}
                          className="w-5 h-5 rounded text-xs flex items-center justify-center disabled:opacity-30 transition-opacity"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                          ←
                        </button>
                        <span className="text-xs font-mono" style={{ color: 'var(--accent)', minWidth: 28, textAlign: 'center' }}>
                          {currentIdx + 1}/{hist.length}
                        </span>
                        <button
                          onClick={() => navigateSizeHistory(size, 1)}
                          disabled={currentIdx === hist.length - 1}
                          className="w-5 h-5 rounded text-xs flex items-center justify-center disabled:opacity-30 transition-opacity"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                          →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Per-size fix input */}
            {fixingSize && (
              <div className="mb-4 px-3 py-3 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}>
                <div className="text-xs font-mono mb-2" style={{ color: 'var(--accent)' }}>
                  Fix {fixingSize}
                </div>
                <div className="flex gap-2">
                  <input
                    value={sizeFixNote}
                    onChange={e => setSizeFixNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSizeFix(fixingSize)}
                    placeholder="e.g. text too close to edge, change background color..."
                    autoFocus
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => handleSizeFix(fixingSize)}
                    disabled={!sizeFixNote.trim()}
                    className="px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    Fix
                  </button>
                  <button
                    onClick={() => { setFixingSize(null); setSizeFixNote('') }}
                    className="px-3 py-2 rounded-xl text-sm"
                    style={{ background: 'var(--border)' }}>
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3 mb-3">
              <button onClick={downloadAll}
                className="flex-1 py-3 rounded-xl font-semibold"
                style={{ background: 'var(--accent)' }}>⬇ Download all 4</button>
              <button
                onClick={handleSaveToDrive}
                disabled={saving || !!savedFolder}
                className="flex-1 py-3 rounded-xl font-semibold disabled:opacity-60"
                style={{ background: savedFolder ? '#16a34a' : 'var(--surface)', border: '1px solid var(--border)' }}>
                {saving ? '⟳ Saving...' : savedFolder ? `✓ Saved: ${savedFolder}` : '☁ Save to Drive'}
              </button>
              <button onClick={onClose} className="px-6 py-3 rounded-xl"
                style={{ background: 'var(--border)' }}>Close</button>
            </div>
            {saveError && (
              <div className="text-red-400 text-xs text-center">{saveError}</div>
            )}
          </div>
        )}
      </div>

      {/* Hover zoom portal — renders in document.body, bypasses all overflow/stacking context */}
      {hoveredSize && hoverRect && typeof window !== 'undefined' && (() => {
        const zoomImg = getSizeImage(hoveredSize)
        if (!zoomImg) return null
        const cx = hoverRect.left + hoverRect.width / 2
        const cy = hoverRect.top + hoverRect.height / 2
        const zoomWidths: Record<string, number> = {
          '4x5': 380, '1x1': 380, '9x16': 300, '1.91x1': 560,
        }
        const zoomWidth = zoomWidths[hoveredSize] || 380
        return createPortal(
          <>
            <style>{`
              @keyframes hoverZoomIn {
                from { opacity: 0; transform: translate(-50%, -50%) scale(0.72); }
                to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              }
            `}</style>
            <div
              className="pointer-events-none"
              style={{
                position: 'fixed',
                top: cy,
                left: cx,
                transform: 'translate(-50%, -50%)',
                width: zoomWidth,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 24px 80px rgba(0,0,0,0.95)',
                border: '2px solid rgba(255,255,255,0.18)',
                zIndex: 9999,
                animation: 'hoverZoomIn 0.25s cubic-bezier(0.22, 1.08, 0.36, 1) forwards',
              }}>
              <img src={zoomImg} alt={hoveredSize + ' zoom'} style={{ width: '100%', display: 'block' }} />
            </div>
          </>,
          document.body
        )
      })()}
    </div>
  )
}

function sizeToRatio(size: string): string {
  const map: Record<string, string> = {
    '1x1': '1/1', '4x5': '4/5', '1.91x1': '1.91/1', '9x16': '9/16',
  }
  return map[size] || '1/1'
}
