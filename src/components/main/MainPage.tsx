'use client'

import { useState, useEffect } from 'react'
import { GeneratePanel, Asset } from './GeneratePanel'
import { CreativesGrid } from './CreativesGrid'
import { GenerateModal } from './GenerateModal'
import { DraftModal } from './DraftModal'
import { FilterBar } from './FilterBar'

interface App { code: string; name: string; active: boolean; painPoints?: string[]; hooks?: string[]; logos?: string[]; logoBase64?: string }
interface Marketer { code: string; name: string }

// Module-level store — survives navigation to Settings and back
const panelStore = {
  prompt: '',
  reference: null as string | null,
  selectedLogo: null as string | null,
  mode: 'new' as 'new' | 'var',
  varNumber: '',
  varLetters: [] as string[],
  assets: [] as Asset[],
}

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
  const [prompt, setPrompt] = useState(panelStore.prompt)
  const [reference, setReference] = useState<string | null>(panelStore.reference)
  const [selectedLogo, setSelectedLogo] = useState<string | null>(panelStore.selectedLogo)
  const [gridRefreshKey, setGridRefreshKey] = useState(0)
  const [panelLettersKey, setPanelLettersKey] = useState(0)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [draftImage, setDraftImage] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>(panelStore.assets)

  // New / Var
  const [mode, setMode] = useState<'new' | 'var'>(panelStore.mode)
  const [varNumber, setVarNumber] = useState(panelStore.varNumber)
  const [varLetters, setVarLetters] = useState<string[]>(panelStore.varLetters)

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

        if (savedMarketer) {
          setSelectedMarketer(savedMarketer)
        } else if (data.marketers?.length > 0) {
          setSelectedMarketer(data.marketers[0].code)
          localStorage.setItem('cs_selected_marketer', data.marketers[0].code)
        }
      })
  }, [])

  function validateGenerate(): boolean {
    if (!selectedApp) {
      alert('Please select an app first.')
      return false
    }
    if (mode === 'var' && !varNumber.trim()) {
      alert('Please enter a variant number before generating.')
      return false
    }
    return true
  }

  function handleGenerate() {
    if (!validateGenerate()) return
    setShowModal(true)
  }

  function handleOpenDraft() {
    if (!validateGenerate()) return
    setShowDraftModal(true)
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
          if (mode === 'var') {
            setVarNumber('')
            panelStore.varNumber = ''
          }
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
        onPromptChange={v => { setPrompt(v); panelStore.prompt = v }}
        reference={reference}
        onReferenceChange={v => { setReference(v); panelStore.reference = v }}
        mode={mode}
        onModeChange={v => { setMode(v); panelStore.mode = v }}
        varNumber={varNumber}
        onVarNumberChange={v => { setVarNumber(v); panelStore.varNumber = v }}
        onVarLettersChange={v => { setVarLetters(v); panelStore.varLetters = v }}
        lettersFetchKey={panelLettersKey}
        onGenerate={handleGenerate}
        onOpenDraft={handleOpenDraft}
        appCode={selectedApp}
        availableLogos={(() => {
          const app = apps.find(a => a.code === selectedApp)
          if (!app) return []
          if (app.logos?.length) return app.logos
          if (app.logoBase64) return [app.logoBase64]
          return []
        })()}
        selectedLogo={selectedLogo}
        onLogoChange={v => { setSelectedLogo(v); panelStore.selectedLogo = v }}
        assets={assets}
        onAssetsChange={v => { setAssets(v); panelStore.assets = v }}
      />

      <div className="px-8 pb-8" style={{ marginTop: mode === 'var' ? '390px' : '340px' }}>
        <CreativesGrid
          appCode={selectedApp}
          page={page}
          onPageChange={setPage}
          refreshKey={gridRefreshKey}
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
          competitor={null}
          logoBase64={selectedLogo}
          marketerCode={selectedMarketer}
          mode={mode}
          varNumber={varNumber}
          varLetters={varLetters}
          assets={assets}
          onClose={() => { setShowModal(false); setDraftImage(null) }}
          onSaved={() => { setGridRefreshKey(k => k + 1); setPanelLettersKey(k => k + 1) }}
          initialImage={draftImage || undefined}
        />
      )}

      {showDraftModal && (
        <DraftModal
          apps={apps}
          currentAppCode={selectedApp}
          onSelect={(imageBase64) => {
            setDraftImage(imageBase64)
            setShowDraftModal(false)
            setShowModal(true)
          }}
          onClose={() => setShowDraftModal(false)}
        />
      )}
    </div>
  )
}
