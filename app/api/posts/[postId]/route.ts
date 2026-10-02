import { NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Remove one of your own ratings.
 *
 * Only the author may delete, and only their own Post row goes — the shared
 * catalog (Title / Entry / FranchiseGroup) is untouched, because other users
 * have posts against the same entries. Comments on the post cascade with it.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, userId: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  // A post you can't see and a post that doesn't exist look identical here, so
  // a rating can't be probed for by id.
  if (post.userId !== userId) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  await prisma.post.delete({ where: { id: post.id } });
  return NextResponse.json({ ok: true });
}
