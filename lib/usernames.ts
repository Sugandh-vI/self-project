// ---------------------------------------------------------------------------
// The username rule, in one place.
//
// Two call sites need it — onboarding (a server action) and the settings page
// (an API route) — and a copied regex is how the two drift apart. Lowercasing
// happens here too, so nothing downstream has to remember to do it.
// ---------------------------------------------------------------------------

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/i;

export const USERNAME_RULES =
  "3–20 characters, letters, numbers and underscores only.";

/**
 * The canonical form of a username, or null if it isn't a legal one. Always
 * lowercase: `@Suzaku_882` and `@suzaku_882` are the same person everywhere in
 * this app (search, profile URLs, friend requests).
 */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return USERNAME_PATTERN.test(value) ? value : null;
}
