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
    reader.onload = () => setForm({ ...form, logoBase64: reader.result as string })
    reader.readAsDataURL(file)
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
          {form.logoBase64
            ? <img src={form.logoBase64} alt="logo" className="w-full h-full object-contain p-1" />
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
          <span>{form.hooks.length} hooks</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-transform text-gray-500 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t px-6 pb-6 pt-5 space-y-6" style={{ borderColor: 'var(--border)' }}>

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

          {/* 3 · Hooks */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              3 · Hooks
            </label>
            <p className="text-xs text-gray-600 mb-3">Text that will appear verbatim in the generated image</p>
            <div className="space-y-2 mb-3">
              {form.hooks.length === 0 && (
                <div className="text-xs text-gray-600 py-2">No hooks yet</div>
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

          {/* 4 · Logo */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              4 · Logo (PNG)
            </label>
            <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleLogo} className="hidden" />
            <div className="flex items-center gap-4">
              {form.logoBase64 ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <img src={form.logoBase64} alt="logo" className="w-full h-full object-contain p-2" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-gray-600"
                  style={{ background: 'var(--bg)', border: '1px dashed var(--border)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => logoRef.current?.click()}
                  className="px-4 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {form.logoBase64 ? 'Change logo' : 'Upload logo'}
                </button>
                {form.logoBase64 && (
                  <button onClick={() => setForm({ ...form, logoBase64: '' })}
                    className="px-4 py-2 rounded-xl text-sm text-red-400"
                    style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    Remove
                  </button>
                )}
              </div>
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
