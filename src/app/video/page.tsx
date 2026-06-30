import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Header } from '@/components/ui/Header'
import { VideoPage } from '@/components/video/VideoPage'

export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return (
    <>
      <Header user={session.user ?? {}} />
      <VideoPage />
    </>
  )
}
