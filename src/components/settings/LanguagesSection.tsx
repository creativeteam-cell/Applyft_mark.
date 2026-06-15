'use client'

import { useState } from 'react'

interface Language {
  code: string
  name: string
}

interface LanguagesSectionProps {
  languages: Language[]
  onChange: (languages: Language[]) => void
}

export function LanguagesSection({ languages, onChange }: LanguagesSectionProps) {
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  function handleAdd() {
    const code = newCode.toUpperCase().trim()
    const name = newName.trim()
    if (!code || !name) return
    if (languages.find(l => l.code === code)) return // no duplicates
    onChange([...languages, { code, name }])
    setNewCode('')
    setNewName('')
  }

  function handleRemove(code: string) {
    onChange(languages.filter(l => l.code !== code))
  }

  return (
    <div className="rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <h3 className="font-bold mb-1">Localization Languages</h3>
      <p className="text-xs text-gray-500 mb-5">Manage the list of languages shown on the Localization page</p>

      {/* List */}
      <div className="space-y-2 mb-5">
        {languages.length === 0 && (
          <div className="text-sm text-gray-600 py-2">No languages added yet</div>
        )}
        {languages.map(l => (
          <div key={l.code} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span className="font-mono font-bold text-sm w-12" style={{ color: 'var(--accent)' }}>{l.code}</span>
            <span className="flex-1 text-sm">{l.name}</span>
            <button onClick={() => handleRemove(l.code)}
              className="text-red-400 text-xs hover:text-red-300 transition-all">
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="flex gap-3">
        <input
          value={newCode}
          onChange={e => setNewCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="EN"
          maxLength={4}
          className="w-24 rounded-xl px-3 py-2 text-sm outline-none font-mono font-bold"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Full name in English"
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}
          disabled={!newCode.trim() || !newName.trim()}
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          Add
        </button>
      </div>
    </div>
  )
}
