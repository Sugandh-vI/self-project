import { NextRequest, NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import {
  COMMENT_MAX_LIMIT,
  CommentsError,
  createComment,
  listComments,
} from "@/lib/comments";

/**
 * GET  — a post's comment thread, oldest first.
 * POST — add a comment.
 *
 * Both 404 when the post is missing *or* invisible to the viewer, matching the
 * permalink rule: a private account's post must not be confirmed to exist.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const viewerId = await currentUserId();
  if (!viewerId) return unauthorized();

  const { postId } = await params;
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

  const page = await listComments({ postId, viewerId, limit });
  if (!page) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  return NextResponse.json({ ...page, limit: limit ?? COMMENT_MAX_LIMIT });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const viewerId = await currentUserId();
  if (!viewerId) return unauthorized();

  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "A text field is required." }, { status: 400 });
  }

  const { postId } = await params;
  try {
    const comment = await createComment({ postId, authorId: viewerId, text: body.text });
    if (!comment) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    return NextResponse.json({ comment }, { status: 201 });
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
