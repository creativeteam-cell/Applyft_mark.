'use client'

// Общие заготовки промптов ("скилы"): интерфейс, хук загрузки, модалка управления
// и helpers для /command → Mix. Используются на вкладках Image и Video.
import { useState, useEffect, useCallback } from 'react'

export interface PromptTemplate {
  id: string
  name: string
  command: string        // тег без слэша, вызов через /command
  body: string
  uses: number
  createdBy: string
  createdByName: string
  createdAt: string
}

// Хук: список заготовок + перезагрузка
export function usePromptTemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const load = useCallback(() => {
    fetch('/api/prompt-templates').then(r => r.json()).then(d => { if (d.templates) setTemplates(d.templates) }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  return { templates, setTemplates, reload: load }
}

// Ищем в тексте тег /command, совпадающий с одной из заготовок
export function findTemplateInPrompt(text: string, templates: PromptTemplate[]): PromptTemplate | null {
  const tokens = text.match(/\/([a-zA-Z0-9_-]+)/g)
  if (!tokens) return null
  for (const tok of tokens) {
    const cmd = tok.slice(1).toLowerCase()
    const t = templates.find(pt => pt.command === cmd)
    if (t) return t
  }
  return null
}

// Убираем тег /command из пользовательского текста
export function stripCommand(text: string, command: string): string {
  return text.replace(new RegExp(`\\/${command}\\b`, 'gi'), '').replace(/\s{2,}/g, ' ').trim()
}

// Кнопка Mix (появляется вместо AI/Enhance, когда найден тег заготовки)
export function MixButton({ mixing, command, onClick }: { mixing: boolean; command: string; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={mixing} title={`Mix with /${command}`}
      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-all"
      style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
      {mixing ? (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7.5 7.5"/><path d="M3 3l7.5 7.5"/><path d="M12 12v9"/>
        </svg>
      )}
      {mixing ? 'Mixing…' : 'Mix'}
    </button>
  )
}

// Кнопка открытия заготовок
export function TemplatesButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Prompt templates"
      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-all"
      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid transparent' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      Templates
    </button>
  )
}

// Модалка управления заготовками промптов, общими для всех.
export function PromptTemplatesModal({ templates, myEmail, onClose, onChanged }: {
  templates: PromptTemplate[]; myEmail: string; onClose: () => void; onChanged: () => void
}) {
  const [editing, setEditing] = useState<{ mode: 'new' } | { mode: 'edit'; tpl: PromptTemplate } | null>(null)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function openNew() { setEditing({ mode: 'new' }); setName(''); setCommand(''); setBody(''); setErr('') }
  function openEdit(t: PromptTemplate) { setEditing({ mode: 'edit', tpl: t }); setName(t.name); setCommand(t.command); setBody(t.body); setErr('') }
  function cleanCmd(v: string) { return v.replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) }

  async function save() {
    if (!name.trim() || !cleanCmd(command) || !body.trim()) { setErr('Fill name, command and pre-prompt'); return }
    setSaving(true); setErr('')
    try {
      if (editing?.mode === 'new') {
        const res = await fetch('/api/prompt-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, command, body }) })
        const d = await res.json(); if (d.error) throw new Error(d.error)
      } else if (editing?.mode === 'edit') {
        const res = await fetch('/api/prompt-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.tpl.id, name, command, body }) })
        const d = await res.json(); if (d.error) throw new Error(d.error)
      }
      setSaving(false); setEditing(null); onChanged()
    } catch (e: any) { setErr(e.message); setSaving(false) }
  }

  async function remove(t: PromptTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return
    try {
      const res = await fetch('/api/prompt-templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) })
      const d = await res.json(); if (d.error) throw new Error(d.error)
      onChanged()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl p-5 w-full max-w-lg max-h-[85vh] flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">Prompt templates</span>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">×</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
          Big reusable pre-prompts. Type your short prompt then <code>/command</code> — the button turns into <b>Mix</b> and merges them.
        </p>

        {!editing && (
          <>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-3">
              {templates.length === 0 && <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>No templates yet.</p>}
              {templates.map(t => (
                <div key={t.id} className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{t.name}</span>
                        <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>/{t.command}</code>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>by {t.createdByName} · used {t.uses}×</p>
                    </div>
                    {t.createdBy === myEmail && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(t)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}>Edit</button>
                        <button onClick={() => remove(t)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>Delete</button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] mt-1.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.body}</p>
                </div>
              ))}
            </div>
            <button onClick={openNew} className="py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>+ New template</button>
          </>
        )}

        {editing && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name (e.g. Product hero shot)" maxLength={60}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="flex items-center gap-1 mb-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <input value={command} onChange={e => setCommand(cleanCmd(e.target.value))} placeholder="command (e.g. mipromt)" maxLength={32}
                className="flex-1 text-sm outline-none bg-transparent" style={{ color: 'var(--text)' }} />
            </div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} maxLength={8000}
              placeholder="The big detailed pre-prompt with all the important details, structure and quality guidance…"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-2 flex-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            {err && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{err}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>
                {saving ? '…' : editing.mode === 'new' ? 'Create' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)} disabled={saving} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
