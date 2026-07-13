'use client'

// Секция Settings: выученные правила ("память команды").
// Правила создаются автоматически из фиксов СП (см. lib/ruleLearner.ts).
// Здесь их можно посмотреть, выключить, отредактировать или удалить.
import { useState, useEffect } from 'react'

interface LearnedRule {
  id: string
  rule: string
  element: string
  sizes: string[]
  appCodes: string[]
  scope?: 'team' | 'personal'
  weight: number
  examples: string[]
  active: boolean
  createdBy: string
  createdAt: string
}

export function LearnedRulesSection({ currentEmail }: { currentEmail?: string }) {
  const [rules, setRules] = useState<LearnedRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    fetch('/api/rules')
      .then(r => r.json())
      .then(d => { if (d.rules) setRules(d.rules); else if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function toggleActive(rule: LearnedRule) {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))
    await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, active: !rule.active }),
    }).catch(() => {})
  }

  async function saveEdit(id: string) {
    const text = editText.trim()
    if (!text) return
    setRules(prev => prev.map(r => r.id === id ? { ...r, rule: text } : r))
    setEditingId(null)
    await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rule: text }),
    }).catch(() => {})
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this learned rule?')) return
    setRules(prev => prev.filter(r => r.id !== id))
    await fetch('/api/rules', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }

  if (loading) return <p className="text-sm px-4 py-3" style={{ color: 'var(--text-muted)' }}>Loading rules...</p>
  if (error) return <p className="text-sm px-4 py-3" style={{ color: '#f87171' }}>{error}</p>

  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Rules learned automatically from producers&apos; fix instructions. Active rules are injected into
        generation and resize prompts for matching formats/apps. Toggle off or delete anything wrong.
      </p>
      {rules.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No learned rules yet — they will appear as producers apply fixes.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(rule => {
            const isPersonal = (rule.scope ?? 'team') === 'personal'
            const isMine = !rule.createdBy || rule.createdBy === currentEmail
            const canManage = !isPersonal || isMine
            return (
            <div key={rule.id} className="rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', opacity: rule.active ? 1 : 0.5 }}>
              <div className="flex items-start gap-3">
                <button onClick={() => canManage && toggleActive(rule)} title={!canManage ? 'Personal rule of another user' : rule.active ? 'Disable' : 'Enable'}
                  disabled={!canManage}
                  className="relative w-8 h-4.5 rounded-full transition-all flex-shrink-0 mt-0.5"
                  style={{ background: rule.active ? 'var(--accent)' : 'rgba(255,255,255,0.1)', height: 18, width: 32 }}>
                  <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all"
                    style={{ left: rule.active ? 16 : 2 }} />
                </button>
                <div className="flex-1 min-w-0">
                  {editingId === rule.id ? (
                    <div className="flex gap-2">
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(rule.id); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        className="flex-1 rounded px-2 py-1 text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text)' }} />
                      <button onClick={() => saveEdit(rule.id)} className="text-xs px-2" style={{ color: 'var(--accent)' }}>Save</button>
                    </div>
                  ) : (
                    <p className="text-sm cursor-pointer" onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}>
                      {rule.rule}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        background: isPersonal ? 'rgba(251,188,5,0.12)' : 'rgba(52,168,83,0.12)',
                        color: isPersonal ? '#fbbc05' : '#34a853',
                      }}>
                      {isPersonal ? `personal · ${isMine ? 'you' : (rule.createdBy.split('@')[0] || 'unknown')}` : 'team'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(79,110,247,0.12)', color: 'var(--accent)' }}>{rule.element}</span>
                    {(rule.sizes.length ? rule.sizes : ['all sizes']).map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{s}</span>
                    ))}
                    {rule.appCodes.map(a => (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{a}</span>
                    ))}
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>×{rule.weight}</span>
                  </div>
                  {expandedId === rule.id && rule.examples.length > 0 && (
                    <div className="mt-2 pl-2" style={{ borderLeft: '2px solid var(--border)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Original fixes:</p>
                      {rule.examples.map((ex, i) => (
                        <p key={i} className="text-xs italic" style={{ color: 'var(--text-muted)' }}>&laquo;{ex}&raquo;</p>
                      ))}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setEditingId(rule.id); setEditText(rule.rule) }} title="Edit"
                      className="w-6 h-6 flex items-center justify-center rounded opacity-50 hover:opacity-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={() => deleteRule(rule.id)} title="Delete"
                      className="w-6 h-6 flex items-center justify-center rounded opacity-50 hover:opacity-100" style={{ color: '#f87171' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
