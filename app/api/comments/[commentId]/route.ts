import { NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { CommentsError, deleteComment } from "@/lib/comments";

/**
 * Delete a comment. Allowed for the comment's author and for the owner of the
 * post it sits on (journey.md §16, decision 4). Deleting the post itself
 * cascades — this is for removing one comment from a live thread.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const actorId = await currentUserId();
  if (!actorId) return unauthorized();

  const { commentId } = await params;
  try {
    await deleteComment({ commentId, actorId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CommentsError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
