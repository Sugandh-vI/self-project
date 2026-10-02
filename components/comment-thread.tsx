"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import type { CommentView } from "@/lib/comments";

async function fetchComments(postId: string) {
  const res = await fetch(`/api/posts/${postId}/comments`);
  if (!res.ok) throw new Error(`Failed to load comments (${res.status})`);
  return (await res.json()) as { comments: CommentView[]; hasMore: boolean };
}

/**
 * A post's comment thread. Minimal on purpose — it exists so the comments
 * backend can be exercised end to end; the premium pass comes later.
 *
 * The list is keyed on the post so navigating between slides swaps threads
 * without a stale flash.
 */
export function CommentThread({
  postId,
  canComment,
}: {
  postId: string;
  canComment: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => fetchComments(postId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    // A comment count rides on the feed card and the profile grid.
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const post = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed (${res.status})`);
      }
    },
    onSuccess: () => {
      setText("");
      setError(null);
      invalidate();
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Something went wrong"),
  });

  const remove = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed (${res.status})`);
      }
    },
    onSuccess: invalidate,
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Something went wrong"),
  });

  const comments = data?.comments ?? [];

  return (
    <section className="mt-6 space-y-3 border-t pt-4">
      <h2 className="text-sm font-medium">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex items-start gap-2">
            <Avatar user={comment.author} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {comment.author.username ? (
                  <Link href={`/u/${comment.author.username}`} className="font-medium hover:underline">
                    @{comment.author.username}
                  </Link>
                ) : (
                  <span className="font-medium">Someone</span>
                )}{" "}
                <span className="text-muted-foreground">{comment.text}</span>
              </p>
              {comment.canDelete && (
                <button
                  type="button"
                  aria-label={`Delete comment by ${comment.author.username ?? "this user"}`}
                  className="text-xs text-muted-foreground hover:underline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(comment.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data?.hasMore && (
        <p className="text-xs text-muted-foreground">
          Showing the first {comments.length} comments.
        </p>
      )}

      {canComment && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (trimmed) post.mutate(trimmed);
          }}
        >
          <input
            aria-label="Write a comment"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Add a comment…"
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <Button size="sm" type="submit" disabled={post.isPending || !text.trim()}>
            Post
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
