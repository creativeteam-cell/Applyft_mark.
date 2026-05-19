import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Только корпоративный домен applyft.co
          hd: 'applyft.co',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Дополнительная защита — проверяем домен на уровне кода
      if (account?.provider === 'google') {
        const email = profile?.email || ''
        if (!email.endsWith('@applyft.co')) {
          return false // Отказ в доступе
        }
      }
      return true
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: '/',           // Страница логина — главная
    error: '/auth/error',  // Страница ошибки
  },
}
