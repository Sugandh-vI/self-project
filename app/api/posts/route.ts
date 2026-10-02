import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEntryForTitle } from "@/lib/franchise";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    titleId?: unknown;
    seasonNumber?: unknown;
    rating?: unknown;
    caption?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const titleId = typeof body.titleId === "string" ? body.titleId : null;
  const rating = Number(body.rating);
  if (!titleId || !Number.isInteger(rating) || rating < 0 || rating > 10) {
    return NextResponse.json(
      { error: "titleId and an integer rating 0–10 are required." },
      { status: 400 }
    );
  }

  const seasonNumber =
    body.seasonNumber === undefined || body.seasonNumber === null
      ? null
      : Number(body.seasonNumber);
  if (seasonNumber !== null && (!Number.isInteger(seasonNumber) || seasonNumber < 1)) {
    return NextResponse.json({ error: "Invalid season number" }, { status: 400 });
  }

  // Captions are stored as-is, so an uncapped one is an unbounded write.
  const CAPTION_MAX_LENGTH = 2000;
  const rawCaption = typeof body.caption === "string" ? body.caption.trim() : "";
  if (rawCaption.length > CAPTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `A caption can be at most ${CAPTION_MAX_LENGTH} characters.` },
      { status: 400 }
    );
  }
  const caption = rawCaption || null;

  const title = await prisma.title.findUnique({ where: { id: titleId } });
  if (!title) {
    return NextResponse.json({ error: "Title not found" }, { status: 404 });
  }

  // One post per (user, entry): re-rating the same entry updates in place
  // (approved schema decision — feed bumps only happen on NEW entries).
  const entry = await resolveEntryForTitle(title, seasonNumber);
  const post = await prisma.post.upsert({
    where: { userId_entryId: { userId: session.user.id, entryId: entry.id } },
    create: {
      userId: session.user.id,
      entryId: entry.id,
      rating,
      caption,
    },
    update: { rating, caption },
  });

  return NextResponse.json({ postId: post.id });
}
