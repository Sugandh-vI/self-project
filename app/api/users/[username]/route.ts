import { NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { loadProfileByUsername } from "@/lib/visibility";

/**
 * Profile summary + how the viewer stands with them. Deliberately narrow: it
 * reports identity and visibility, never posts — so it cannot become a way to
 * read a private profile's content.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const viewerId = await currentUserId();
  if (!viewerId) return unauthorized();

  const { username } = await params;
  const profile = await loadProfileByUsername(username.toLowerCase(), viewerId);
  if (!profile) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  return NextResponse.json({
    user: profile.user,
    viewerRelation: profile.visibility.relation,
    canView: profile.visibility.canView,
  });
}
