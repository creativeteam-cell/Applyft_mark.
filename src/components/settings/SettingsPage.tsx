'use client'

import { useState, useEffect } from 'react'
import { AppCard } from './AppCard'
import { AddAppModal } from './AddAppModal'

interface App {
  code: string
  name: string
  description: string
  style: string
  colors: string
  restrictions: string
  active: boolean
  driveExists?: boolean
}

export function SettingsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  useEffect(() => { loadApps() }, [])

  async function loadApps() {
    setLoading(true)
    const res = await fetch('/api/apps')
    const data = await res.json()
    setApps(data)
    setLoading(false)
  }

  async function handleSave(app: App) {
    await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app),
    })
    await loadApps()
  }

  async function handleDelete(code: string) {
    if (!confirm(`Remove ${code}?`)) return
    await fetch(`/api/apps?code=${code}`, { method: 'DELETE' })
    await loadApps()
  }

  async function handleAdd(code: string, name: string) {
    await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    })
    setShowAdd(false)
    await loadApps()
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10" style={{ marginTop: '80px' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage apps and their generation settings</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--accent)' }}
        >
          + Add App
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <AppCard
              key={app.code}
              app={app}
              expanded={expandedApp === app.code}
              onExpand={() => setExpandedApp(expandedApp === app.code ? null : app.code)}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddAppModal
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
