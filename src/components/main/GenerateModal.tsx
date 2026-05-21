'use client'

import { useState, useEffect } from 'react'

interface GenerateModalProps {
  appCode: string
  selectedPain: string
  prompt: string
  reference: string | null
  onClose: () => void
}

type Stage = 'generating' | 'preview' | 'fixing' | 'generating-all' | 'done'

const SIZES = ['4x5', '1x1', '9x16', '1.91x1']

export function GenerateModal({ appCode, selectedPain, prompt, reference, onClose }: GenerateModalProps) {
  const [stage, setStage] = useState<Stage>('generating')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [allImages, setAllImages] = useState<Record<string, string>>({})
  const [fixNote, setFixNote] = useState('')
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    generateFirst()
  }, [])

  async function generateFirst(fix?: string, prevImage?: string) {
    setStage('generating')
    setError(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appCode,
          selectedPain,
          userText: prompt,
          referenceBase64: reference,
          fixNote: fix,
          previousImageBase64: prevImage, // передаём предыдущую картинку для Fix
        }),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setStage('preview')
        return
      }

      setPreviewImage(data.imageBase64)
      setCurrentPrompt(data.prompt)
      setStage('preview')
    } catch (e: any) {
      setError(e.message)
      setStage('preview')
    }
  }

  async function handleApprove() {
    if (!previewImage) return
    setStage('generating-all')

    try {
      // Сначала ресайзим 4x5 до точных пикселей
      const resize4x5 = await fetch('/api/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: previewImage, size: '4x5' }),
      })
      const resize4x5Data = await resize4x5.json()
      const results: Record<string, string> = { '4x5': resize4x5Data.imageBase64 || previewImage }

      // Генерим остальные 3 размера параллельно
      await Promise.all(
        ['1x1', '9x16', '1.91x1'].map(async (size) => {
          const genRes = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customPrompt: currentPrompt, appCode }),
          })
          const genData = await genRes.json()
          
          if (!genData.error && genData.imageBase64) {
            // Ресайзим до точных пикселей
            const resizeRes = await fetch('/api/resize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: genData.imageBase64, size }),
            })
            const resizeData = await resizeRes.json()
            results[size] = resizeData.imageBase64 || genData.imageBase64
          }
        })
      )

      setAllImages(results)
      setStage('done')
    } catch (e: any) {
      setError(e.message)
      setStage('preview')
    }
  }

  async function handleSubmitFix() {
    // Передаём текущую картинку как референс для Fix
    await generateFirst(fixNote, previewImage || undefined)
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

        {/* Close */}
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
              {stage === 'generating-all' ? 'Generating all sizes...' : 'Generating creative...'}
            </div>
            <div className="text-sm text-gray-500">
              {stage === 'generating-all' ? 'Creating 1×1, 9×16, 1.91×1' : 'Building prompt & creating 4×5 preview'}
            </div>
          </div>
        )}

        {/* Preview */}
        {stage === 'preview' && (
          <div>
            <h3 className="text-lg font-bold mb-4">Preview — 4×5</h3>
            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                {error}
              </div>
            )}
            {previewImage && (
              <div className="flex justify-center mb-6">
                <img src={previewImage} alt="preview" className="rounded-xl object-cover"
                  style={{ maxHeight: 420, aspectRatio: '4/5' }} />
              </div>
            )}
            {!error && previewImage && (
              <div className="flex gap-3 justify-center">
                <button onClick={handleApprove}
                  className="px-8 py-3 rounded-xl font-semibold"
                  style={{ background: 'var(--accent)' }}>
                  ✓ Approve
                </button>
                <button onClick={() => setStage('fixing')}
                  className="px-8 py-3 rounded-xl font-semibold"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  ✎ Fix
                </button>
                <button onClick={onClose}
                  className="px-8 py-3 rounded-xl font-semibold text-red-400"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  ✕ Cancel
                </button>
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
            <p className="text-xs text-gray-500 mb-4">Describe the change — the rest will stay the same</p>
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
                style={{ background: 'var(--accent)' }}>
                ⬇ Download all 4
              </button>
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
