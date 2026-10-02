import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  currentUserId,
  friendsErrorResponse,
  unauthorized,
} from "@/lib/api-auth";
import { sendFriendRequest } from "@/lib/friends";

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  let body: { username?: unknown; userId?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; userId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const byId = typeof body.userId === "string" ? body.userId.trim() : "";
  // Lowercased to match the rest of the app: search is case-insensitive and
  // profile URLs are lowercased, so a handle typed with different casing has
  // to resolve to the same person.
  const byUsername = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!byId && !byUsername) {
    return NextResponse.json(
      { error: "A username or userId is required." },
      { status: 400 }
    );
  }

  // Resolve the target here so an unknown handle is a 404 from this route
  // rather than a generic "no such user" from the library.
  const target = await prisma.user.findUnique({
    where: byId ? { id: byId } : { username: byUsername },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  try {
    const result = await sendFriendRequest(userId, target.id);
    return NextResponse.json(result, {
      status: result.status === "accepted" ? 200 : 201,
    });
  } catch (error) {
    const mapped = friendsErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
