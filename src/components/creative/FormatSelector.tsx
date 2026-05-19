'use client'

import { Format } from '@/lib/formats'

interface FormatSelectorProps {
  formats: Format[]
  selected: string[]
  onChange: (v: string[]) => void
  onBack: () => void
  onGenerate: () => void
  loading: boolean
  loadingMessage: string
}

export function FormatSelector({ formats, selected, onChange, onBack, onGenerate, loading, loadingMessage }: FormatSelectorProps) {
  const platforms = Array.from(new Set(formats.map(f => f.platform)))

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Выбери форматы</h2>
        <p className="text-sm text-gray-400">Выбрано: {selected.length} форматов</p>
      </div>

      {platforms.map(platform => (
        <div key={platform}>
          <h3 className="text-xs font-mono tracking-widest text-gray-500 uppercase mb-3">{platform}</h3>
          <div className="grid grid-cols-3 gap-3">
            {formats.filter(f => f.platform === platform).map(format => {
              const isSelected = selected.includes(format.id)
              // Визуальное соотношение сторон
              const ratio = format.width / format.height
              const previewW = Math.min(60, ratio * 40)
              const previewH = Math.min(40, 40 / ratio)

              return (
                <button
                  key={format.id}
                  onClick={() => toggle(format.id)}
                  className="flex items-center gap-4 p-4 rounded-xl text-left transition-all"
                  style={{
                    background: isSelected ? 'rgba(79, 110, 247, 0.1)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {/* Иконка соотношения */}
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-10">
                    <div
                      className="rounded-sm"
                      style={{
                        width: previewW,
                        height: previewH,
                        background: isSelected ? 'var(--accent)' : 'var(--border)',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{format.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{format.width}×{format.height}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          ← Назад
        </button>
        <button
          onClick={onGenerate}
          disabled={selected.length === 0 || loading}
          className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? (
            <><span className="animate-spin">⟳</span> {loadingMessage}</>
          ) : (
            <>✦ Сгенерировать {selected.length} форматов</>
          )}
        </button>
      </div>
    </div>
  )
}
