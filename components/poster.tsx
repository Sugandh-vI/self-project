import Image from "next/image";
import { cn } from "@/lib/utils";

// Poster with the README Section 3 fallback: when a title has no poster,
// show the title on a solid brand-ish block instead of a broken image.
export function Poster({
  name,
  posterUrl,
  className,
}: {
  name: string;
  posterUrl: string | null;
  className?: string;
}) {
  if (posterUrl) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-md bg-muted", className)}>
        <Image
          src={posterUrl}
          alt={name}
          fill
          sizes="(max-width: 640px) 45vw, 200px"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex aspect-[2/3] items-center justify-center rounded-md bg-gradient-to-br from-primary/80 to-primary p-2 text-center",
        className
      )}
    >
      <span className="line-clamp-4 text-sm font-semibold text-primary-foreground">
        {name}
      </span>
    </div>
  );
}
