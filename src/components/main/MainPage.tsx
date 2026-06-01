'use client'

import { useState, useEffect } from 'react'
import { GeneratePanel } from './GeneratePanel'
import { CreativesGrid } from './CreativesGrid'
import { GenerateModal } from './GenerateModal'
import { FilterBar } from './FilterBar'

interface App { code: string; name: string; active: boolean; painPoints?: string[]; hooks?: string[] }
interface Marketer { code: string; name: string }

export function MainPage() {
  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedPain, setSelectedPain] = useState('none')
  const [selectedHook, setSelectedHook] = useState('none')
  const [selectedMarketer, setSelectedMarketer] = useState('')
  const [selectedConcept, setSelectedConcept] = useState('none')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState<string | null>(null)
  const [competitor, setCompetitor] = useState<string | null>(null)

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
    if (!selectedApp) {
      alert('Please select an app first.')
      return
    }
    setShowModal(true)
  }

  return (
    <div className="relative">
      <FilterBar
        apps={apps}
        selectedApp={selectedApp}
        onAppChange={(code) => {
          setSelectedApp(code)
          setPage(1)
          setSelectedPain('none')
          setSelectedHook('none')
          setSelectedConcept('none')
        }}
        selectedPain={selectedPain}
        onPainChange={setSelectedPain}
        selectedHook={selectedHook}
        onHookChange={setSelectedHook}
        selectedMarketer={selectedMarketer}
        onMarketerChange={setSelectedMarketer}
        marketers={marketers}
        selectedConcept={selectedConcept}
        onConceptChange={setSelectedConcept}
      />

      <GeneratePanel
        prompt={prompt}
        onPromptChange={setPrompt}
        reference={reference}
        onReferenceChange={setReference}
        competitor={competitor}
        onCompetitorChange={setCompetitor}
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
          selectedPain={selectedPain}
          selectedHook={selectedHook}
          selectedConcept={selectedConcept}
          prompt={prompt}
          reference={reference}
          competitor={competitor}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
