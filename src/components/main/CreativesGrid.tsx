'use client'

import { useEffect, useState } from 'react'

interface CreativeImage {
  size: string
  fileId: string
  fileName: string
  url: string
}

interface Creative {
  id: string
  appCode: string
  variantFolder: string
  variantFolderId: string
  images: CreativeImage[]
}

const SIZES = ['1x1', '4x5', '1.91x1', '9x16']

interface CacheEntry {
  creatives: Creative[]
  hasMore: boolean
  refreshKey: number
  localRefresh: number
}

// Module-level cache — survives navigation (Settings → Dashboard)
const gridCache = new Map<string, CacheEntry>()

interface CreativesGridProps {
  appCode: string
  page: number
  onPageChange: (page: number) => void
  refreshKey?: number
}

export function CreativesGrid({ appCode, page, onPageChange, refreshKey = 0 }: CreativesGridProps) {
  const cacheKey = `${appCode}-${page}`
  const entry = gridCache.get(cacheKey)

  // Initialize from cache immediately — no loading flash when navigating back
  const [creatives, setCreatives] = useState<Creative[]>(entry?.creatives || [])
  const [hasMore, setHasMore] = useState(entry?.hasMore ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)

  useEffect(() => {
    if (!appCode) return

    const ck = `${appCode}-${page}`
    const cached = gridCache.get(ck)

    // Cache is fresh — no need to fetch
    if (cached && cached.refreshKey === refreshKey && cached.localRefresh === localRefresh) {
      setCreatives(cached.creatives)
      setHasMore(cached.hasMore)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    const controller = new AbortController()

    fetch(`/api/creatives?app=${appCode}&page=${page}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setCreatives(data.creatives)
        setHasMore(data.hasMore)
        gridCache.set(ck, { creatives: data.creatives, hasMore: data.hasMore, refreshKey, localRefresh })
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [appCode, page, refreshKey, localRefresh])

  function handleRefresh() {
    // Clear all pages for this app
    for (const key of gridCache.keys()) {
      if (key.startsWith(`${appCode}-`)) gridCache.delete(key)
    }
    setLocalRefresh(v => v + 1)
  }

  return (
    <div>
      {/* Заголовок колонок + кнопка Refresh */}
      <div className="flex items-center mb-4 px-1">
        <div className="grid grid-cols-4 gap-4 flex-1">
          {SIZES.map(size => (
            <div key={size} className="text-xs font-mono text-gray-600 text-center">{size}</div>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh creatives"
          className="ml-4 w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <span className={loading ? 'animate-spin inline-block' : ''} style={{ fontSize: 14 }}>⟳</span>
        </button>
      </div>

      {/* Контент */}
      {error ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-red-400 text-sm">Error: {error}</div>
        </div>
      ) : creatives.length === 0 && loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-gray-500 flex items-center gap-3">
            <span className="animate-spin text-xl">⟳</span>
            Loading creatives...
          </div>
        </div>
      ) : creatives.length === 0 ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-gray-500 text-sm">No creatives found for {appCode}</div>
        </div>
      ) : (
        <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {creatives.map(creative => (
            <div key={creative.id}>
              <a
                href={`https://drive.google.com/drive/folders/${creative.variantFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 mb-2 font-mono hover:text-blue-400 transition-colors inline-block">
                {creative.variantFolder}
              </a>
              <div className="grid grid-cols-4 gap-4">
                {SIZES.map(size => {
                  const img = creative.images.find(i => i.size === size)
                  return (
                    <div key={size} className="rounded-xl overflow-hidden"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        aspectRatio: sizeToRatio(size),
                      }}>
                      {img ? (
                        <img src={img.url} alt={img.fileName}
                          className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-gray-700 text-xs">—</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {(creatives.length > 0 || page > 1) && (
        <div className="flex items-center justify-center gap-4 mt-10">
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
            className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            ← Previous
          </button>
          <span className="text-sm text-gray-500 font-mono">Page {page}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={!hasMore}
            className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function sizeToRatio(size: string): string {
  const map: Record<string, string> = {
    '1x1': '1/1', '4x5': '4/5', '1.91x1': '1.91/1', '9x16': '9/16',
  }
  return map[size] || '1/1'
}
