import { NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { listFriendships } from "@/lib/friends";

// Drives /friends and the nav badge: everything involving the viewer, in both
// directions, partitioned into friends / incoming / outgoing.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  return NextResponse.json(await listFriendships(userId));
}
