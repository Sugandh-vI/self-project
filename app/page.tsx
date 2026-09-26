import { requireUser } from "@/lib/auth";
import { SearchExperience } from "@/components/search-experience";

// Authed page — never prerender (session-dependent).
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUser();

  return (
    <main className="flex flex-1 flex-col">
      <SearchExperience />
    </main>
  );
}
