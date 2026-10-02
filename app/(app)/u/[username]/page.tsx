import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadProfileByUsername } from "@/lib/visibility";
import { getFriendshipBetween } from "@/lib/friends";
import { getProfileGroups } from "@/lib/feed";
import { Avatar } from "@/components/avatar";
import { ProfileGrid } from "@/components/profile-grid";
import { ProfileActions } from "@/components/profile-actions";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const viewer = await requireUser();
  const { username } = await params;

  // Lookup + visibility in one call: no path here can render a profile
  // without having decided whether the viewer is allowed to see its content.
  const profile = await loadProfileByUsername(username.toLowerCase(), viewer.id);
  if (!profile) notFound();

  const { user, visibility } = profile;
  const isSelf = visibility.relation === "self";
  const friendship = isSelf
    ? null
    : await getFriendshipBetween(viewer.id, user.id);

  // Posts are only ever fetched for a viewer who passed the visibility check.
  const groups = visibility.canView ? await getProfileGroups({ userId: user.id }) : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center gap-4">
        <Avatar user={user} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">@{user.username}</h1>
          {user.name && (
            <p className="truncate text-sm text-muted-foreground">{user.name}</p>
          )}
          {visibility.canView && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {groups.length} {groups.length === 1 ? "title" : "titles"} rated
            </p>
          )}
        </div>
      </header>

      {visibility.canView ? (
        <ProfileGrid groups={groups} />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">This account is private.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add them as a friend to see what they&apos;ve rated.
          </p>
          <ProfileActions
            userId={user.id}
            relation={visibility.relation}
            friendshipId={friendship?.id ?? null}
          />
        </div>
      )}

      {!isSelf && visibility.canView && (
        <div className="mt-6 border-t pt-4">
          <ProfileActions
            userId={user.id}
            relation={visibility.relation}
            friendshipId={friendship?.id ?? null}
          />
        </div>
      )}
    </main>
  );
}
