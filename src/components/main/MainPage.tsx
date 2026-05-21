'use client'

import { useState, useEffect } from 'react'
import { GeneratePanel } from './GeneratePanel'
import { CreativesGrid } from './CreativesGrid'
import { GenerateModal } from './GenerateModal'
import { FilterBar } from './FilterBar'

interface App {
  code: string
  name: string
  active: boolean
}

export function MainPage() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedDesigner, setSelectedDesigner] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/apps')
      .then(r => r.json())
      .then(data => {
        const active = data.filter((a: App) => a.active)
        setApps(active)
        if (active.length > 0) setSelectedApp(active[0].code)
      })
  }, [])

  function handleGenerate() {
    if (!prompt.trim() && !reference) return
    setShowModal(true)
  }

  return (
    <div className="relative">
      {/* Фильтр бар */}
      <FilterBar
        apps={apps}
        selectedApp={selectedApp}
        onAppChange={(code) => { setSelectedApp(code); setPage(1) }}
        selectedDesigner={selectedDesigner}
        onDesignerChange={setSelectedDesigner}
      />

      {/* Панель генерации */}
      <GeneratePanel
        prompt={prompt}
        onPromptChange={setPrompt}
        reference={reference}
        onReferenceChange={setReference}
        onGenerate={handleGenerate}
      />

      {/* Лента креативов */}
      <div className="px-8 pb-8" style={{ marginTop: '160px' }}>
        <CreativesGrid
          appCode={selectedApp}
          page={page}
          onPageChange={setPage}
        />
      </div>

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
