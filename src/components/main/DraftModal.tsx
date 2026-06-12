'use client'

import { useState, useEffect } from 'react'

interface DraftFile {
  id: string
  name: string
  appCode: string
  createdTime: string
}

interface DraftModalProps {
  apps: { code: string; name: string }[]
  currentAppCode: string
  onSelect: (imageBase64: string, appCode: string) => void
  onClose: () => void
}

export function DraftModal({ apps, currentAppCode, onSelect, onClose }: DraftModalProps) {
  const [files, setFiles] = useState<DraftFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterApp, setFilterApp] = useState(currentAppCode || 'all')
  const [selected, setSelected] = useState<DraftFile | null>(null)
  const [fetchingImage, setFetchingImage] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/draft/list')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setFiles(data.files)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const draftAppCodes = [...new Set(files.map(f => f.appCode).filter(Boolean))]
  const filteredFiles = filterApp === 'all' ? files : files.filter(f => f.appCode === filterApp)

  async function handleConfirm() {
    if (!selected) return
    setFetchingImage(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/draft/image?id=${selected.id}`)
      if (!res.ok) throw new Error('Failed to fetch image')
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onload = () => {
        onSelect(reader.result as string, selected.appCode)
      }
      reader.onerror = () => {
        setFetchError('Failed to read image')
        setFetchingImage(false)
      }
      reader.readAsDataURL(blob)
    } catch (e: any) {
      setFetchError(e.message)
      setFetchingImage(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="relative w-full max-w-4xl mx-4 rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-5 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold">Draft for Design</h2>
            <p className="text-sm text-gray-500 mt-0.5">Select a draft to continue editing</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-white"
            style={{ background: 'var(--border)' }}>×</button>
        </div>

        {/* Filter bar */}
        <div className="px-8 pb-4 flex-shrink-0 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterApp('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
            style={{
              background: filterApp === 'all' ? 'var(--accent)' : 'var(--bg)',
              border: `1px solid ${filterApp === 'all' ? 'var(--accent)' : 'var(--border)'}`,
              color: filterApp === 'all' ? '#fff' : 'var(--text)',
            }}>
            All ({files.length})
          </button>
          {draftAppCodes.map(code => {
            const count = files.filter(f => f.appCode === code).length
            const appName = apps.find(a => a.code === code)?.name
            return (
              <button
                key={code}
                onClick={() => setFilterApp(code)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
                style={{
                  background: filterApp === code ? 'var(--accent)' : 'var(--bg)',
                  border: `1px solid ${filterApp === code ? 'var(--accent)' : 'var(--border)'}`,
                  color: filterApp === code ? '#fff' : 'var(--text)',
                }}>
                {appName ? `${code} — ${appName}` : code} ({count})
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <span className="animate-spin text-2xl mr-3">⟳</span>
              <span className="text-gray-400">Loading drafts...</span>
            </div>
          ) : error ? (
            <div className="text-center py-24 text-red-400">{error}</div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-24 text-gray-500">
              {files.length === 0 ? 'No drafts yet' : `No drafts for ${filterApp}`}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {filteredFiles.map(file => {
                const isSelected = selected?.id === file.id
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelected(isSelected ? null : file)}
                    className="relative rounded-xl overflow-hidden transition-all text-left"
                    style={{
                      aspectRatio: '4/5',
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      boxShadow: isSelected ? '0 0 0 3px var(--accent-glow, rgba(99,102,241,0.3))' : 'none',
                      outline: 'none',
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/draft/image?id=${file.id}`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* App code badge */}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                      {file.appCode}
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(99,102,241,0.2)' }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                          style={{ background: 'var(--accent)' }}>✓</div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {selected && (
          <div className="flex-shrink-0 px-8 py-5 border-t flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--border)' }}>
            <div className="text-sm text-gray-400 truncate flex-1">
              <span className="font-mono text-white">{selected.name}</span>
            </div>
            {fetchError && (
              <div className="text-red-400 text-xs">{fetchError}</div>
            )}
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setSelected(null)}
                className="px-5 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--border)' }}>
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={fetchingImage}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
                style={{ background: 'var(--accent)' }}>
                {fetchingImage ? (
                  <><span className="animate-spin inline-block">⟳</span> Loading...</>
                ) : (
                  <>✓ Use this draft</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
