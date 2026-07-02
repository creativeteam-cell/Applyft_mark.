'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { AppCard } from './AppCard'
import { AddAppModal } from './AddAppModal'
import { MarketersSection } from './MarketersSection'
import { LanguagesSection } from './LanguagesSection'

interface App {
  code: string; name: string; description: string
  painPoints: string[]; hooks: string[]; active: boolean; logoBase64?: string
}
interface Marketer { code: string; name: string }
interface Language { code: string; name: string }
interface UserStat { email: string; name: string; image: string; imageCount: number }

function colorFromString(str: string) {
  const colors = ['#4f6ef7', '#e05c8a', '#34a853', '#fbbc05', '#e8453c', '#9c27b0', '#00acc1']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function SectionHeader({ title, count, expanded, onToggle, badge }: {
  title: string; count?: number; expanded: boolean; onToggle: () => void; badge?: string
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <span className="font-semibold">{title}</span>
        {badge && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
            {badge}
          </span>
        )}
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

function AdminPanel({ currentEmail }: { currentEmail: string }) {
  const [stats, setStats] = useState<UserStat[]>([])
  const [adminEmails, setAdminEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newAdmin, setNewAdmin] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      setStats(data.users || [])
      setAdminEmails(data.adminEmails || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  async function handleAddAdmin() {
    if (!newAdmin.trim()) return
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAdmin.trim() }),
      })
      const data = await res.json()
      if (data.error) { setAddError(data.error); return }
      setAdminEmails(data.adminEmails)
      setNewAdmin('')
    } catch { setAddError('Failed to add') }
    setAdding(false)
  }

  async function handleRemoveAdmin(email: string) {
    const res = await fetch('/api/admin/admins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!data.error) setAdminEmails(data.adminEmails)
  }

  if (loading) return <div className="text-sm px-2" style={{ color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div className="flex flex-col gap-6">

      {/* Admins */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          Administrators
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {adminEmails.map(email => (
            <div key={email} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="text-sm">{email}</span>
                {email === currentEmail && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: 'rgba(79,110,247,0.1)', color: 'var(--accent)' }}>you</span>
                )}
              </div>
              {email !== currentEmail && (
                <button onClick={() => handleRemoveAdmin(email)}
                  className="text-xs px-2 py-1 rounded-lg transition-all hover:bg-red-500/10"
                  style={{ color: '#f87171' }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newAdmin}
            onChange={e => setNewAdmin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddAdmin()}
            placeholder="email@applyft.co"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <button onClick={handleAddAdmin} disabled={adding || !newAdmin.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: newAdmin.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: newAdmin.trim() ? '#fff' : 'var(--text-muted)' }}>
            Add
          </button>
        </div>
        {addError && <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>{addError}</p>}
      </div>

      {/* Usage stats */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          Image generations
        </div>
        {stats.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {stats.map(u => (
              <div key={u.email} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2.5">
                  {u.image ? (
                    <img src={u.image} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white"
                      style={{ background: colorFromString(u.email) }}>
                      {initials(u.name)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold font-mono">{u.imageCount}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>images</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { data: session } = useSession()
  const currentEmail = session?.user?.email ?? ''

  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [appsOpen, setAppsOpen] = useState(false)
  const [producersOpen, setProducersOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  // Check admin status server-side
  useEffect(() => {
    if (!currentEmail) return
    fetch('/api/admin/stats').then(r => {
      setIsAdmin(r.ok)
      setAdminChecked(true)
    }).catch(() => setAdminChecked(true))
  }, [currentEmail])

  useEffect(() => { loadApps() }, [])

  async function loadApps() {
    setLoading(true)
    const res = await fetch('/api/apps')
    const data = await res.json()
    setApps(data.apps || data)
    if (data.marketers) setMarketers(data.marketers)
    if (data.languages) setLanguages(data.languages)
    setLoading(false)
  }

  async function handleSaveApp(app: App) {
    await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'app', data: app }) })
    setExpandedApp(null)
    await loadApps()
  }
  async function handleDeleteApp(code: string) {
    if (!confirm(`Remove ${code}?`)) return
    await fetch(`/api/apps?code=${code}`, { method: 'DELETE' })
    await loadApps()
  }
  async function handleAddApp(code: string, name: string) {
    await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'app', data: { code, name } }) })
    setShowAdd(false)
    await loadApps()
  }
  async function handleSaveMarketers(updated: Marketer[]) {
    setMarketers(updated)
    await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'marketers', data: updated }) })
  }
  async function handleSaveLanguages(updated: Language[]) {
    setLanguages(updated)
    await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'languages', data: updated }) })
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10" style={{ marginTop: '56px' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage apps and producers</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--accent)' }}>
          + Add App
        </button>
      </div>

      <div className="mb-6">
        <SectionHeader title="Apps" count={apps.length} expanded={appsOpen} onToggle={() => setAppsOpen(!appsOpen)} />
        {appsOpen && (loading ? <div className="text-gray-500 text-sm px-2">Loading...</div> : (
          <div className="space-y-3">
            {apps.map(app => (
              <AppCard key={app.code} app={app} expanded={expandedApp === app.code}
                onExpand={() => setExpandedApp(expandedApp === app.code ? null : app.code)}
                onSave={handleSaveApp} onDelete={handleDeleteApp} />
            ))}
          </div>
        ))}
      </div>

      <div className="mb-6">
        <SectionHeader title="Producers" count={marketers.length} expanded={producersOpen} onToggle={() => setProducersOpen(!producersOpen)} />
        {producersOpen && <MarketersSection marketers={marketers} onChange={handleSaveMarketers} />}
      </div>

      <div className="mb-6">
        <SectionHeader title="Languages" count={languages.length} expanded={languagesOpen} onToggle={() => setLanguagesOpen(!languagesOpen)} />
        {languagesOpen && <LanguagesSection languages={languages} onChange={handleSaveLanguages} />}
      </div>

      {adminChecked && isAdmin && (
        <div className="mb-6 mt-10">
          <SectionHeader title="Admin Panel" expanded={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} badge="Admin" />
          {adminOpen && (
            <div className="px-1">
              <AdminPanel currentEmail={currentEmail} />
            </div>
          )}
        </div>
      )}

      {showAdd && <AddAppModal onAdd={handleAddApp} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
