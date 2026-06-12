'use client'

import { useState, useRef } from 'react'

interface App {
  code: string
  name: string
  description: string
  painPoints: string[]
  hooks: string[]
  active: boolean
  logoBase64?: string
  logos?: string[]
}

interface AppCardProps {
  app: App
  expanded: boolean
  onExpand: () => void
  onSave: (app: App) => Promise<void>
  onDelete: (code: string) => Promise<void>
}

export function AppCard({ app, expanded, onExpand, onSave, onDelete }: AppCardProps) {
  const [form, setForm] = useState({
    ...app,
    painPoints: Array.isArray(app.painPoints) ? app.painPoints : [],
    hooks: Array.isArray(app.hooks) ? app.hooks : [],
    logoBase64: app.logoBase64 || '',
    logos: Array.isArray(app.logos) ? app.logos : (app.logoBase64 ? [app.logoBase64] : []),
  })
  const [newPain, setNewPain] = useState('')
  const [newHook, setNewHook] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  function handleAddPain() {
    if (!newPain.trim()) return
    setForm({ ...form, painPoints: [...form.painPoints, newPain.trim()] })
    setNewPain('')
  }

  function handleRemovePain(i: number) {
    setForm({ ...form, painPoints: form.painPoints.filter((_, idx) => idx !== i) })
  }

  function handleAddHook() {
    if (!newHook.trim()) return
    setForm({ ...form, hooks: [...form.hooks, newHook.trim()] })
    setNewHook('')
  }

  function handleRemoveHook(i: number) {
    setForm({ ...form, hooks: form.hooks.filter((_, idx) => idx !== i) })
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setForm(prev => ({ ...prev, logos: [...prev.logos, base64] }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleRemoveLogo(i: number) {
    setForm(prev => ({ ...prev, logos: prev.logos.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${expanded ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)' }}>

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 cursor-pointer" onClick={onExpand}>
        <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center font-bold text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
          {form.logos[0]
            ? <img src={form.logos[0]} alt="logo" className="w-full h-full object-contain p-1" />
            : app.code}
        </div>
        <div className="flex-1">
          <div className="font-semibold">{app.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {app.description ? app.description.slice(0, 60) + '...' : 'No description yet'}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600 font-mono">
          <span>{form.painPoints.length} pains</span>
          <span>{form.hooks.length} headlines</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-transform text-gray-500 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t px-6 pb-6 pt-5 space-y-6" style={{ borderColor: 'var(--border)' }}>

          {/* 0 · Abbreviation */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              0 · Abbreviation (Drive folder code)
            </label>
            <div className="flex items-center gap-3">
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().slice(0, 4) })}
                placeholder="e.g. ST"
                maxLength={4}
                className="w-24 rounded-xl px-4 py-2.5 text-sm outline-none font-mono font-bold tracking-widest"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
              <span className="text-xs text-gray-500">
                Must match the Drive folder name, e.g. folder <span className="font-mono text-gray-400">&quot;ST — Stride&quot;</span> → code <span className="font-mono text-gray-400">ST</span>
              </span>
            </div>
          </div>

          {/* 1 · Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              1 · Product description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={5}
              placeholder={`App name and abbreviation: ${app.code} — ${app.name}\n\nWhat is the app? What does it do?\nTarget audience: who uses it?\nKey features: what makes it unique?`}
              className="w-full rounded-xl p-4 text-sm outline-none resize-none leading-relaxed"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* 2 · Pain points */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              2 · Pain points
            </label>
            <p className="text-xs text-gray-600 mb-3">Each will appear as an option in the dashboard dropdown</p>
            <div className="space-y-2 mb-3">
              {form.painPoints.length === 0 && (
                <div className="text-xs text-gray-600 py-2">No pain points yet</div>
              )}
              {form.painPoints.map((pain, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-xs text-gray-500 font-mono w-4">{i + 1}</span>
                  <span className="flex-1 text-sm">{pain}</span>
                  <button onClick={() => handleRemovePain(i)} className="text-red-400 text-xs hover:text-red-300">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newPain} onChange={e => setNewPain(e.target.value)}
                placeholder='e.g. "Fear of being cheated on"'
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                onKeyDown={e => e.key === 'Enter' && handleAddPain()}
              />
              <button onClick={handleAddPain} disabled={!newPain.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                + Add
              </button>
            </div>
          </div>

          {/* 3 · Headlines */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              3 · Headlines
            </label>
            <p className="text-xs text-gray-600 mb-3">Text that will appear verbatim in the generated image</p>
            <div className="space-y-2 mb-3">
              {form.hooks.length === 0 && (
                <div className="text-xs text-gray-600 py-2">No headlines yet</div>
              )}
              {form.hooks.map((hook, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-xs text-gray-500 font-mono w-4">{i + 1}</span>
                  <span className="flex-1 text-sm">{hook}</span>
                  <button onClick={() => handleRemoveHook(i)} className="text-red-400 text-xs hover:text-red-300">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newHook} onChange={e => setNewHook(e.target.value)}
                placeholder='e.g. "Lose 10kg in 30 days"'
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                onKeyDown={e => e.key === 'Enter' && handleAddHook()}
              />
              <button onClick={handleAddHook} disabled={!newHook.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                + Add
              </button>
            </div>
          </div>

          {/* 4 · Logos */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              4 · Logos
            </label>
            <p className="text-xs text-gray-600 mb-3">Upload multiple logos — users can pick one when generating</p>
            <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={handleLogo} className="hidden" />
            <div className="flex flex-wrap gap-3 mb-3">
              {form.logos.map((logo, i) => (
                <div key={i} className="relative group">
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <img src={logo} alt={`logo ${i + 1}`} className="w-full h-full object-contain p-2" />
                  </div>
                  <button
                    onClick={() => handleRemoveLogo(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs items-center justify-center hidden group-hover:flex shadow-lg">
                    ×
                  </button>
                </div>
              ))}
              <button onClick={() => logoRef.current?.click()}
                className="w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-gray-300 transition-all"
                style={{ background: 'var(--bg)', border: '1.5px dashed var(--border)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span className="text-xs">Add</span>
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {saving ? '...' : saved ? '✓ Saved!' : 'Save'}
            </button>
            <button onClick={() => onDelete(app.code)}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-red-400"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
              Remove app
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
