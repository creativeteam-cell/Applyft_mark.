'use client'

import { signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { readQueueClient } from '@/lib/queueClient'

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Localization', href: '/localization' },
  { label: 'Generator', href: '/generator' },
  { label: 'Settings', href: '/settings' },
]

function QueuePanel() {
  const [open, setOpen] = useState(false)
  // local: from localStorage (instant, current device)
  // server: from Drive via /api/queue (cross-device)
  const [local, setLocal] = useState<{ gemini: number; openai: number }>({ gemini: 0, openai: 0 })
  const [server, setServer] = useState<{ gemini: number; openai: number }>({ gemini: 0, openai: 0 })
  const ref = useRef<HTMLDivElement>(null)

  // Poll localStorage every 2s
  useEffect(() => {
    function tick() { setLocal(readQueueClient()) }
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [])

  // Poll server every 5s for cross-device visibility
  useEffect(() => {
    async function fetchServer() {
      try {
        const res = await fetch('/api/queue')
        if (res.ok) setServer(await res.json())
      } catch {}
    }
    fetchServer()
    const id = setInterval(fetchServer, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Merge: take the higher value (local wins for instant feedback, server for cross-device)
  const queue = {
    gemini: Math.max(local.gemini, server.gemini),
    openai: Math.max(local.openai, server.openai),
  }

  const total = queue.gemini + queue.openai
  const busy = total > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all hover:bg-white/5"
        title="AI Queue"
      >
        <div className="relative flex items-center justify-center w-4 h-4">
          {busy && (
            <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
              style={{ background: '#4ade80' }} />
          )}
          <span className="relative inline-flex w-2 h-2 rounded-full"
            style={{ background: busy ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {busy ? `${total} active` : 'Idle'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50 min-w-[200px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              AI Queue
            </span>
          </div>
          <div className="px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: queue.gemini > 0 ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Gemini Image</span>
              </div>
              <span className="text-sm font-mono font-medium"
                style={{ color: queue.gemini > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                {queue.gemini > 0 ? 'active' : 'idle'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: queue.openai > 0 ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>OpenAI</span>
              </div>
              <span className="text-sm font-mono font-medium"
                style={{ color: queue.openai > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                {queue.openai > 0 ? 'active' : 'idle'}
              </span>
            </div>
          </div>
          <div className="px-4 pb-2.5">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Local: 2s · Network: 5s
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function Header({ user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-8 h-14">

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono tracking-[0.3em] text-gray-500 uppercase">ApplyFT</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>Creative Studio</span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-1.5 rounded-lg text-sm transition-all"
                style={{
                  background: pathname === item.href ? 'rgba(79,110,247,0.15)' : 'transparent',
                  color: pathname === item.href ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: pathname === item.href ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <QueuePanel />
          <div className="w-px h-5" style={{ background: 'var(--border)' }} />
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all hover:bg-white/5"
            >
              {user?.image && (
                <img src={user.image} alt={user.name || ''} className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-gray-400">{user?.name}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-all text-left"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
