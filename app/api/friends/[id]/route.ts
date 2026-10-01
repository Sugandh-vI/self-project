import { NextResponse } from "next/server";
import {
  currentUserId,
  friendsErrorResponse,
  unauthorized,
} from "@/lib/api-auth";
import { deleteFriendship } from "@/lib/friends";

/**
 * One endpoint for the three ways a friendship row goes away, because all three
 * are the same deletion (journey.md §5):
 *   pending + you are the recipient -> declined
 *   pending + you are the requester -> cancelled
 *   accepted + either side         -> unfriended
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const { id } = await params;
  try {
    return NextResponse.json(await deleteFriendship(userId, id));
  } catch (error) {
    const mapped = friendsErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
