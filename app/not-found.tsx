import Link from "next/link";

/**
 * Minimal by design. Until this existed, `notFound()` from the profile and
 * permalink pages fell through to Next's stock 404, which ships the user
 * nowhere. The styling pass comes later.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="text-sm hover:underline">
        Back to search
      </Link>
    </main>
  );
}
