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
  images: CreativeImage[]
}

const SIZES = ['1x1', '4x5', '1.91x1', '9x16']

interface CreativesGridProps {
  appCode: string
  page: number
  onPageChange: (page: number) => void
}

export function CreativesGrid({ appCode, page, onPageChange }: CreativesGridProps) {
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/creatives?app=${appCode}&page=${page}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setCreatives(data.creatives)
        setHasMore(data.hasMore)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [appCode, page])

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-gray-500 flex items-center gap-3">
        <span className="animate-spin text-xl">⟳</span>
        Loading creatives...
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-red-400 text-sm">Error: {error}</div>
    </div>
  )

  if (creatives.length === 0) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-gray-500 text-sm">No creatives found for {appCode}</div>
    </div>
  )

  return (
    <div>
      {/* Заголовок колонок */}
      <div className="grid grid-cols-4 gap-4 mb-4 px-1">
        {SIZES.map(size => (
          <div key={size} className="text-xs font-mono text-gray-600 text-center">{size}</div>
        ))}
      </div>

      {/* Ряды креативов */}
      <div className="space-y-4">
        {creatives.map(creative => (
          <div key={creative.id} className="group">
            {/* Название вариации */}
            <div className="text-xs text-gray-600 mb-2 font-mono">{creative.variantFolder}</div>
            
            <div className="grid grid-cols-4 gap-4">
              {SIZES.map(size => {
                const img = creative.images.find(i => i.size === size)
                return (
                  <div
                    key={size}
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      aspectRatio: sizeToRatio(size),
                    }}
                  >
                    {img ? (
                      <img
                        src={img.url}
                        alt={img.fileName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
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

      {/* Пагинация */}
      <div className="flex items-center justify-center gap-4 mt-10">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          ← Previous
        </button>
        
        <span className="text-sm text-gray-500 font-mono">Page {page}</span>
        
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function sizeToRatio(size: string): string {
  const map: Record<string, string> = {
    '1x1': '1/1',
    '4x5': '4/5',
    '1.91x1': '1.91/1',
    '9x16': '9/16',
  }
  return map[size] || '1/1'
}
