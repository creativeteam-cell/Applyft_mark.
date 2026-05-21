'use client'

import { useState, useEffect } from 'react'
import { GeneratePanel } from './GeneratePanel'
import { CreativesGrid } from './CreativesGrid'
import { GenerateModal } from './GenerateModal'
import { FilterBar } from './FilterBar'

interface App { code: string; name: string; active: boolean; painPoints?: string[] }
interface Marketer { code: string; name: string }

export function MainPage() {
  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedPain, setSelectedPain] = useState('')
  const [selectedMarketer, setSelectedMarketer] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/apps')
      .then(r => r.json())
      .then(data => {
        const activeApps = (data.apps || data).filter((a: App) => a.active)
        setApps(activeApps)
        setMarketers(data.marketers || [])

        const savedApp = localStorage.getItem('cs_selected_app')
        const savedMarketer = localStorage.getItem('cs_selected_marketer')

        if (savedApp && activeApps.find((a: App) => a.code === savedApp)) {
          setSelectedApp(savedApp)
        } else if (activeApps.length > 0) {
          setSelectedApp(activeApps[0].code)
        }

        if (savedMarketer) setSelectedMarketer(savedMarketer)
      })
  }, [])

  function handleGenerate() {
    if (!prompt.trim() && !reference) return
    setShowModal(true)
  }

  return (
    <div className="relative">
      <FilterBar
        apps={apps}
        selectedApp={selectedApp}
        onAppChange={(code) => { setSelectedApp(code); setPage(1) }}
        selectedPain={selectedPain}
        onPainChange={setSelectedPain}
        selectedMarketer={selectedMarketer}
        onMarketerChange={setSelectedMarketer}
        marketers={marketers}
      />

      <GeneratePanel
        prompt={prompt}
        onPromptChange={setPrompt}
        reference={reference}
        onReferenceChange={setReference}
        onGenerate={handleGenerate}
      />

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
