'use client'

import { useRef } from 'react'

interface BriefFormProps {
  brief: string
  comment: string
  referenceBase64: string | null
  onBriefChange: (v: string) => void
  onCommentChange: (v: string) => void
  onReferenceUpload: (v: string | null) => void
  onSubmit: () => void
  loading: boolean
  loadingMessage: string
}

export function BriefForm({
  brief, comment, referenceBase64,
  onBriefChange, onCommentChange, onReferenceUpload,
  onSubmit, loading, loadingMessage
}: BriefFormProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      onReferenceUpload(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Новый креатив</h2>

      {/* Бриф */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Опиши что нужно создать
        </label>
        <textarea
          value={brief}
          onChange={e => onBriefChange(e.target.value)}
          placeholder="Например: рекламный баннер для IT-рекрутингового агентства ApplyFT. Стиль — технологичный, современный. Аудитория — tech-специалисты."
          rows={4}
          className="w-full rounded-xl p-4 text-sm outline-none resize-none transition-all"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Референс */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Референс конкурента <span className="text-gray-600">(необязательно)</span>
        </label>
        
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        
        {referenceBase64 ? (
          <div className="relative inline-block">
            <img src={referenceBase64} alt="Reference" className="h-32 rounded-lg object-cover" />
            <button
              onClick={() => onReferenceUpload(null)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm border border-dashed transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <span>📎</span>
            Загрузить референс
          </button>
        )}
      </div>

      {/* Комментарий */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Что переделать под себя <span className="text-gray-600">(если есть референс)</span>
        </label>
        <textarea
          value={comment}
          onChange={e => onCommentChange(e.target.value)}
          placeholder="Например: убери красный цвет, замени на синий. Логотип должен быть слева. Текст — на украинском."
          rows={3}
          className="w-full rounded-xl p-4 text-sm outline-none resize-none transition-all"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Кнопка */}
      <button
        onClick={onSubmit}
        disabled={!brief.trim() || loading}
        className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold transition-all disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {loading ? (
          <>
            <span className="animate-spin">⟳</span>
            {loadingMessage}
          </>
        ) : (
          <>
            <span>✦</span>
            Сгенерировать промпт
          </>
        )}
      </button>
    </div>
  )
}
