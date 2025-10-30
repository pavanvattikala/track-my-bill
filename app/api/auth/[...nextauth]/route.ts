import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
// 1. Import the necessary types from next-auth and next-auth/jwt
import { type JWT } from "next-auth/jwt";
import { type Account, type Session } from "next-auth";

// Define a custom interface to extend the session object for TypeScript
// This tells TypeScript that 'accessToken' and 'refreshToken' exist on the session.
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
  }
}

// Define a custom interface to extend the JWT token object
// This tells TypeScript that 'accessToken' and 'refreshToken' exist on the token.
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
  }
}

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
    // 2. Explicitly type the arguments for the jwt callback
    async jwt({ token, account }: { token: JWT; account: Account | null }) {
      if (account) {
        // Save the current Access Token (short-lived)
        token.accessToken = account.access_token;
        // Save the Refresh Token (long-lived, used to get new Access Tokens)
        // This is only provided on the *first* sign-in, hence the null check is not needed if 'account' is present.
        token.refreshToken = account.refresh_token; 
      }
      return token;
    },
    // 3. Explicitly type the arguments for the session callback
    async session({ session, token }: { session: Session; token: JWT }) {
      // TypeScript now knows that 'token' has 'accessToken' and 'refreshToken'
      // The 'as string' casts are no longer strictly needed but don't hurt.
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };