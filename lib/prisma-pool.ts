// ---------------------------------------------------------------------------
// Connection-pool policy (root-cause fix for Supabase EMAXCONNSESSION).
//
// Prisma sizes its pool at `num_cpus * 2 + 1` by default — 21 on an 8-core
// dev machine. Supabase's pooler (session mode) caps the whole project at 15
// client connections, so a single dev server could already exhaust it, and a
// burst (cold Next.js route compilation, `prisma studio`, a second dev server)
// reliably did:
//
//   FATAL: (EMAXCONNSESSION) max clients reached in session mode -
//     max clients are limited to pool_size: 15
//   Timed out fetching a new connection from the connection pool …
//     connection limit: 21            (Prisma P2024)
//   Can't reach database server at aws-0-….pooler.supabase.com:5432  (P1001)
//
// We therefore pin the runtime pool to a conservative limit unless the URL
// says otherwise. 5 leaves headroom inside the pooler's 15 for Prisma CLI
// commands (migrate/studio/db push) and a second dev server, while a single
// Next.js server queues queries instead of being refused. Migrations are
// unaffected: they run through the schema's `directUrl`, not this client.
// ---------------------------------------------------------------------------

export const DEFAULT_CONNECTION_LIMIT = 5;
export const CONNECTION_LIMIT_ENV = "PRISMA_CONNECTION_LIMIT";

export function resolveConnectionLimit(): number {
  const override = Number(process.env[CONNECTION_LIMIT_ENV]);
  return Number.isInteger(override) && override > 0
    ? override
    : DEFAULT_CONNECTION_LIMIT;
}

/** DATABASE_URL with an explicit connection_limit, so the pool can never grow
 *  past the pooler's client cap. An explicit ?connection_limit= in the URL
 *  always wins. Returns undefined when DATABASE_URL is unset so Prisma can
 *  raise its usual configuration error. */
export function resolveDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (/[?&]connection_limit=/i.test(url)) return url;

  const limit = resolveConnectionLimit();
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("connection_limit", String(limit));
    return parsed.toString();
  } catch {
    // Unparseable URL: append blindly rather than crashing at import time.
    return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
  }
}
