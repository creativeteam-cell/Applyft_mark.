'use client'

import { useEffect, useState } from 'react'

interface App { code: string; name: string; painPoints?: string[]; hooks?: string[] }
interface Marketer { code: string; name: string }
interface Concept { id: string; emoji: string; concept: string }

interface FilterBarProps {
  apps: App[]
  selectedApp: string
  onAppChange: (code: string) => void
  selectedPain: string
  onPainChange: (pain: string) => void
  selectedHook: string
  onHookChange: (hook: string) => void
  selectedMarketer: string
  onMarketerChange: (code: string) => void
  marketers: Marketer[]
  selectedConcept: string
  onConceptChange: (id: string) => void
}

export function FilterBar({
  apps, selectedApp, onAppChange,
  selectedPain, onPainChange,
  selectedHook, onHookChange,
  selectedMarketer, onMarketerChange, marketers,
  selectedConcept, onConceptChange,
}: FilterBarProps) {
  const [concepts, setConcepts] = useState<Concept[]>([])

  const currentApp = apps.find(a => a.code === selectedApp)
  const painPoints = currentApp?.painPoints || []
  const hooks = currentApp?.hooks || []

  useEffect(() => {
    if (!selectedApp) return
    fetch(`/api/concepts?app=${selectedApp}`)
      .then(r => r.json())
      .then(data => setConcepts(Array.isArray(data) ? data : []))
      .catch(() => setConcepts([]))
  }, [selectedApp])

  function handleAppChange(code: string) {
    localStorage.setItem('cs_selected_app', code)
    onAppChange(code)
    onPainChange('none')
    onHookChange('none')
    onConceptChange('none')
  }

  function handleMarketerChange(code: string) {
    localStorage.setItem('cs_selected_marketer', code)
    onMarketerChange(code)
  }

  return (
    <div className="fixed left-0 right-0 z-40 border-b flex items-center gap-4 px-8 py-2.5"
      style={{ top: '56px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      {/* App */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">App</span>
        <select value={selectedApp} onChange={e => handleAppChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {apps.map(app => (
            <option key={app.code} value={app.code}>{app.code} — {app.name}</option>
          ))}
        </select>
      </div>

      {/* Pain */}
      {painPoints.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Pain</span>
          <select value={selectedPain || 'none'} onChange={e => onPainChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer max-w-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="none">— None —</option>
            {painPoints.map((pain, i) => (
              <option key={i} value={pain}>{pain}</option>
            ))}
          </select>
        </div>
      )}

      {/* Headliner */}
      {hooks.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Headliner</span>
          <select value={selectedHook || 'none'} onChange={e => onHookChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer max-w-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="none">— None —</option>
            {hooks.map((hook, i) => (
              <option key={i} value={hook}>{hook}</option>
            ))}
          </select>
        </div>
      )}

      {/* Concept */}
      {concepts.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Concept</span>
          <select value={selectedConcept || 'none'} onChange={e => onConceptChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="none">— Random —</option>
            {concepts.map(c => (
              <option key={c.id} value={c.id}>{c.emoji} {c.concept.slice(0, 40)}...</option>
            ))}
          </select>
        </div>
      )}

      {/* Producer */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Producer</span>
        <select value={selectedMarketer} onChange={e => handleMarketerChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {marketers.map(m => (
            <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
