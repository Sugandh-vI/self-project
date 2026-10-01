import { AppNav } from "@/components/app-nav";

// Everything inside this route group is signed-in territory and gets the nav.
// /signin and /onboarding sit outside the group, so they stay chrome-free.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
