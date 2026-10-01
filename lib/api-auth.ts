import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FriendsError } from "@/lib/friends";

/**
 * The signed-in user's id, or null. Every authed route handler starts here —
 * pages use `requireUser()` (lib/auth.ts) instead, which redirects.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Turns a known failure into a response. Returns null for anything unexpected
 * so the caller rethrows and Next.js logs it — we never want a typo'd field
 * name to reach the client as a "friend request" error.
 */
export function friendsErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof FriendsError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return null;
}
