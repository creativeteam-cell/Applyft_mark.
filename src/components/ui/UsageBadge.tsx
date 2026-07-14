'use client'

// Счётчик личного потребления: "N / M images" или "N / M units".
// Краснеет при >=90% лимита. refreshKey — любое значение, смена которого
// перезапрашивает данные (например, счётчик успешных генераций).
import { useState, useEffect } from 'react'

interface Usage {
  imageCount: number
  imageLimit: number
  videoUnits: number
  videoLimit: number
}

export function UsageBadge({ kind, refreshKey, className }: {
  kind: 'images' | 'video'
  refreshKey?: unknown
  className?: string
}) {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/me/usage')
      .then(r => r.json())
      .then(d => { if (alive && !d.error) setUsage(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [refreshKey])

  if (!usage) return null

  const used = kind === 'images' ? usage.imageCount : usage.videoUnits
  const limit = kind === 'images' ? usage.imageLimit : usage.videoLimit
  if (!limit) return null // 0 = лимит не назначен, не показываем

  const ratio = used / limit
  const label = kind === 'images' ? 'images' : 'units'

  return (
    <span className={className}
      title={ratio >= 1 ? 'Limit reached — ask an admin to raise it' : `Your monthly ${label} usage`}
      style={{ color: ratio >= 0.9 ? '#f87171' : 'var(--text-muted)', fontSize: 11 }}>
      {used} / {limit} {label}{ratio >= 1 ? ' — limit reached!' : ''}
    </span>
  )
}
