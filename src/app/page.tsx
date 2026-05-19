import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LoginButton } from '@/components/auth/LoginButton'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  // Если залогинен — редиректим на дашборд
  if (session) {
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      
      {/* Фоновые декоративные элементы */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #4f6ef7 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 text-center max-w-lg mx-auto px-8">
        
        {/* Лого / название */}
        <div className="mb-2">
          <span className="text-xs font-mono tracking-[0.3em] text-gray-500 uppercase">
            ApplyFT
          </span>
        </div>
        
        <h1 className="text-5xl font-extrabold mb-4 leading-tight">
          Creative
          <br />
          <span style={{ color: 'var(--accent)' }}>Studio</span>
        </h1>
        
        <p className="text-gray-400 mb-12 text-lg leading-relaxed">
          Генерируй рекламные креативы<br />
          во всех форматах одним кликом
        </p>

        <LoginButton />

        <p className="mt-6 text-xs text-gray-600">
          Доступ только для @applyft.co
        </p>
      </div>
    </main>
  )
}
