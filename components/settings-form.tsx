"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

type Me = {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  providerImage: string | null;
  isPrivate: boolean;
};

/**
 * The minimum surface needed to exercise the settings endpoints end to end:
 * change username, toggle privacy, upload or restore a profile picture.
 * Deliberately unstyled — the premium pass comes after the backend is signed
 * off.
 */
export function SettingsForm({ initial }: { initial: Me }) {
  const router = useRouter();
  // `update()` re-fetches the session, so the nav's @handle and the avatar
  // follow the change instead of showing a stale value until the next reload.
  const { update } = useSession();

  const [username, setUsername] = useState(initial.username ?? "");
  const [isPrivate, setIsPrivate] = useState(initial.isPrivate);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshSession() {
    await update();
    router.refresh();
  }

  async function saveUsername(nextUsername: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; user?: { username?: string | null } }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setMessage(`Username is now @${body?.user?.username}`);
      await refreshSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function togglePrivate(next: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setIsPrivate(next);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setIsPrivate(!next);
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      setMessage(next ? "Profile is private." : "Profile is public.");
      await refreshSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setMessage("Profile picture updated.");
      setFile(null);
      await refreshSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setMessage("Profile picture restored.");
      await refreshSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Username</h2>
        <div className="flex items-center gap-2">
          <input
            aria-label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
          />
          <Button
            size="sm"
            disabled={busy || username === initial.username}
            onClick={() => saveUsername(username)}
          >
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          3–20 characters, letters, numbers and underscores.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Private profile</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-label="Private profile"
            checked={isPrivate}
            onChange={(event) => togglePrivate(event.target.checked)}
            disabled={busy}
          />
          Only friends can see what you&apos;ve rated
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Profile picture</h2>
        <div className="flex items-center gap-2">
          <input
            type="file"
            aria-label="Profile picture"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button size="sm" disabled={busy || !file} onClick={uploadAvatar}>
            Upload
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={removeAvatar}>
            Remove
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to 2 MB.
        </p>
      </section>

      {message && <p className="text-sm">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
