"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import type { FriendsOverview, PersonSummary } from "@/lib/friends";

type RelationState =
  | { state: "none" }
  | { state: "outgoing" | "incoming"; friendshipId: string }
  | { state: "friends" };

async function fetchFriends(): Promise<FriendsOverview> {
  const res = await fetch("/api/friends");
  if (!res.ok) throw new Error("Failed to load friends");
  return (await res.json()) as FriendsOverview;
}

export function FriendsManager({
  initial,
  username,
}: {
  initial: FriendsOverview;
  username: string | null;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Server-rendered initial data, so the lists are on screen immediately and
  // every mutation refetches through the same key the nav badge reads.
  //
  // `refetchOnMount: false` because the page is a dynamic server component:
  // every navigation re-renders it with fresh `initial`, so hydrating with
  // server data is already up to date and a mount refetch would just double
  // every request. Mutations still refetch, via invalidateQueries below. (A
  // timestamp-based `initialDataUpdatedAt` would be the other way to express
  // this, but reading the clock during render is impure.)
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: fetchFriends,
    initialData: initial,
    refetchOnMount: false,
    staleTime: 30_000,
  });

  const search = useQuery({
    queryKey: ["user-search", debounced],
    queryFn: async () => {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(debounced)}`
      );
      if (!res.ok) throw new Error("Search failed");
      return (await res.json()) as { results: PersonSummary[] };
    },
    enabled: debounced.length >= 2,
  });

  // Derive each person's state from the friendship rows we already have, so
  // search doesn't need a second endpoint just to say "request sent".
  const relations = useMemo(() => {
    const map = new Map<string, RelationState>();
    const data = friends.data;
    for (const o of data.outgoing)
      map.set(o.person.userId, { state: "outgoing", friendshipId: o.friendshipId });
    for (const i of data.incoming)
      map.set(i.person.userId, { state: "incoming", friendshipId: i.friendshipId });
    // Last write wins, and an accepted friendship beats any stale pending row.
    for (const f of data.friends) map.set(f.userId, { state: "friends" });
    return map;
  }, [friends.data]);

  const action = useMutation({
    mutationFn: async ({
      url,
      method,
      body,
    }: {
      url: string;
      method: "POST" | "DELETE";
      body?: Record<string, unknown>;
    }) => {
      const res = await fetch(url, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      return data;
    },
    onSuccess: async () => {
      setError(null);
      // A relation change moves a user between search panels, so the search
      // cache has to go stale with the friends list.
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
      await queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  async function copyHandle() {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — select the handle and copy it manually.");
    }
  }

  const busy = action.isPending;

  return (
    <div className="space-y-8">
      {/* Discovery is username-only by design, so the app has to make it easy
          to hand your handle to someone outside it. */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Your handle</h2>
        <div className="mt-2 flex items-center gap-3">
          <code className="rounded bg-muted px-2 py-1 text-sm">
            @{username ?? "…"}
          </code>
          <Button variant="outline" size="sm" onClick={copyHandle}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Friends find you by this handle. Email addresses are never searchable.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium">Add a friend</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username…"
          className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="mt-3 space-y-2">
          {debounced.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Type at least 2 characters.
            </p>
          ) : search.isPending ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : search.isError ? (
            <p className="text-sm text-destructive">Search failed.</p>
          ) : search.data.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            search.data.results.map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                relation={relations.get(person.userId) ?? { state: "none" }}
                busy={busy}
                onSend={() =>
                  action.mutate({
                    url: "/api/friends/requests",
                    method: "POST",
                    // Send the id, not the handle: a username can change
                    // between search and send (it can't yet, but the endpoint
                    // accepts either and the id is unambiguous).
                    body: { userId: person.userId },
                  })
                }
              />
            ))
          )}
        </div>
      </section>

      {friends.data.incoming.length > 0 && (
        <section>
          <h2 className="text-sm font-medium">
            Requests ({friends.data.incoming.length})
          </h2>
          <div className="mt-3 space-y-2">
            {friends.data.incoming.map((request) => (
              <PersonRow
                key={request.friendshipId}
                person={request.person}
                relation={{
                  state: "incoming",
                  friendshipId: request.friendshipId,
                }}
                busy={busy}
                onAccept={() =>
                  action.mutate({
                    url: `/api/friends/requests/${request.friendshipId}/accept`,
                    method: "POST",
                  })
                }
                onRemove={() =>
                  action.mutate({
                    url: `/api/friends/${request.friendshipId}`,
                    method: "DELETE",
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {friends.data.outgoing.length > 0 && (
        <section>
          <h2 className="text-sm font-medium">Sent</h2>
          <div className="mt-3 space-y-2">
            {friends.data.outgoing.map((request) => (
              <PersonRow
                key={request.friendshipId}
                person={request.person}
                relation={{
                  state: "outgoing",
                  friendshipId: request.friendshipId,
                }}
                busy={busy}
                onRemove={() =>
                  action.mutate({
                    url: `/api/friends/${request.friendshipId}`,
                    method: "DELETE",
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium">
          Friends ({friends.data.friends.length})
        </h2>
        <div className="mt-3 space-y-2">
          {friends.data.friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends yet — share your handle above, or add someone by
              username.
            </p>
          ) : (
            friends.data.friends.map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                relation={{ state: "friends" }}
                busy={busy}
              />
            ))
          )}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function PersonRow({
  person,
  relation,
  busy,
  onSend,
  onAccept,
  onRemove,
}: {
  person: PersonSummary;
  relation: RelationState;
  busy: boolean;
  onSend?: () => void;
  onAccept?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Avatar user={person} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">@{person.username}</p>
        {person.name && (
          <p className="truncate text-xs text-muted-foreground">
            {person.name}
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 gap-2">
        {relation.state === "none" && (
          <Button size="sm" onClick={onSend} disabled={busy}>
            Add friend
          </Button>
        )}
        {relation.state === "outgoing" && (
          <>
            <span className="text-xs text-muted-foreground">Request sent</span>
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
              Cancel
            </Button>
          </>
        )}
        {relation.state === "incoming" && (
          <>
            <Button size="sm" onClick={onAccept} disabled={busy}>
              Accept
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
              Decline
            </Button>
          </>
        )}
        {relation.state === "friends" && (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

