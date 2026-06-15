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
  isCarousel?: boolean
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

  const [creatives, setCreatives] = useState<Creative[]>(entry?.creatives || [])
  const [hasMore, setHasMore] = useState(entry?.hasMore ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Creative[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  // Per-carousel frame index: key = creative.id
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!appCode) return

    const ck = `${appCode}-${page}`
    const cached = gridCache.get(ck)

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
    for (const key of gridCache.keys()) {
      if (key.startsWith(`${appCode}-`)) gridCache.delete(key)
    }
    setLocalRefresh(v => v + 1)
  }

  // Drive-wide search when search term changes
  useEffect(() => {
    const q = search.trim()
    if (!q || !appCode) {
      setSearchResults([])
      return
    }
    const controller = new AbortController()
    setSearchLoading(true)
    fetch(`/api/creatives/search?app=${appCode}&q=${q.padStart(3, '0')}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!data.error) setSearchResults(data.creatives || []) })
      .catch(() => {})
      .finally(() => setSearchLoading(false))
    return () => controller.abort()
  }, [search, appCode])

  function setCarouselIndex(id: string, index: number) {
    setCarouselIndexes(prev => ({ ...prev, [id]: index }))
  }

  // Local filter (instant) + merge with Drive search results (deduped)
  const q = search.trim()
  const qPadded = q.padStart(3, '0')
  const localFiltered = q ? creatives.filter(c => c.variantFolder.includes(qPadded)) : creatives
  const localIds = new Set(localFiltered.map(c => c.id))
  const extraFromDrive = searchResults.filter(c => !localIds.has(c.id))
  const filtered = q ? [...localFiltered, ...extraFromDrive] : creatives

  return (
    <div>
      {/* Header */}
      <div className="flex items-center mb-4 px-1 gap-3">
        <div className="grid grid-cols-4 gap-4 flex-1">
          {SIZES.map(size => (
            <div key={size} className="text-xs font-mono text-gray-600 text-center">{size}</div>
          ))}
        </div>

        {/* Number search */}
        <div className="relative flex items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="001"
            maxLength={3}
            className="w-16 px-2 py-1 rounded-lg text-xs font-mono text-center outline-none"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${search ? 'var(--accent)' : 'var(--border)'}`,
              color: 'var(--text)',
            }}
            title="Search by number"
          />
          {searchLoading && (
            <span className="absolute -right-4 text-gray-500 animate-spin text-xs">⟳</span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh creatives"
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <span className={loading ? 'animate-spin inline-block' : ''} style={{ fontSize: 14 }}>⟳</span>
        </button>
      </div>

      {/* Content */}
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
      ) : filtered.length === 0 && searchLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-gray-500 flex items-center gap-2 text-sm">
            <span className="animate-spin">⟳</span> Searching Drive...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-gray-500 text-sm">No creatives matching <span className="font-mono" style={{ color: 'var(--accent)' }}>{search}</span></div>
        </div>
      ) : (
        <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {filtered.map(creative => (
            creative.isCarousel
              ? <CarouselRow
                  key={creative.id}
                  creative={creative}
                  index={carouselIndexes[creative.id] ?? 0}
                  onIndexChange={i => setCarouselIndex(creative.id, i)}
                />
              : <StandardRow key={creative.id} creative={creative} />
          ))}
        </div>
      )}

      {/* Pagination */}
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

// ─── Standard 4-size row ─────────────────────────────────────────────────────

function StandardRow({ creative }: { creative: Creative }) {
  return (
    <div>
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
  )
}

// ─── Carousel row ─────────────────────────────────────────────────────────────

const CAROUSEL_VISIBLE = 4 // how many frames visible at once

function CarouselRow({
  creative,
  index,
  onIndexChange,
}: {
  creative: Creative
  index: number
  onIndexChange: (i: number) => void
}) {
  const frames = creative.images
  const total = frames.length
  const size = frames[0]?.size || '1x1'
  const ratio = sizeToRatio(size)

  // Clamp index so we always show CAROUSEL_VISIBLE frames starting from it
  const safeIndex = Math.min(index, Math.max(0, total - CAROUSEL_VISIBLE))
  const canPrev = safeIndex > 0
  const canNext = safeIndex + CAROUSEL_VISIBLE < total

  const visible = frames.slice(safeIndex, safeIndex + CAROUSEL_VISIBLE)

  return (
    <div>
      {/* Folder link + badge */}
      <div className="flex items-center gap-2 mb-2">
        <a
          href={`https://drive.google.com/drive/folders/${creative.variantFolderId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 font-mono hover:text-blue-400 transition-colors">
          {creative.variantFolder}
        </a>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.25)' }}>
          🎠 carousel · {total} frames · {size}
        </span>
      </div>

      {/* Strip with navigation */}
      <div className="flex items-center gap-2">
        {/* Prev */}
        <button
          onClick={() => onIndexChange(Math.max(0, safeIndex - 1))}
          disabled={!canPrev}
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all disabled:opacity-20"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          ←
        </button>

        {/* Frames */}
        <div className="grid gap-3 flex-1" style={{ gridTemplateColumns: `repeat(${CAROUSEL_VISIBLE}, 1fr)` }}>
          {visible.map((frame, i) => {
            const frameNum = safeIndex + i + 1
            return (
              <div key={frame.fileId} className="relative">
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    aspectRatio: ratio,
                  }}>
                  <img src={frame.url} alt={frame.fileName}
                    className="w-full h-full object-cover" loading="lazy" />
                </div>
                {/* Frame number badge */}
                <div
                  className="absolute top-1.5 left-1.5 text-xs font-mono px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                  {frameNum}
                </div>
              </div>
            )
          })}
          {/* Fill empty slots if last page has fewer than CAROUSEL_VISIBLE */}
          {Array.from({ length: CAROUSEL_VISIBLE - visible.length }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-xl"
              style={{ background: 'var(--surface)', border: '1px dashed var(--border)', aspectRatio: ratio }} />
          ))}
        </div>

        {/* Next */}
        <button
          onClick={() => onIndexChange(Math.min(total - CAROUSEL_VISIBLE, safeIndex + 1))}
          disabled={!canNext}
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all disabled:opacity-20"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          →
        </button>
      </div>

      {/* Dot indicators */}
      {total > CAROUSEL_VISIBLE && (
        <div className="flex justify-center gap-1 mt-2">
          {Array.from({ length: total - CAROUSEL_VISIBLE + 1 }).map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className="rounded-full transition-all"
              style={{
                width: i === safeIndex ? 16 : 6,
                height: 6,
                background: i === safeIndex ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sizeToRatio(size: string): string {
  const map: Record<string, string> = {
    '1x1': '1/1', '4x5': '4/5', '1.91x1': '1.91/1', '9x16': '9/16',
  }
  return map[size] || '1/1'
}
