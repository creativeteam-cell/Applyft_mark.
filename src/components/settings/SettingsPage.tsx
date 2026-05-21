'use client'

import { useState, useEffect } from 'react'
import { AppCard } from './AppCard'
import { AddAppModal } from './AddAppModal'
import { MarketersSection } from './MarketersSection'

interface App {
  code: string
  name: string
  description: string
  painPoints: string
  style: string
  colors: string
  restrictions: string
  active: boolean
}

interface Marketer {
  code: string
  name: string
}

const DEFAULT_MARKETERS: Marketer[] = [
  { code: 'TMK', name: 'Tetiana Melnyk' },
  { code: 'KZA', name: 'Kseniia Zadoia' },
  { code: 'AHB', name: 'Anhelina Halbul' },
  { code: 'ASR', name: 'Artem Sierov' },
  { code: 'SMV', name: 'Sofiia Matviikiv' },
  { code: 'DDT', name: 'Diana Drobotey' },
  { code: 'VTL', name: 'Vladyslava Tsymbal' },
  { code: 'YKH', name: 'Yuliia Khomukha' },
  { code: 'DKR', name: 'Danylo Kyrylov' },
  { code: 'ASM', name: 'Antonina Samoliuk' },
  { code: 'NBL', name: 'Nataliia Bielousova' },
  { code: 'RSK', name: 'Romana Skrabut' },
  { code: 'KIS', name: 'Kseniia Ilienko' },
  { code: 'MMM', name: 'Mariia Minaieva' },
]

export function SettingsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>(DEFAULT_MARKETERS)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [marketersSaved, setMarketersSaved] = useState(false)

  useEffect(() => { loadApps() }, [])

  async function loadApps() {
    setLoading(true)
    const res = await fetch('/api/apps')
    const data = await res.json()
    setApps(data.apps || data)
    if (data.marketers) setMarketers(data.marketers)
    setLoading(false)
  }

  async function handleSaveApp(app: App) {
    await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'app', data: app }),
    })
    await loadApps()
  }

  async function handleDeleteApp(code: string) {
    if (!confirm(`Remove ${code}?`)) return
    await fetch(`/api/apps?code=${code}`, { method: 'DELETE' })
    await loadApps()
  }

  async function handleAddApp(code: string, name: string) {
    await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'app', data: { code, name } }),
    })
    setShowAdd(false)
    await loadApps()
  }

  async function handleSaveMarketers(updated: Marketer[]) {
    setMarketers(updated)
    await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'marketers', data: updated }),
    })
    setMarketersSaved(true)
    setTimeout(() => setMarketersSaved(false), 2000)
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10" style={{ marginTop: '56px' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage apps and their generation settings</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--accent)' }}>
          + Add App
        </button>
      </div>

      {/* Apps */}
      {loading ? (
        <div className="text-gray-500 text-sm mb-8">Loading...</div>
      ) : (
        <div className="space-y-3 mb-10">
          {apps.map(app => (
            <AppCard
              key={app.code}
              app={app}
              expanded={expandedApp === app.code}
              onExpand={() => setExpandedApp(expandedApp === app.code ? null : app.code)}
              onSave={handleSaveApp}
              onDelete={handleDeleteApp}
            />
          ))}
        </div>
      )}

      {/* Marketers */}
      <div className="relative">
        <MarketersSection
          marketers={marketers}
          onChange={handleSaveMarketers}
        />
        {marketersSaved && (
          <div className="absolute top-4 right-4 text-xs text-green-400 font-mono">✓ Saved!</div>
        )}
      </div>

      {showAdd && (
        <AddAppModal onAdd={handleAddApp} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}
