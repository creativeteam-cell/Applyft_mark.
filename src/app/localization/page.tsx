import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Header } from '@/components/ui/Header'
import { LocalizationPage } from '@/components/localization/LocalizationPage'

export default async function Localization() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header user={session.user} />
      <LocalizationPage />
    </div>
  )
}
