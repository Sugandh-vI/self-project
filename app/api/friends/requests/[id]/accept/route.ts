import { NextResponse } from "next/server";
import {
  currentUserId,
  friendsErrorResponse,
  unauthorized,
} from "@/lib/api-auth";
import { acceptFriendRequest } from "@/lib/friends";

// Recipient-only: acceptFriendRequest re-checks ownership and 403s otherwise.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const { id } = await params;
  try {
    await acceptFriendRequest(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = friendsErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
