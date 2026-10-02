"use client";

/**
 * Minimal by design. Without an error boundary anywhere in the tree, a thrown
 * server error rendered Next's stock page with no way back into the app.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        That request couldn&apos;t be completed.
      </p>
      <button type="button" onClick={reset} className="text-sm hover:underline">
        Try again
      </button>
    </main>
  );
}
