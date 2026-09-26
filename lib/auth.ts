import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Database sessions: session rows live in our Postgres via the Prisma
  // adapter (README Section 8 — no external identity store).
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        // The Prisma adapter hands us the real User row; NextAuth's own
        // AdapterUser type just doesn't declare our extra fields.
        const dbUser = user as {
          id: string;
          username?: string | null;
          isPrivate?: boolean;
        };
        session.user.id = dbUser.id;
        session.user.username = dbUser.username ?? null;
        session.user.isPrivate = dbUser.isPrivate ?? false;
      }
      return session;
    },
  },
};

/**
 * Returns the signed-in user (with app fields), redirecting to /signin when
 * there is no session and to /onboarding when the username hasn't been chosen
 * yet. Use in server components / route handlers / server actions.
 */
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");
  if (!session.user.username) redirect("/onboarding");
  return session.user;
}
