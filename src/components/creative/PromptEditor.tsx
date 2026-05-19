'use client'

interface PromptEditorProps {
  prompt: string
  previewImage: string | null
  onPromptChange: (v: string) => void
  onBack: () => void
  onConfirm: () => void
}

export function PromptEditor({ prompt, previewImage, onPromptChange, onBack, onConfirm }: PromptEditorProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Редактор промпта</h2>
        <p className="text-sm text-gray-400">GPT-4o сгенерировал промпт. Можешь отредактировать перед генерацией.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Промпт */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Промпт для Imagen 3</label>
          <textarea
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            rows={12}
            className="w-full rounded-xl p-4 text-sm font-mono outline-none resize-none transition-all leading-relaxed"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Превью */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Превью</label>
          {previewImage ? (
            <img
              src={previewImage}
              alt="Preview"
              className="w-full rounded-xl object-cover"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : (
            <div className="w-full aspect-square rounded-xl flex items-center justify-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-gray-600 text-sm">Нет превью</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          ← Назад
        </button>
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all"
          style={{ background: 'var(--accent)' }}
        >
          Выбрать форматы →
        </button>
      </div>
    </div>
  )
}
