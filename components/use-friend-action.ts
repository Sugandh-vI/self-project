"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Friend-request mutations shared by /friends and profile pages, so both
 * invalidate the same cache keys (the nav badge reads `["friends"]` too).
 */
export function useFriendAction() {
  const queryClient = useQueryClient();

  return useMutation({
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
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
      await queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
  });
}
