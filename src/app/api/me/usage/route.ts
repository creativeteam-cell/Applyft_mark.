import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllUserStats, getUserLimit, getAllVideoStats, getUserVideoLimit } from '@/lib/adminStats'

// Личное потребление текущего пользователя: картинки и видео-юниты против его лимитов.
// Используется счётчиками в генераторе, карточках и на странице Video.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const email = session.user.email

  try {
    const [imageStats, imageLimit, videoStats, videoLimit] = await Promise.all([
      getAllUserStats([email]),
      getUserLimit(email),
      getAllVideoStats([email]),
      getUserVideoLimit(email),
    ])
    return NextResponse.json({
      imageCount: imageStats[0]?.imageCount ?? 0,
      imageLimit,             // 0 = без лимита
      videoUnits: videoStats[0]?.videoUnits ?? 0,
      videoLimit,             // default 50
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
