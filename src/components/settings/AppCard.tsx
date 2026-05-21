'use client'

import { useState } from 'react'

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

interface AppCardProps {
  app: App
  expanded: boolean
  onExpand: () => void
  onSave: (app: App) => Promise<void>
  onDelete: (code: string) => Promise<void>
}

const STYLE_OPTIONS = [
  'Dramatic & emotional',
  'Minimalist & clean',
  'Bold & bright',
  'Technological & modern',
  'Warm & friendly',
  'Dark & mysterious',
]

export function AppCard({ app, expanded, onExpand, onSave, onDelete }: AppCardProps) {
  const [form, setForm] = useState({ ...app, painPoints: app.painPoints || '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
        <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
          {app.code}
        </div>
        <div className="flex-1">
          <div className="font-semibold">{app.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {app.description ? app.description.slice(0, 60) + '...' : 'No description yet'}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-transform text-gray-500 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-6 pb-6 border-t space-y-5" style={{ borderColor: 'var(--border)' }}>
          <div className="pt-5 space-y-4">

            {/* Description */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
                Product description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={5}
                placeholder={`App name and abbreviation: ${app.code} — ${app.name}\n\nWhat is the app? What does it do?\nTarget audience: who uses it?\nKey features: what makes it unique?`}
                className="w-full rounded-xl p-4 text-sm outline-none resize-none transition-all leading-relaxed"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Pain points */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
                Pain points & ad topics
              </label>
              <textarea
                value={form.painPoints}
                onChange={e => setForm({ ...form, painPoints: e.target.value })}
                rows={4}
                placeholder={`What are the user's emotional pain points?\nWhat topics work best for ads?\ne.g. "Fear of being cheated on", "Worry about child's safety", "Missing loved ones"`}
                className="w-full rounded-xl p-4 text-sm outline-none resize-none transition-all leading-relaxed"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Style */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
                Visual style & mood
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {STYLE_OPTIONS.map(s => (
                  <button key={s} onClick={() => setForm({ ...form, style: s })}
                    className="px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: form.style === s ? 'var(--accent)' : 'var(--bg)',
                      border: `1px solid ${form.style === s ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <input
                value={form.style}
                onChange={e => setForm({ ...form, style: e.target.value })}
                placeholder="Or describe the style in your own words..."
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Colors */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
                Brand colors
              </label>
              <input
                value={form.colors}
                onChange={e => setForm({ ...form, colors: e.target.value })}
                placeholder="e.g. deep blue #1a2f9e, orange #f97316, white"
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Restrictions */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
                What NOT to do
              </label>
              <input
                value={form.restrictions}
                onChange={e => setForm({ ...form, restrictions: e.target.value })}
                placeholder="e.g. no children, no explicit content, avoid stock photo look"
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {saving ? '...' : saved ? '✓ Saved!' : 'Save'}
              </button>
              <button onClick={() => onDelete(app.code)}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all text-red-400"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                Remove app
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
