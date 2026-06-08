'use client'

import { useState, useEffect } from 'react'

interface GenerateModalProps {
  appCode: string
  selectedPain: string
  selectedHook: string
  selectedConcept: string
  prompt: string
  reference: string | null
  competitor: string | null
  logoBase64: string | null
  onClose: () => void
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

export function GenerateModal({ appCode, selectedPain, selectedHook, selectedConcept, prompt, reference, competitor, logoBase64, onClose }: GenerateModalProps) {
  const [stage, setStage] = useState<Stage>('generating')
  const [fixHistory, setFixHistory] = useState<string[]>([])
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  const [currentFixIndex, setCurrentFixIndex] = useState(0)
  const [allImages, setAllImages] = useState<Record<string, string>>({})
  const [fixNote, setFixNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const previewImage = fixHistory[currentFixIndex] || null
  const currentPrompt = promptHistory[currentFixIndex] || null

  useEffect(() => {
    generateFirst()
  }, [])

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

      // Добавляем в историю
      if (!fix && !customPrompt) {
        // Первая генерация — сбрасываем историю
        setFixHistory([finalImage])
        setPromptHistory([savedPrompt])
        setCurrentFixIndex(0)
      } else {
        // Fix или Recreate — добавляем в конец, сохраняя все версии
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

      async function recomposeSize(size: string): Promise<void> {
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recomposeBase64: previewImage, targetSize: size }),
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
      setFixHistory([])
      setStage('done')
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

  function downloadAll() {
    Object.entries(allImages).forEach(([size, base64], i) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = base64
        link.download = `${appCode}_${size.replace('/', 'x')}.png`
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

            {/* Карусель */}
            {fixHistory.length > 0 && (
              <div className="relative mb-6" style={{ height: 420, overflow: 'hidden' }}>
                {fixHistory.map((img, i) => {
                  const offset = i - currentFixIndex
                  const isActive = offset === 0
                  const isVisible = Math.abs(offset) <= 1
                  return (
                    <div
                      key={i}
                      onClick={() => !isActive && setCurrentFixIndex(i)}
                      className="absolute top-0 transition-all duration-300"
                      style={{
                        left: '50%',
                        transform: `translateX(calc(-50% + ${offset * 220}px)) scale(${isActive ? 1 : 0.78})`,
                        opacity: isVisible ? (isActive ? 1 : 0.35) : 0,
                        zIndex: isActive ? 2 : 1,
                        cursor: isActive ? 'default' : 'pointer',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                      <img src={img} alt={`v${i + 1}`}
                        className="rounded-xl object-cover shadow-2xl"
                        style={{ height: isActive ? 400 : 310, aspectRatio: '4/5' }} />
                      {!isActive && isVisible && (
                        <div className="absolute inset-0 rounded-xl"
                          style={{ background: 'rgba(0,0,0,0.3)' }} />
                      )}
                    </div>
                  )
                })}

                {/* Стрелки */}
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
            <div className="grid grid-cols-4 gap-3 mb-6">
              {SIZES.map(size => (
                <div key={size}>
                  <div className="text-xs font-mono text-gray-500 text-center mb-2">{size}</div>
                  <div className="rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--border)', aspectRatio: sizeToRatio(size) }}>
                    {allImages[size]
                      ? <img src={allImages[size]} alt={size} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <span className="text-gray-600 text-xs">—</span>
                        </div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={downloadAll}
                className="flex-1 py-3 rounded-xl font-semibold"
                style={{ background: 'var(--accent)' }}>⬇ Download all 4</button>
              <button onClick={onClose} className="px-6 py-3 rounded-xl"
                style={{ background: 'var(--border)' }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function sizeToRatio(size: string): string {
  const map: Record<string, string> = {
    '1x1': '1/1', '4x5': '4/5', '1.91x1': '1.91/1', '9x16': '9/16',
  }
  return map[size] || '1/1'
}
