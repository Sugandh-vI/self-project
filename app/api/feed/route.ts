import { NextRequest, NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import {
  clampLimit,
  getFriendFeed,
  FeedError,
} from "@/lib/feed";

/**
 * Friends' activity, newest first, one card per franchise group.
 *
 *   GET /api/feed                       -> first page, returns `snapshotAt`
 *   GET /api/feed?snapshot=…&cursor=…   -> subsequent pages, same snapshot
 *
 * Pass the `snapshotAt` from the first page on every later call: that is what
 * stops a card that receives a new entry mid-scroll from moving across the
 * cursor and being skipped. Activity newer than the snapshot is simply not
 * included until the client starts a fresh request.
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const params = req.nextUrl.searchParams;
  const rawSnapshot = params.get("snapshot");
  const rawCursor = params.get("cursor");
  const limit = clampLimit(params.get("limit") ?? undefined);

  let snapshotAt: Date;
  if (rawSnapshot === null) {
    snapshotAt = new Date();
  } else {
    const parsed = new Date(rawSnapshot);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid snapshot timestamp.", code: "invalid_snapshot" },
        { status: 400 }
      );
    }
    snapshotAt = parsed;
  }

  try {
    const page = await getFriendFeed({ viewerId: userId, snapshotAt, cursor: rawCursor, limit });
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
