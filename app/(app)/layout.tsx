import { AppNav } from "@/components/app-nav";

// Everything inside this route group is signed-in territory and gets the nav.
// /signin and /onboarding sit outside the group, so they stay chrome-free.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
      {/* Required by README §7: TMDb and AniList both require visible
          attribution, and a commercial TMDb licence is needed if this ever
          monetises. Plain text — the styling pass comes later. */}
      <footer className="mt-auto px-4 py-6 text-center text-xs text-muted-foreground">
        This product uses the TMDb and AniList APIs but is not endorsed or
        certified by TMDb or AniList.
      </footer>
    </>
  );
}
