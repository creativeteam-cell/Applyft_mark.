import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Header } from '@/components/ui/Header'

export default async function Variations() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header user={session.user} />
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">🎨</div>
          <h1 className="text-2xl font-bold mb-2">Variations</h1>
          <p className="text-gray-500">Coming soon</p>
        </div>
      </div>
    </div>
  )
}
