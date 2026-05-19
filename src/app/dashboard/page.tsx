import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CreativeWorkspace } from '@/components/creative/CreativeWorkspace'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      
      {/* Header */}
      <header className="border-b px-8 py-4 flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono tracking-[0.3em] text-gray-500 uppercase">ApplyFT</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-bold" style={{ color: 'var(--accent)' }}>Creative Studio</span>
        </div>
        
        <div className="flex items-center gap-3">
          {session.user?.image && (
            <img
              src={session.user.image}
              alt={session.user.name || ''}
              className="w-8 h-8 rounded-full"
            />
          )}
          <span className="text-sm text-gray-400">{session.user?.name}</span>
        </div>
      </header>

      {/* Main workspace */}
      <CreativeWorkspace />
    </div>
  )
}
