import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTmdbSeasons } from "@/lib/tmdb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const title = await prisma.title.findUnique({ where: { id } });
  if (!title) {
    return NextResponse.json({ error: "Title not found" }, { status: 404 });
  }
  if (title.category !== "tv") {
    return NextResponse.json(
      { error: "Only TV shows have seasons" },
      { status: 400 }
    );
  }

  try {
    const seasons = await getTmdbSeasons(title.sourceId);
    return NextResponse.json({ seasons });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lookup failed" },
      { status: 502 }
    );
  }
}
