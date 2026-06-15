'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface App { code: string; name: string; active: boolean }
interface Marketer { code: string; name: string }
interface Language { code: string; name: string }

interface LocalizationFolder {
  id: string
  name: string
  driveUrl: string
  languages: string[]
}

type FolderStatus = 'pending' | 'analyzing' | 'translating' | 'uploading' | 'verifying' | 'done' | 'error'

interface FolderProgress {
  folderId: string
  folderName: string
  status: FolderStatus
  error?: string
  completedLangs?: string[]
}

interface JobState {
  jobId: string
  status: 'running' | 'done' | 'error'
  folders: FolderProgress[]
  startedAt: string
  completedAt?: string
}

function folderNumber(name: string): number {
  const match = name.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

const STATUS_LABEL: Record<string, string> = {
  pending:     'Waiting',
  analyzing:   'Analyzing',
  translating: 'Translating',
  uploading:   'Uploading',
  verifying:   'Verifying',
  done:        'Done',
  error:       'Error',
}

const STATUS_COLOR: Record<string, string> = {
  pending:     'var(--text-muted)',
  analyzing:   '#f59e0b',
  translating: '#6366f1',
  uploading:   '#22c55e',
  verifying:   '#06b6d4',
  done:        '#22c55e',
  error:       '#ef4444',
}

export function LocalizationPage() {
  const [apps, setApps] = useState<App[]>([])
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedMarketer, setSelectedMarketer] = useState('')
  const [search, setSearch] = useState('')
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set())

  const [folders, setFolders] = useState<LocalizationFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<LocalizationFolder[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Job tracking
  const [activeJob, setActiveJob] = useState<JobState | null>(null)
  const [localizing, setLocalizing] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const fetchFolders = useCallback(() => {
    if (!selectedApp) return
    setLoading(true)
    setError(null)
    fetch(`/api/localization?app=${selectedApp}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setFolders(data.folders || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedApp])

  // Load apps + marketers
  useEffect(() => {
    fetch('/api/apps')
      .then(r => r.json())
      .then(data => {
        const activeApps = (data.apps || data).filter((a: App) => a.active)
        setApps(activeApps)
        setMarketers(data.marketers || [])
        setLanguages(data.languages || [])

        const savedApp = localStorage.getItem('cs_selected_app')
        const savedMarketer = localStorage.getItem('cs_selected_marketer')

        if (savedApp && activeApps.find((a: App) => a.code === savedApp)) {
          setSelectedApp(savedApp)
        } else if (activeApps.length > 0) {
          setSelectedApp(activeApps[0].code)
        }

        if (savedMarketer) {
          setSelectedMarketer(savedMarketer)
        } else if (data.marketers?.length > 0) {
          setSelectedMarketer(data.marketers[0].code)
        }
      })
  }, [])

  // Fetch folders when app changes
  useEffect(() => {
    fetchFolders()
    setSearchResults([])
  }, [fetchFolders])

  // Drive-wide search
  useEffect(() => {
    const q = search.trim()
    if (!q || !selectedApp) { setSearchResults([]); return }
    const controller = new AbortController()
    setSearchLoading(true)
    const qPad = q.padStart(3, '0')
    fetch(`/api/localization/search?app=${selectedApp}&q=${qPad}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!data.error) setSearchResults(data.folders || []) })
      .catch(() => {})
      .finally(() => setSearchLoading(false))
    return () => controller.abort()
  }, [search, selectedApp])

  // Poll job status
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') return

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/localization/status?jobId=${activeJob.jobId}`)
        const data: JobState = await res.json()
        setActiveJob(data)

        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRef.current!)
          setLocalizing(false)
          setSelected(new Set())

          // Refresh folder list to show new language badges
          setTimeout(() => fetchFolders(), 1500)

          // Browser notification
          if (typeof window !== 'undefined' && 'Notification' in window) {
            const doneCount = data.folders.filter(f => f.status === 'done').length
            const errCount = data.folders.filter(f => f.status === 'error').length
            const msg = data.status === 'done'
              ? `✅ Localization done! ${doneCount} folder${doneCount !== 1 ? 's' : ''} processed.`
              : `⚠️ Finished with ${errCount} error${errCount !== 1 ? 's' : ''}. ${doneCount} folder${doneCount !== 1 ? 's' : ''} ok.`

            if (Notification.permission === 'granted') {
              new Notification('Applyft Mark', { body: msg, icon: '/favicon.ico' })
            }
          }
        }
      } catch {
        // polling failure — keep trying
      }
    }, 3000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob?.jobId, activeJob?.status, fetchFolders])

  function handleAppChange(code: string) {
    localStorage.setItem('cs_selected_app', code)
    setSelectedApp(code)
  }

  function handleMarketerChange(code: string) {
    localStorage.setItem('cs_selected_marketer', code)
    setSelectedMarketer(code)
  }

  function toggleLang(code: string) {
    setSelectedLangs(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  async function handleLocalize() {
    if (selected.size === 0 || selectedLangs.size === 0 || !selectedMarketer) return

    // Request notification permission if not yet granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    const selectedFolders = filtered
      .filter(f => selected.has(f.id))
      .map(f => ({ id: f.id, name: f.name }))

    setLocalizing(true)
    try {
      const res = await fetch('/api/localization/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folders: selectedFolders,
          languages: Array.from(selectedLangs),
          cp: selectedMarketer,
          appCode: selectedApp,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setActiveJob({
        jobId: data.jobId,
        status: 'running',
        startedAt: new Date().toISOString(),
        folders: selectedFolders.map(f => ({
          folderId: f.id,
          folderName: f.name,
          status: 'pending',
          completedLangs: [],
        })),
      })
    } catch (err: any) {
      setLocalizing(false)
      alert(`Failed to start: ${err.message}`)
    }
  }

  const q = search.trim()
  const qPadded = q.padStart(3, '0')
  const localFiltered = q ? folders.filter(f => f.name.includes(qPadded)) : folders
  const localIds = new Set(localFiltered.map(f => f.id))
  const extraFromDrive = searchResults.filter(f => !localIds.has(f.id))
  const merged = q ? [...localFiltered, ...extraFromDrive] : folders
  const filtered = [...merged].sort((a, b) => folderNumber(b.name) - folderNumber(a.name))

  const canLocalize = selected.size > 0 && selectedLangs.size > 0 && !!selectedMarketer && !localizing
  const panelHeight = 104
  const contentTop = 56 + panelHeight

  return (
    <>
      {/* ── Top Panel ──────────────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-40 border-b"
        style={{ top: 56, background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        {/* Row 1: App / Search / Producer / Job counter */}
        <div className="flex items-center gap-4 px-8 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">App</span>
            <select
              value={selectedApp}
              onChange={e => handleAppChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              {apps.map(app => (
                <option key={app.code} value={app.code}>{app.code} — {app.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">№</span>
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="001"
                maxLength={3}
                className="w-16 px-2 py-1.5 rounded-lg text-xs font-mono text-center outline-none"
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${search ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text)',
                }}
              />
              {searchLoading && (
                <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin text-xs">⟳</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Producer</span>
            <select
              value={selectedMarketer}
              onChange={e => handleMarketerChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              {marketers.map(m => (
                <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
              ))}
            </select>
          </div>

          {/* Active job counter */}
          {activeJob && activeJob.status === 'running' && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 font-mono">
              <span className="animate-spin">⟳</span>
              {activeJob.folders.filter(f => f.status === 'done').length}/{activeJob.folders.length} done
            </div>
          )}
        </div>

        {/* Row 2: Language chips + Localize button */}
        <div className="flex items-center gap-2 px-8 pb-2.5 flex-wrap">
          {languages.map(lang => {
            const active = selectedLangs.has(lang.code)
            return (
              <button
                key={lang.code}
                onClick={() => toggleLang(lang.code)}
                title={lang.name}
                className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all"
                style={{
                  background: active ? 'rgba(99,102,241,0.18)' : 'var(--surface)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {lang.code}
              </button>
            )
          })}

          <button
            onClick={handleLocalize}
            disabled={!canLocalize}
            className="ml-auto px-5 py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: canLocalize ? 1 : 0.3,
              cursor: canLocalize ? 'pointer' : 'not-allowed',
            }}
          >
            {localizing ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⟳</span> Localizing...
              </span>
            ) : (
              `✦ Localize${selected.size > 0 ? ` (${selected.size})` : ''}`
            )}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: contentTop + 24, paddingLeft: 32, paddingRight: 32, paddingBottom: 40 }}>
        {error ? (
          <div className="flex items-center justify-center py-32 text-red-400 text-sm">Error: {error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center py-32 text-gray-500 gap-3">
            <span className="animate-spin text-xl">⟳</span>
            Loading folders...
          </div>
        ) : filtered.length === 0 && searchLoading ? (
          <div className="flex items-center justify-center py-32 text-gray-500 gap-2">
            <span className="animate-spin">⟳</span> Searching Drive...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-gray-500 text-sm">
            {q ? `No folders matching "${q}"` : `No folders found for ${selectedApp}`}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(folder => {
              const progress = activeJob?.folders.find(f => f.folderId === folder.id)
              return (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  checked={selected.has(folder.id)}
                  onToggle={() => toggleSelect(folder.id)}
                  progress={progress}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Checkbox({ checked, onChange }: {
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
      style={{
        background: checked ? 'var(--accent)' : 'transparent',
        border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

function FolderRow({ folder, checked, onToggle, progress }: {
  folder: LocalizationFolder
  checked: boolean
  onToggle: () => void
  progress?: FolderProgress
}) {
  const [hovered, setHovered] = useState(false)
  const [fileId, setFileId] = useState<string | null | 'loading' | 'none'>('loading')
  const fetchedRef = useRef(false)

  function handleMouseEnter() {
    setHovered(true)
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetch(`/api/localization/preview?folderId=${folder.id}`)
        .then(r => r.json())
        .then(data => setFileId(data.fileId || 'none'))
        .catch(() => setFileId('none'))
    }
  }

  const isActive = progress && progress.status !== 'pending'
  const spinning = progress && ['analyzing', 'translating', 'uploading', 'verifying'].includes(progress.status)

  return (
    <div
      className="relative flex items-center gap-3 px-5 py-3 rounded-xl"
      style={{
        background: checked ? 'rgba(99,102,241,0.07)' : 'var(--surface)',
        border: `1px solid ${checked ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <Checkbox checked={checked} onChange={onToggle} />

      <a
        href={folder.driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-mono hover:text-blue-400 transition-colors flex-shrink-0"
        style={{ color: 'var(--text)' }}
      >
        {folder.name}
      </a>

      {/* Progress status badge */}
      {isActive && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {spinning && (
            <span className="animate-spin text-xs" style={{ color: STATUS_COLOR[progress!.status] }}>⟳</span>
          )}
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-md"
            style={{
              color: STATUS_COLOR[progress!.status] || 'var(--text-muted)',
              background: `${STATUS_COLOR[progress!.status] || 'var(--text-muted)'}22`,
              border: `1px solid ${STATUS_COLOR[progress!.status] || 'var(--border)'}44`,
            }}
          >
            {STATUS_LABEL[progress!.status] || progress!.status}
          </span>
          {progress!.completedLangs && progress!.completedLangs.length > 0 && (
            <span className="text-xs text-gray-500 font-mono">
              {progress!.completedLangs.join(' ')}
            </span>
          )}
          {progress!.status === 'error' && progress!.error && (
            <span className="text-xs text-red-400 cursor-help" title={progress!.error}>⚠</span>
          )}
        </div>
      )}

      {/* Existing language badges */}
      <div className="flex-1 flex items-center gap-1.5 flex-wrap justify-end">
        {folder.languages.length === 0 ? (
          <span className="text-xs text-gray-600 font-mono">—</span>
        ) : (
          folder.languages.map(lang => (
            <span
              key={lang}
              className="px-2 py-0.5 rounded-md text-xs font-mono font-medium"
              style={{
                background: lang === 'EN' ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                border: `1px solid ${lang === 'EN' ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                color: lang === 'EN' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {lang}
            </span>
          ))
        )}
      </div>

      {/* Hover preview popup */}
      {hovered && (
        <div
          className="absolute left-0 z-50 rounded-xl overflow-hidden shadow-2xl pointer-events-none"
          style={{
            bottom: 'calc(100% + 6px)',
            width: 160,
            aspectRatio: '4/5',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {fileId === 'loading' ? (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-gray-500 animate-spin text-lg">⟳</span>
            </div>
          ) : fileId === 'none' ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-2xl">🚧</span>
              <span className="text-xs text-gray-500">Not created yet</span>
            </div>
          ) : (
            <img
              src={`/api/image?id=${fileId}`}
              alt={folder.name}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}
    </div>
  )
}
