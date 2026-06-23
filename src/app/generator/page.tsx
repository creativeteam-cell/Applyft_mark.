import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Header } from '@/components/ui/Header'
import { GeneratorPage } from '@/components/generator/GeneratorPage'

export default async function Generator() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header user={session.user} />
      <GeneratorPage />
    </div>
  )
}
