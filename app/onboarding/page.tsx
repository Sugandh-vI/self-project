import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

// Session-dependent — never prerender.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");
  if (session.user.username) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pick a username
        </h1>
        <p className="text-muted-foreground">
          This is how friends will find you. You can&apos;t change it later for
          now.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
