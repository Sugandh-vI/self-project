import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.username) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Social Movie, TV &amp; Anime Ratings
        </h1>
        <p className="text-muted-foreground">
          Rate what you watch on a 0–10 scale and see what your friends are
          watching.
        </p>
        <SignInButton />
      </div>
    </main>
  );
}
