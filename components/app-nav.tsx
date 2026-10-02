"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FriendsOverview } from "@/lib/friends";

// Routes are added here as they land, so the nav never links to a 404.
const LINKS = [
  { href: "/", label: "Search" },
  { href: "/feed", label: "Feed" },
  { href: "/friends", label: "Friends" },
] as const;

export function AppNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const username = session?.user?.username ?? null;

  // There is no notification system yet, so the incoming-request badge on this
  // nav is the only thing that tells you someone added you.
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      return (await res.json()) as FriendsOverview;
    },
    enabled: Boolean(session?.user?.id),
    staleTime: 30_000,
  });

  const incomingCount = friends.data?.incoming.length ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-3">
        {/* No brand wordmark yet — the product name is still TBD (README
            Section 1). "Search" doubles as the home link. */}
        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
                {link.href === "/friends" && incomingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {incomingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">@{username ?? "…"}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/signin" })}
          >
            Sign out
          </Button>
        </div>
      </nav>
    </header>
  );
}
