'use client'

interface ResizedImage {
  formatId: string
  name: string
  width: number
  height: number
  platform: string
  imageBase64: string
}

interface ResultsGridProps {
  images: ResizedImage[]
  onBack: () => void
  onStartOver: () => void
}

export function ResultsGrid({ images, onBack, onStartOver }: ResultsGridProps) {
  function downloadImage(img: ResizedImage) {
    const link = document.createElement('a')
    link.href = img.imageBase64
    link.download = `creative_${img.width}x${img.height}_${img.formatId}.png`
    link.click()
  }

  function downloadAll() {
    images.forEach((img, i) => {
      setTimeout(() => downloadImage(img), i * 200)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">Готово!</h2>
          <p className="text-sm text-gray-400">Сгенерировано {images.length} форматов</p>
        </div>
        <button
          onClick={downloadAll}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all"
          style={{ background: 'var(--accent)' }}
        >
          ⬇ Скачать все
        </button>
      </div>

      {/* Группировка по платформам */}
      {Array.from(new Set(images.map(i => i.platform))).map(platform => (
        <div key={platform}>
          <h3 className="text-xs font-mono tracking-widest text-gray-500 uppercase mb-3">{platform}</h3>
          <div className="grid grid-cols-2 gap-4">
            {images.filter(i => i.platform === platform).map(img => (
              <div
                key={img.formatId}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                {/* Превью изображения */}
                <div className="relative bg-gray-900">
                  <img
                    src={img.imageBase64}
                    alt={img.name}
                    className="w-full object-cover"
                    style={{ maxHeight: 300 }}
                  />
                </div>
                
                {/* Инфо и кнопка */}
                <div className="p-4 flex items-center justify-between"
                  style={{ background: 'var(--surface)' }}>
                  <div>
                    <div className="font-medium text-sm">{img.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{img.width}×{img.height}px</div>
                  </div>
                  <button
                    onClick={() => downloadImage(img)}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'var(--border)', color: 'var(--text)' }}
                  >
                    ⬇ PNG
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          ← Изменить форматы
        </button>
        <button
          onClick={onStartOver}
          className="px-6 py-3 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          ✦ Новый креатив
        </button>
      </div>
    </div>
  )
}
