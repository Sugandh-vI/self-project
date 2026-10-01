import { NextRequest, NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { searchUsers } from "@/lib/friends";

// Username-only by design: no email lookup, so this can never be used to test
// whether an email address has an account (journey.md §13, Q4).
export async function GET(req: NextRequest) {
  const viewerId = await currentUserId();
  if (!viewerId) return unauthorized();

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  return NextResponse.json({ results: await searchUsers(q, viewerId) });
}
