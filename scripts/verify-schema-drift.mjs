/**
 * Schema/migration drift check — runs entirely locally, no database needed.
 *
 *   npm run verify:schema
 *
 * Why this exists: every migration in this repo is hand-written, because
 * `prisma migrate dev` cannot run in the sandbox (the schema engine is
 * downloaded from binaries.prisma.sh, which is blocked). The user is therefore
 * the one who discovers drift, with `prisma migrate dev` prompting for a new
 * migration name on a real database — as happened on 2026-10-01, when
 * schema.prisma lost two `@@index` declarations that the applied migration
 * still created.
 *
 * So this reproduces the same comparison offline: replay every migration into
 * PGlite (a real Postgres engine compiled to WASM) and diff the result against
 * what schema.prisma actually declares. It covers indexes (names + columns +
 * order) and columns (names + nullability) for every model.
 *
 * It is deliberately NOT a full reimplementation of Prisma's diff — it looks
 * for the class of mistake that bit us (declared-but-missing, present-but-
 * undeclared, wrong columns). Type-level fidelity is left to `prisma migrate
 * dev` on the user's machine.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(ROOT, "prisma/schema.prisma");
const MIGRATIONS_DIR = path.join(ROOT, "prisma/migrations");

let pass = 0;
let fail = 0;
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Parse schema.prisma
// ---------------------------------------------------------------------------

const rawSchema = readFileSync(SCHEMA_PATH, "utf8");

// Comments are stripped first: an explanatory comment containing a literal
// `@@index([userId])` once produced a phantom "declared but missing" failure.
const schema = rawSchema
  .split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");

const models = [...schema.matchAll(/^model (\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
  name: m[1],
  body: m[2],
}));

if (models.length === 0) {
  console.error("No models found in schema.prisma — is the file where it should be?");
  process.exit(1);
}

const modelNames = new Set(models.map((m) => m.name));

/** Scalar field declarations. Relation fields (`user User @relation(...)`) and
 *  back-relations (`posts Post[]`) have no column of their own. */
function scalarFields(body) {
  const out = [];
  for (const m of body.matchAll(/^\s{2}(\w+)\s+(\S+)(.*)$/gm)) {
    const [, name, type, rest] = m;
    const bare = type.replace(/[?[\]]/g, "");
    if (modelNames.has(bare)) continue; // relation field
    if (type.endsWith("[]")) continue; // list back-relation
    out.push({
      name,
      nullable: type.includes("?"),
      unique: /@unique/.test(rest),
    });
  }
  return out;
}

/** `@@attr([a, b])` — modifiers like `sort: Desc` are dropped. */
function blockAttrs(body, attr) {
  return [...body.matchAll(new RegExp(`@@${attr}\\(\\[([^\\]]*)\\]\\)`, "g"))].map((m) =>
    m[1]
      .split(",")
      .map((f) => f.trim().split(/\s*:\s*/)[0].trim())
      .filter(Boolean)
  );
}

// Every index the schema declares, keyed by the name Prisma would generate.
const expectedIndexes = new Map();
for (const model of models) {
  const inlineId = [...model.body.matchAll(/^\s{2}(\w+)\s+\w+\s+@id/gm)].map((m) => m[1]);
  for (const cols of blockAttrs(model.body, "id").concat(
    inlineId.length ? [inlineId] : []
  )) {
    expectedIndexes.set(`${model.name}_pkey`, { table: model.name, cols });
  }
  for (const cols of blockAttrs(model.body, "unique")) {
    expectedIndexes.set(`${model.name}_${cols.join("_")}_key`, {
      table: model.name,
      cols,
    });
  }
  for (const cols of blockAttrs(model.body, "index")) {
    expectedIndexes.set(`${model.name}_${cols.join("_")}_idx`, {
      table: model.name,
      cols,
    });
  }
  for (const field of scalarFields(model.body)) {
    if (field.unique) {
      expectedIndexes.set(`${model.name}_${field.name}_key`, {
        table: model.name,
        cols: [field.name],
      });
    }
  }
}

const expectedColumns = new Map(
  models.map((m) => [
    m.name,
    scalarFields(m.body).map((f) => `${f.name}:${f.nullable ? "null" : "notnull"}`),
  ])
);

// ---------------------------------------------------------------------------
// Replay migrations and introspect
// ---------------------------------------------------------------------------

const db = await PGlite.create();
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((d) => !d.startsWith("."))
  .sort();

console.log(`\nReplaying ${migrations.length} migration(s) into an in-memory Postgres…`);
for (const m of migrations) {
  await db.exec(readFileSync(path.join(MIGRATIONS_DIR, m, "migration.sql"), "utf8"));
}

const indexRows = await db.query(
  `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`
);
const actualIndexes = new Map();
for (const r of indexRows.rows) {
  const inner = r.indexdef.slice(
    r.indexdef.indexOf("(") + 1,
    r.indexdef.lastIndexOf(")")
  );
  const cols = inner
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, "").split(" ")[0])
    .filter(Boolean);
  actualIndexes.set(r.indexname, { table: r.tablename, cols });
}

const columnRows = await db.query(
  `SELECT table_name, column_name, is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' ORDER BY table_name, column_name`
);
const actualColumns = new Map();
for (const r of columnRows.rows) {
  if (!actualColumns.has(r.table_name)) actualColumns.set(r.table_name, []);
  actualColumns
    .get(r.table_name)
    .push(`${r.column_name}:${r.is_nullable === "YES" ? "null" : "notnull"}`);
}

console.log(
  `${models.length} models | ${expectedIndexes.size} indexes declared | ${actualIndexes.size} indexes built\n`
);

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

for (const [name, exp] of [...expectedIndexes].sort()) {
  const act = actualIndexes.get(name);
  if (!act) {
    ok(`index ${name}`, false, "declared in schema.prisma but NO migration creates it");
    continue;
  }
  ok(
    `index ${name}`,
    act.table === exp.table && act.cols.join(",") === exp.cols.join(","),
    `expected ${exp.table}(${exp.cols.join(",")}), got ${act.table}(${act.cols.join(",")})`
  );
}

for (const name of [...actualIndexes.keys()].sort()) {
  if (!expectedIndexes.has(name)) {
    ok(`index ${name}`, false, "the migrations create it but schema.prisma does NOT declare it");
  }
}

for (const [table, cols] of [...expectedColumns].sort()) {
  const act = (actualColumns.get(table) ?? []).slice().sort();
  const exp = cols.slice().sort();
  const missing = exp.filter((c) => !act.includes(c));
  const extra = act.filter((c) => !exp.includes(c));
  ok(
    `columns ${table}`,
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length
      ? `missing [${missing.join(", ")}], unexpected [${extra.join(", ")}]`
      : `${exp.length} columns match`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log(
    "\nDrift found. Fix schema.prisma or the migration SQL so they agree — do NOT\n" +
      "let `prisma migrate dev` generate a migration on the real database until\n" +
      "this is clean."
  );
}
await db.close();
process.exit(fail ? 1 : 0);
