import Image from "next/image";
import type { PersonSummary } from "@/lib/friends";

/** Profile picture with an initials fallback. Sizes are px. */
export function Avatar({
  user,
  size = 36,
  className = "",
}: {
  user: Pick<PersonSummary, "image" | "username" | "name">;
  size?: number;
  className?: string;
}) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ${className}`}
        unoptimized
      />
    );
  }

  const initial = (user.username ?? user.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      className={`flex items-center justify-center rounded-full bg-muted font-semibold ${className}`}
    >
      {initial}
    </div>
  );
}
