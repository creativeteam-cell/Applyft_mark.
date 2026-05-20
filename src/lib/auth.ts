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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
}
