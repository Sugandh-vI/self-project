import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { searchTitles } from "@/lib/titles";

const CATEGORIES = ["movie", "tv", "anime"] as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const category = req.nextUrl.searchParams.get("category") ?? "movie";
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const { results, degraded } = await searchTitles(
    q,
    category as (typeof CATEGORIES)[number]
  );
  return NextResponse.json({ results, degraded });
}
