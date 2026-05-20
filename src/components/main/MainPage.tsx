'use client'

import { useState } from 'react'
import { GeneratePanel } from './GeneratePanel'
import { CreativesGrid } from './CreativesGrid'
import { GenerateModal } from './GenerateModal'

export const APPS = [
  { code: 'UN', name: 'Universal Locators' },
  { code: 'KD', name: 'Kidden' },
  { code: 'LM', name: 'Looma' },
  { code: 'TR', name: 'Trace' },
  { code: 'GZ', name: 'GeoZilla' },
  { code: 'FA', name: 'FamLocate' },
  { code: 'FL', name: 'Family Locator' },
  { code: 'FM', name: 'Familo' },
  { code: 'SF', name: 'SafetyTips' },
  { code: 'RL', name: 'Refinely' },
]

export function MainPage() {
  const [selectedApp, setSelectedApp] = useState(APPS[0].code)
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState<string | null>(null)

  function handleGenerate() {
    if (!prompt.trim() && !reference) return
    setShowModal(true)
  }

  return (
    <div className="relative">
      {/* Фиксированная панель генерации */}
      <GeneratePanel
        apps={APPS}
        selectedApp={selectedApp}
        onAppChange={(code) => { setSelectedApp(code); setPage(1) }}
        prompt={prompt}
        onPromptChange={setPrompt}
        reference={reference}
        onReferenceChange={setReference}
        onGenerate={handleGenerate}
      />

      {/* Лента креативов */}
      <div className="pt-4 px-8 pb-8" style={{ marginTop: '200px' }}>
        <CreativesGrid
          appCode={selectedApp}
          page={page}
          onPageChange={setPage}
        />
      </div>

      {/* Модалка генерации */}
      {showModal && (
        <GenerateModal
          appCode={selectedApp}
          prompt={prompt}
          reference={reference}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
