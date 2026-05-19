'use client'

import { useState } from 'react'
import { BriefForm } from './BriefForm'
import { PromptEditor } from './PromptEditor'
import { FormatSelector } from './FormatSelector'
import { ResultsGrid } from './ResultsGrid'
import { CREATIVE_FORMATS } from '@/lib/formats'

type Step = 'brief' | 'prompt' | 'formats' | 'results'

export function CreativeWorkspace() {
  const [step, setStep] = useState<Step>('brief')
  const [brief, setBrief] = useState('')
  const [comment, setComment] = useState('')
  const [referenceBase64, setReferenceBase64] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['ig_square', 'ig_story', 'fb_feed'])
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [resizedImages, setResizedImages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')

  // Шаг 1 → 2: генерим промпт
  async function handleGeneratePrompt() {
    setLoading(true)
    setLoadingMessage('Анализирую бриф и референс...')
    
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, comment, referenceBase64 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      setPrompt(data.prompt)
      setGeneratedImage(data.imageBase64)
      setStep('prompt')
    } catch (err: any) {
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Шаг 2 → 3: подтверждаем промпт
  function handlePromptConfirm() {
    setStep('formats')
  }

  // Шаг 3 → 4: регенерим если нужно и ресайзим
  async function handleGenerate() {
    setLoading(true)
    setLoadingMessage('Генерирую изображение...')
    
    try {
      // Генерим финальное изображение с кастомным промптом
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPrompt: prompt }),
      })
      const genData = await genRes.json()
      if (genData.error) throw new Error(genData.error)

      setLoadingMessage('Подготавливаю форматы...')

      // Ресайзим под выбранные форматы
      const resizeRes = await fetch('/api/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: genData.imageBase64,
          formatIds: selectedFormats,
        }),
      })
      const resizeData = await resizeRes.json()
      if (resizeData.error) throw new Error(resizeData.error)

      setResizedImages(resizeData.resized)
      setStep('results')
    } catch (err: any) {
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      
      {/* Прогресс */}
      <div className="flex items-center gap-4 mb-10">
        {(['brief', 'prompt', 'formats', 'results'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${step === s ? 'text-white' : 
                  ['brief','prompt','formats','results'].indexOf(step) > i ? 'text-white' : 'text-gray-600'}`}
                style={{
                  background: step === s ? 'var(--accent)' :
                    ['brief','prompt','formats','results'].indexOf(step) > i ? '#2d3a7a' : 'var(--border)'
                }}>
                {i + 1}
              </div>
              <span className={`text-sm capitalize ${step === s ? 'text-white' : 'text-gray-500'}`}>
                {s === 'brief' ? 'Бриф' : s === 'prompt' ? 'Промпт' : s === 'formats' ? 'Форматы' : 'Результат'}
              </span>
            </div>
            {i < 3 && <div className="w-8 h-px" style={{ background: 'var(--border)' }} />}
          </div>
        ))}
      </div>

      {/* Контент шагов */}
      {step === 'brief' && (
        <BriefForm
          brief={brief}
          comment={comment}
          onBriefChange={setBrief}
          onCommentChange={setComment}
          onReferenceUpload={setReferenceBase64}
          referenceBase64={referenceBase64}
          onSubmit={handleGeneratePrompt}
          loading={loading}
          loadingMessage={loadingMessage}
        />
      )}

      {step === 'prompt' && (
        <PromptEditor
          prompt={prompt}
          previewImage={generatedImage}
          onPromptChange={setPrompt}
          onBack={() => setStep('brief')}
          onConfirm={handlePromptConfirm}
        />
      )}

      {step === 'formats' && (
        <FormatSelector
          formats={CREATIVE_FORMATS}
          selected={selectedFormats}
          onChange={setSelectedFormats}
          onBack={() => setStep('prompt')}
          onGenerate={handleGenerate}
          loading={loading}
          loadingMessage={loadingMessage}
        />
      )}

      {step === 'results' && (
        <ResultsGrid
          images={resizedImages}
          onBack={() => setStep('formats')}
          onStartOver={() => {
            setBrief('')
            setComment('')
            setReferenceBase64(null)
            setPrompt('')
            setGeneratedImage(null)
            setResizedImages([])
            setStep('brief')
          }}
        />
      )}
    </div>
  )
}
