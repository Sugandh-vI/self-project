import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// `/profile` means "me", and profiles live at /u/[username] — send the viewer
// to their own canonical URL rather than keeping a second path that renders
// the same thing.
export const dynamic = "force-dynamic";

export default async function ProfileRedirect() {
  const user = await requireUser();

  // A user with no username hasn't finished onboarding, so there is no profile
  // to redirect to. Sending them to /onboarding is more useful than a 404.
  redirect(user.username ? `/u/${user.username}` : "/onboarding");
}
