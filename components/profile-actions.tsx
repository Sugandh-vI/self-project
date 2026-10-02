"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useFriendAction } from "@/components/use-friend-action";
import type { ViewerRelation } from "@/lib/visibility";

/**
 * The friend affordances on someone else's profile — including the ones shown
 * on a locked (private) profile, which is the only way to get in. Mutations go
 * through the same endpoints as /friends, then `router.refresh()` so the
 * server-rendered relation and visibility update in place.
 */
export function ProfileActions({
  userId,
  relation,
  friendshipId,
}: {
  userId: string;
  relation: ViewerRelation;
  friendshipId: string | null;
}) {
  const action = useFriendAction();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function run(call: () => Promise<unknown>) {
    setError(null);
    try {
      await call();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    }
  }

  const send = (url: string, method: "POST" | "DELETE", body?: Record<string, unknown>) =>
    run(() => action.mutateAsync({ url, method, body }));

  const busy = action.isPending;
  const removeFriend = friendshipId ? () => send(`/api/friends/${friendshipId}`, "DELETE") : null;

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {relation === "none" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              send("/api/friends/requests", "POST", { userId })
            }
          >
            Add friend
          </Button>
        )}

        {relation === "outgoing" && (
          <>
            <span className="text-sm text-muted-foreground">Request sent</span>
            <Button variant="ghost" size="sm" disabled={busy || !removeFriend} onClick={removeFriend ?? undefined}>
              Cancel
            </Button>
          </>
        )}

        {relation === "incoming" && (
          <>
            <Button
              size="sm"
              disabled={busy || !friendshipId}
              onClick={() => send(`/api/friends/requests/${friendshipId}/accept`, "POST")}
            >
              Accept
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || !removeFriend} onClick={removeFriend ?? undefined}>
              Decline
            </Button>
          </>
        )}

        {relation === "friends" && (
          <>
            <span className="text-sm text-muted-foreground">Friends</span>
            <Button variant="ghost" size="sm" disabled={busy || !removeFriend} onClick={removeFriend ?? undefined}>
              Remove
            </Button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
