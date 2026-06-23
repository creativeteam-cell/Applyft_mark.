'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export function Header({ user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-8 h-14">
        
        {/* Logo + Nav */}
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

        {/* User menu */}
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
    </header>
  )
}
