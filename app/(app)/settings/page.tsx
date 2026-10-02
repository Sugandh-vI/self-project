import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/settings-form";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      image: true,
      providerImage: true,
      isPrivate: true,
    },
  });
  // A session whose user row is gone is not a usable session.
  if (!user) redirect("/signin");

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="mb-6 text-lg font-semibold">Settings</h1>
      <SettingsForm initial={user} />
    </main>
  );
}
