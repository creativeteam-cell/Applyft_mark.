'use client'

import { useState, useEffect } from 'react'
import { AppCard } from './AppCard'
import { AddAppModal } from './AddAppModal'
import { MarketersSection } from './MarketersSection'

interface App {
  code: string
  name: string
  description: string
  painPoints: string[]
  active: boolean
  logoBase64?: string
}

interface Marketer {
  code: string
  name: string
}

function SectionHeader({ title, count, expanded, onToggle }: {
  title: string
  count?: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <span className="font-semibold">{title}</span>
        {count !== undefined && (
          <span className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
            {count}
          </span>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
        className={`transition-transform text-gray-500 ${expanded ? 'rotate-180' : ''}`}>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

export function SettingsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  // Секции сворачиваемые
  const [appsOpen, setAppsOpen] = useState(true)
  const [producersOpen, setProducersOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

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
    setExpandedApp(null)
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
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10" style={{ marginTop: '56px' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage apps, producers and creative library</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--accent)' }}>
          + Add App
        </button>
      </div>

      {/* Apps section */}
      <div className="mb-6">
        <SectionHeader
          title="Apps"
          count={apps.length}
          expanded={appsOpen}
          onToggle={() => setAppsOpen(!appsOpen)}
        />
        {appsOpen && (
          loading ? (
            <div className="text-gray-500 text-sm px-2">Loading...</div>
          ) : (
            <div className="space-y-3">
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
          )
        )}
      </div>

      {/* Producers section */}
      <div className="mb-6">
        <SectionHeader
          title="Producers"
          count={marketers.length}
          expanded={producersOpen}
          onToggle={() => setProducersOpen(!producersOpen)}
        />
        {producersOpen && (
          <MarketersSection marketers={marketers} onChange={handleSaveMarketers} />
        )}
      </div>

      {/* Creative Library section */}
      <div className="mb-6">
        <SectionHeader
          title="Creative Library"
          expanded={libraryOpen}
          onToggle={() => setLibraryOpen(!libraryOpen)}
        />
        {libraryOpen && (
          <div className="px-2 py-2">
            <p className="text-sm text-gray-500 mb-4">
              Upload ad creatives to extract concepts. Open an app to manage its library.
            </p>
            {apps.length === 0 ? (
              <div className="text-xs text-gray-600">No apps yet</div>
            ) : (
              <div className="text-sm text-gray-400">
                Open any app card above to upload concepts for that app.
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddAppModal onAdd={handleAddApp} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
