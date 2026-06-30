import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })
    const refreshed = await res.json()
    if (!res.ok) throw refreshed
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

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
        if (!email.endsWith('@applyft.co') && !email.endsWith('@geozilla.com')) return false
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) token.id = user.id

      // First login — save tokens and expiry
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
        }
      }

      // Token still valid
      if (Date.now() < (token.accessTokenExpires as number) - 60_000) {
        return token
      }

      // Token expired — refresh
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      session.accessToken = token.accessToken as string | undefined
      if ((token as any).error) session.error = (token as any).error as str