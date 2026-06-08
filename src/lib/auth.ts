import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: 'applyft.co',
          scope: 'openid email profile https://www.googleapis.com/auth/drive',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        const email = profile?.email || ''
        if (!email.endsWith('@applyft.co')) {
          return false
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) token.id = user.id
      if (account?.access_token) token.accessToken = account.access_token
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      session.accessToken = token.accessToken as string | undefined
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
}
