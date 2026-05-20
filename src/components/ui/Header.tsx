'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export function Header({ user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b px-8 py-4 flex items-center justify-between"
      style={{ borderColor: 'var(--border)' }}>
      
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono tracking-[0.3em] text-gray-500 uppercase">ApplyFT</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="font-bold" style={{ color: 'var(--accent)' }}>Creative Studio</span>
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-white/5"
        >
          {user?.image && (
            <img src={user.image} alt={user.name || ''} className="w-8 h-8 rounded-full" />
          )}
          <span className="text-sm text-gray-400">{user?.name}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
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
    </header>
  )
}
