import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeUsername, USERNAME_RULES } from "@/lib/usernames";

/**
 * The viewer's own account: read it, change the username, toggle privacy.
 *
 * A route rather than a server action (onboarding uses one) because the e2e
 * harness speaks HTTP, and every other mutation in this app is covered by a
 * live check — settings shouldn't be the first thing to ship unverified.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      image: true,
      providerImage: true,
      isPrivate: true,
    },
  });
  if (!user) return unauthorized();

  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  let body: { username?: unknown; isPrivate?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; isPrivate?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: { username?: string; isPrivate?: boolean } = {};

  if (body.username !== undefined) {
    // `normalizeUsername` lowercases and enforces the same rule as onboarding
    // (lib/usernames.ts is the single source of truth for both).
    const username = normalizeUsername(body.username);
    if (!username) {
      return NextResponse.json({ error: USERNAME_RULES }, { status: 400 });
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    // Re-submitting your own handle is a no-op, not a "taken" collision.
    if (current?.username !== username) data.username = username;
  }

  if (body.isPrivate !== undefined) {
    if (typeof body.isPrivate !== "boolean") {
      return NextResponse.json(
        { error: "isPrivate must be a boolean." },
        { status: 400 }
      );
    }
    data.isPrivate = body.isPrivate;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — send a username and/or isPrivate." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true, isPrivate: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    // Lost a race for the same handle between the check above and the write.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That username is already taken.", code: "username_taken" },
        { status: 409 }
      );
    }
    throw error;
  }
}
