import NextAuth, { type AuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { credentialsSchema, type CredentialsInput } from "@/lib/auth-schemas";
import { createSession, newSessionId } from "@/lib/session-store";
import type { AppRole } from "../../types/next-auth";

export const SESSION_TTL_SEC = 60 * 60 * 8; // 8h short-lived session

export interface SessionUser {
  id: string;
  username: string;
  role: AppRole;
}

// Pure, unit-testable authorize. Returns a SessionUser or null — never throws,
// never differentiates "no user" from "bad password" (no enumeration).
export async function authorizeCredentials(raw: unknown): Promise<SessionUser | null> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { username, password }: CredentialsInput = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // Constant-ish work to blunt timing enumeration.
    await verifyPassword(
      "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      password,
    );
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return null;

  return { id: user.id, username: user.username, role: user.role as AppRole };
}

export const authOptions: AuthOptions = {
  secret: env.SESSION_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_TTL_SEC },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: "ggg.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
  },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: async (creds) => {
        const user = await authorizeCredentials(creds);
        return user ?? null; // generic failure, no field-level detail
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh login: mint a sessionId and register it in the Redis allow-list.
        const su = user as unknown as SessionUser;
        const sid = newSessionId();
        token.id = su.id;
        token.username = su.username;
        token.role = su.role;
        token.sid = sid;
        await createSession(su.id, sid, SESSION_TTL_SEC);
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        username: token.username,
        role: token.role,
      };
      (session as unknown as { sid: string }).sid = token.sid;
      return session;
    },
  },
};

const nextAuthHandler = NextAuth(authOptions);
export const handlers = { GET: nextAuthHandler, POST: nextAuthHandler };

// Wrapper for server-side session retrieval (replaces v5's `auth()`)
export async function auth() {
  return getServerSession(authOptions);
}
