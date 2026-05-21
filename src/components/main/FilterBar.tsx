'use client'

interface App { code: string; name: string; painPoints?: string[] }
interface Marketer { code: string; name: string }

interface FilterBarProps {
  apps: App[]
  selectedApp: string
  onAppChange: (code: string) => void
  selectedPain: string
  onPainChange: (pain: string) => void
  selectedMarketer: string
  onMarketerChange: (code: string) => void
  marketers: Marketer[]
}

export function FilterBar({
  apps, selectedApp, onAppChange,
  selectedPain, onPainChange,
  selectedMarketer, onMarketerChange,
  marketers,
}: FilterBarProps) {

  const currentApp = apps.find(a => a.code === selectedApp)
  const painPoints = currentApp?.painPoints || []

  function handleAppChange(code: string) {
    localStorage.setItem('cs_selected_app', code)
    onAppChange(code)
    onPainChange('none') // сброс боли при смене апки
  }

  function handleMarketerChange(code: string) {
    localStorage.setItem('cs_selected_marketer', code)
    onMarketerChange(code)
  }

  return (
    <div className="fixed left-0 right-0 z-40 border-b flex items-center gap-4 px-8 py-2.5"
      style={{ top: '56px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      {/* App */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">App</span>
        <select value={selectedApp} onChange={e => handleAppChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {apps.map(app => (
            <option key={app.code} value={app.code}>{app.code} — {app.name}</option>
          ))}
        </select>
      </div>

      {/* Pain — показываем всегда если есть pain points */}
      {painPoints.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Pain</span>
          <select value={selectedPain || 'none'} onChange={e => onPainChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer max-w-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="none">— None —</option>
            {painPoints.map((pain, i) => (
              <option key={i} value={pain}>{pain}</option>
            ))}
          </select>
        </div>
      )}

      {/* Producer */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Producer</span>
        <select value={selectedMarketer} onChange={e => handleMarketerChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {marketers.map(m => (
            <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
