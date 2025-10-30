import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google".

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          access_type: "offline",
          scope:
            "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file",
        },
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        // Save the current Access Token (short-lived)
        token.accessToken = account.access_token 
        // Save the Refresh Token (long-lived, used to get new Access Tokens)
        token.refreshToken = account.refresh_token 
      }
      return token
    },
    // Make the tokens available in the session object
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string 
      return session
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
