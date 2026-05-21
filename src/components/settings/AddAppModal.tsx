'use client'

import { useState } from 'react'

interface AddAppModalProps {
  onAdd: (code: string, name: string) => Promise<void>
  onClose: () => void
}

export function AddAppModal({ onAdd, onClose }: AddAppModalProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!code.trim() || !name.trim()) return
    setLoading(true)
    try {
      await onAdd(code.toUpperCase().trim(), name.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        
        <h3 className="text-lg font-bold mb-6">Add New App</h3>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              Abbreviation
            </label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="e.g. ST"
              maxLength={4}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono font-bold tracking-widest"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
              }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-mono">
              Full name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Stride"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!code.trim() || !name.trim() || loading}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? 'Adding...' : 'Add App'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'var(--border)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
