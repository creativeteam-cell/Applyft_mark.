'use client'

// v2.2
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

// Module-level cache — survives tab switches, cleared on manual refresh
const _cache: {
  meta: { apps: App[]; marketers: Marketer[]; languages: Language[] } | null
  folders: Record<string, LocalizationFolder[]>
} = { meta: null, folders: {} }

type FolderStatus = 'pending' | 'analyzing' | 'translating' | 'uploading' | 'verifying' | 'done' | 'error'

interface FolderProgress {
  folderId: string
  folderName: string
  status: FolderStatus
  error?: string
  completedLangs?: string[]
  uploadInfo?: string
}

interface JobState {
  status: 'running' | 'done' | 'error'
  folders: FolderProgress[]
}

// Module-level job store — SSE survives tab switches
const _job: {
  state: JobState | null
  localizing: boolean
  abort: AbortController | null
  listeners: Set<() => void>
  notify: () => void
  subscribe: (fn: () => void) => () => void
} = {
  state: null,
  localizing: false,
  abort: null,
  listeners: new Set(),
  notify() { this.listeners.forEach(fn => fn()) },
  subscribe(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } },
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

  const [activeJob, setActiveJob] = useState<JobState | null>(() => _job.state)
  const [localizing, setLocalizing] = useState(() => _job.localizing)

  // Subscribe to job store — component gets updates even after remounting
  useEffect(() => {
    return _job.subscribe(() => {
      setActiveJob(_job.state)
      setLocalizing(_job.localizing)
    })
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const fetchFolders = useCallback((force = false) => {
    if (!selectedApp) return
    if (!force && _cache.folders[selectedApp]) {
      setFolders(_cache.folders[selectedApp])
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/api/localization?app=${selectedApp}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const result = data.folders || []
        _cache.folders[selectedApp] = result
        setFolders(result)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedApp])

  useEffect(() => {
    if (_cache.meta) {
      const { apps: cachedApps, marketers: cachedMarketers, languages: cachedLanguages } = _cache.meta
      setApps(cachedApps)
      setMarketers(cachedMarketers)
      setLanguages(cachedLanguages)

      const savedApp = localStorage.getItem('cs_selected_app')
      const savedMarketer = localStorage.getItem('cs_selected_marketer')
      if (savedApp && cachedApps.find((a: App) => a.code === savedApp)) {
        setSelectedApp(savedApp)
      } else if (cachedApps.length > 0) {
        setSelectedApp(cachedApps[0].code)
      }
      if (savedMarketer) setSelectedMarketer(savedMarketer)
      else if (cachedMarketers.length > 0) setSelectedMarketer(cachedMarketers[0].code)
      return
    }

    fetch('/api/apps')
      .then(r => r.json())
      .then(data => {
        const activeApps = (data.apps || data).filter((a: App) => a.active)
        const marketersData = data.marketers || []
        const languagesData = data.languages || []
        _cache.meta = { apps: activeApps, marketers: marketersData, languages: languagesData }
        setApps(activeApps)
        setMarketers(marketersData)
        setLanguages(languagesData)

        const savedApp = localStorage.getItem('cs_selected_app')
        const savedMarketer = localStorage.getItem('cs_selected_marketer')

        if (savedApp && activeApps.find((a: App) => a.code === savedApp)) {
          setSelectedApp(savedApp)
        } else if (activeApps.length > 0) {
          setSelectedApp(activeApps[0].code)
        }

        if (savedMarketer) {
          setSelectedMarketer(savedMarketer)
        } else if (marketersData.length > 0) {
          setSelectedMarketer(marketersData[0].code)
        }
      })
  }, [])

  useEffect(() => {
    fetchFolders()
    setSearchResults([])
  }, [fetchFolders])

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

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    const selectedFolders = filtered
      .filter(f => selected.has(f.id))
      .map(f => ({ id: f.id, name: f.name }))

    _job.abort?.abort()
    const controller = new AbortController()
    _job.abort = controller
    _job.state = {
      status: 'running',
      folders: selectedFolders.map(f => ({
        folderId: f.id,
        folderName: f.name,
        status: 'pending' as const,
        completedLangs: [],
      })),
    }
    _job.localizing = true
    _job.notify()
    setSelected(new Set())

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
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Failed to start' }))
        throw new Error(err.error || 'Failed to start')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const snapshot = JSON.parse(line.slice(6))
            _job.state = snapshot
            _job.notify()

            if (snapshot.status === 'done' || snapshot.status === 'error') {
              _job.localizing = false
              _job.abort = null
              _job.notify()
              setTimeout(() => fetchFolders(), 1500)

              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                const doneCount = (snapshot.folders as FolderProgress[]).filter(f => f.status === 'done').length
                const errCount = (snapshot.folders as FolderProgress[]).filter(f => f.status === 'error').length
                const msg = snapshot.status === 'done'
                  ? '✅ Localization done! ' + doneCount + ' folder' + (doneCount !== 1 ? 's' : '') + ' processed.'
                  : '⚠️ Finished with ' + errCount + ' error' + (errCount !== 1 ? 's' : '') + '. ' + doneCount + ' ok.'
                new Notification('Applyft Mark', { body: msg, icon: '/favicon.ico' })
              }
            }
          } catch {
            // malformed JSON chunk
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      _job.localizing = false
      _job.abort = null
      _job.notify()
      alert('Localization failed: ' + err.message)
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
      <div
        className="fixed left-0 right-0 z-40 border-b"
        style={{ top: 56, background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
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
                <option key={app.code} value={app.code}>{app.code} &mdash; {app.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">No.</span>
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="001"
                maxLength={3}
                className="w-16 px-2 py-1.5 rounded-lg text-xs font-mono text-center outline-none"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid ' + (search ? 'var(--accent)' : 'var(--border)'),
                  color: 'var(--text)',
                }}
              />
              {searchLoading && (
                <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin text-xs">o</span>
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
                <option key={m.code} value={m.code}>{m.code} &mdash; {m.name}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {activeJob && activeJob.status === 'running' && (
              <span className="text-xs text-gray-400 font-mono flex items-center gap-2">
                <span className="animate-spin">~</span>
                {activeJob.folders?.filter(f => f.status === 'done').length ?? 0}/{activeJob.folders?.length ?? 0} done
              </span>
            )}
            <button
              onClick={() => { delete _cache.folders[selectedApp]; fetchFolders(true) }}
              disabled={loading}
              title="Refresh folders"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <span className={loading ? 'animate-spin inline-block' : ''} style={{ fontSize: 14 }}>⟳</span>
            </button>
          </div>
        </div>

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
                  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
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
            {localizing
              ? 'Localizing...'
              : ('Localize' + (selected.size > 0 ? ' (' + selected.size + ')' : ''))}
          </button>
        </div>
      </div>

      <div style={{ paddingTop: contentTop + 24, paddingLeft: 32, paddingRight: 32, paddingBottom: 40 }}>
        {error ? (
          <div className="flex items-center justify-center py-32 text-red-400 text-sm">Error: {error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center py-32 text-gray-500 gap-3">
            <span className="animate-spin text-xl">~</span>
            Loading folders...
          </div>
        ) : filtered.length === 0 && searchLoading ? (
          <div className="flex items-center justify-center py-32 text-gray-500 gap-2">
            <span className="animate-spin">~</span> Searching Drive...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-gray-500 text-sm">
            {q ? 'No folders matching "' + q + '"' : 'No folders found for ' + selectedApp}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(folder => {
              const progress = activeJob?.folders?.find(f => f.folderId === folder.id)
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

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
      style={{
        background: checked ? 'var(--accent)' : 'transparent',
        border: '1.5px solid ' + (checked ? 'var(--accent)' : 'var(--border)'),
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
  const [fileId, setFileId] = useState<string | 'loading' | 'none'>('loading')

  useEffect(() => {
    fetch('/api/localization/preview?folderId=' + folder.id)
      .then(r => r.json())
      .then(data => setFileId(data.fileId || 'none'))
      .catch(() => setFileId('none'))
  }, [folder.id])

  const isActive = progress && progress.status !== 'pending'
  const spinning = progress && ['analyzing', 'translating', 'uploading', 'verifying'].includes(progress.status)

  return (
    <div
      className="relative flex items-center gap-3 px-4 rounded-xl"
      style={{
        minHeight: 56,
        background: checked ? 'rgba(99,102,241,0.07)' : 'var(--surface)',
        border: '1px solid ' + (checked ? 'rgba(99,102,241,0.35)' : 'var(--border)'),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Checkbox checked={checked} onChange={onToggle} />

      {/* Inline thumbnail */}
      <div
        className="flex-shrink-0 rounded-lg overflow-hidden"
        style={{ width: 36, height: 46, background: 'var(--border)' }}
      >
        {fileId === 'loading' ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-600 text-xs animate-pulse">·</span>
          </div>
        ) : fileId === 'none' ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-600 text-xs">?</span>
          </div>
        ) : (
          <img
            src={'/api/image?id=' + fileId}
            alt={folder.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <a
        href={folder.driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-mono hover:text-blue-400 transition-colors flex-shrink-0"
        style={{ color: 'var(--text)' }}
      >
        {folder.name}
      </a>

      {isActive && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {spinning && (
            <span className="animate-spin text-xs" style={{ color: STATUS_COLOR[progress!.status] }}>~</span>
          )}
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-md"
            style={{
              color: STATUS_COLOR[progress!.status] || 'var(--text-muted)',
              background: (STATUS_COLOR[progress!.status] || 'var(--text-muted)') + '22',
              border: '1px solid ' + (STATUS_COLOR[progress!.status] || 'var(--border)') + '44',
            }}
          >
            {STATUS_LABEL[progress!.status] || progress!.status}
          </span>
          {progress!.completedLangs && progress!.completedLangs.length > 0 && (
            <span className="text-xs text-gray-500 font-mono">
              {progress!.completedLangs.join(' ')}
            </span>
          )}
          {progress!.uploadInfo && (
            <span className="text-xs text-gray-400 font-mono">{progress!.uploadInfo}</span>
          )}
          {progress!.error && (
            <span className="text-xs text-red-400 font-mono break-all">
              ! {progress!.error}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 flex items-center gap-1.5 flex-wrap justify-end">
        {folder.languages.length === 0 ? (
          <span className="text-xs text-gray-600 font-mono">-</span>
        ) : (
          folder.languages.map(lang => (
            <span
              key={lang}
              className="px-2 py-0.5 rounded-md text-xs font-mono font-medium"
              style={{
                background: lang === 'EN' ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                border: '1px solid ' + (lang === 'EN' ? 'rgba(99,102,241,0.4)' : 'var(--border)'),
                color: lang === 'EN' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {lang}
            </span>
          ))
        )}
      </div>

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
              <span className="text-gray-500 animate-spin text-lg">~</span>
            </div>
          ) : fileId === 'none' ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-sm text-gray-500">Not created yet</span>
            </div>
          ) : (
           
            <img
              src={'/api/image?id=' + fileId}
              alt={folder.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}
    </div>
  )
}
