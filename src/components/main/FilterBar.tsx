'use client'

const DESIGNERS = [
  { code: 'TMK', name: 'Tetiana Melnyk' },
  { code: 'KZA', name: 'Kseniia Zadoia' },
  { code: 'AHB', name: 'Anhelina Halbul' },
  { code: 'ASR', name: 'Artem Sierov' },
  { code: 'SMV', name: 'Sofiia Matviikiv' },
  { code: 'DDT', name: 'Diana Drobotey' },
  { code: 'VTL', name: 'Vladyslava Tsymbal' },
  { code: 'YKH', name: 'Yuliia Khomukha' },
  { code: 'DKR', name: 'Danylo Kyrylov' },
  { code: 'ASM', name: 'Antonina Samoliuk' },
  { code: 'NBL', name: 'Nataliia Bielousova' },
  { code: 'RSK', name: 'Romana Skrabut' },
  { code: 'KIS', name: 'Kseniia Ilienko' },
  { code: 'MMM', name: 'Mariia Minaieva' },
]

interface App { code: string; name: string }

interface FilterBarProps {
  apps: App[]
  selectedApp: string
  onAppChange: (code: string) => void
  selectedDesigner: string
  onDesignerChange: (code: string) => void
}

export function FilterBar({
  apps, selectedApp, onAppChange,
  selectedDesigner, onDesignerChange,
}: FilterBarProps) {
  return (
    <div className="fixed left-0 right-0 z-40 border-b flex items-center gap-4 px-8 py-2.5"
      style={{ top: '56px', background: 'var(--bg)', borderColor: 'var(--border)' }}>

      {/* App dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">App</span>
        <select
          value={selectedApp}
          onChange={e => onAppChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          {apps.map(app => (
            <option key={app.code} value={app.code}>
              {app.code} — {app.name}
            </option>
          ))}
        </select>
      </div>

      {/* Designer dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Designer</span>
        <select
          value={selectedDesigner}
          onChange={e => onDesignerChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">All designers</option>
          {DESIGNERS.map(d => (
            <option key={d.code} value={d.code}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
