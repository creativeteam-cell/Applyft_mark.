'use client'

import { useEffect, useRef, useState } from 'react'

interface App { code: string; name: string; active: boolean }
interface Marketer { code: string; name: string }
interface Language { code: string; name: string }

interface LocalizationFolder {
  id: string
  name: string
  driveUrl: string
  languages: string[]
}


// Extracts the numeric part from folder name, e.g. "ST_S_052_a" → 52
function folderNumber(name: string): number {
  const match = name.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
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

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Load apps + marketers, restore selection from localStorage (synced with dashboard)
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

  // Fetch all folders when app changes
  useEffect(() => {
    if (!selectedApp) return
    setLoading(true)
    setError(null)
    setFolders([])
    setSearchResults([])
    fetch(`/api/localization?app=${selectedApp}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setFolders(data.folders || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedApp])

  // Drive-wide search when query changes
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

  const q = search.trim()
  const qPadded = q.padStart(3, '0')
  const localFiltered = q ? folders.filter(f => f.name.includes(qPadded)) : folders
  const localIds = new Set(localFiltered.map(f => f.id))
  const extraFromDrive = searchResults.filter(f => !localIds.has(f.id))
  const merged = q ? [...localFiltered, ...extraFromDrive] : folders
  const filtered = [...merged].sort((a, b) => folderNumber(b.name) - folderNumber(a.name))

  const panelHeight = 104 // 56px header + ~104px panel (2 rows)
  const contentTop = 56 + panelHeight

  return (
    <>
      {/* ── Top Panel ──────────────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-40 border-b"
        style={{ top: 56, background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        {/* Row 1: App / Search / Producer */}
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
            disabled
            className="ml-auto px-5 py-1.5 rounded-xl text-sm font-semibold opacity-30 cursor-not-allowed"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            ✦ Localize
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
            {filtered.map(folder => (
              <FolderRow
                key={folder.id}
                folder={folder}
                checked={selected.has(folder.id)}
                onToggle={() => toggleSelect(folder.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Checkbox({ checked, indeterminate, onChange }: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
      style={{
        background: checked || indeterminate ? 'var(--accent)' : 'transparent',
        border: `1.5px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {indeterminate && !checked ? (
        <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
          <rect x="0" y="0.5" width="8" height="1" rx="0.5" fill="white"/>
        </svg>
      ) : checked ? (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : null}
    </button>
  )
}

function FolderRow({ folder, checked, onToggle }: {
  folder: LocalizationFolder
  checked: boolean
  onToggle: () => void
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

      {/* Folder name — link to Drive */}
      <a
        href={folder.driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-mono hover:text-blue-400 transition-colors flex-shrink-0"
        style={{ color: 'var(--text)' }}
      >
        {folder.name}
      </a>

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
