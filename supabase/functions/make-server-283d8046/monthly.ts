// Monthly impact snapshots: one row per (month, state_abbrev), where state_abbrev "" is national.
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { getD1 } from "./bindings.ts";
import { withRetry } from "./kv-d1.ts";
import { usesD1 } from "./kv-backend.ts";
import { env } from "./runtime.ts";

const TABLE = "monthly_impact_snapshots";
export const MONTHLY_COLUMNS = [
  "month", "state_abbrev", "total_churches", "total_needs_review", "pct_needs_review", "missing_address",
  "missing_service_times", "missing_denomination", "total_corrections", "churches_improved", "population",
  "people_per_church", "churches_per_10k",
] as const;
const D1_COLUMNS = [...MONTHLY_COLUMNS, "country"] as const;

function supabase() {
  return createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Inserts or replaces rows. Throws on failure. */
export async function upsertMonthlyRows(rows: Array<Record<string, unknown>>): Promise<void> {
  if (!rows.length) return;
  if (!usesD1()) {
    const { error } = await supabase().from(TABLE).upsert(rows, { onConflict: "month,state_abbrev" });
    if (error) throw new Error(error.message);
    return;
  }
  await upsertMonthlyRowsD1(rows);
}

export async function upsertMonthlyRowsD1(rows: Array<Record<string, unknown>>): Promise<void> {
  if (!rows.length) return;
  const db = getD1();
  const placeholders = D1_COLUMNS.map((_, i) => `?${i + 1}`).join(", ");
  const updates = D1_COLUMNS.filter((c) => c !== "month" && c !== "state_abbrev")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const sql = `INSERT INTO ${TABLE} (${D1_COLUMNS.join(", ")}) VALUES (${placeholders})
    ON CONFLICT(month, state_abbrev) DO UPDATE SET ${updates}`;
  await withRetry(() => db.batch(rows.map((row) => db.prepare(sql).bind(...D1_COLUMNS.map((c) => row[c] ?? null)))));
}

export type MonthlyQuery = { month?: string; state?: string; from?: string; to?: string };

/** Newest first, up to 500 rows. Dates are YYYY-MM-DD; state is an uppercase region code. */
export async function queryMonthlyRows({ month, state, from, to }: MonthlyQuery): Promise<any[]> {
  if (!usesD1()) {
    let q = supabase().from(TABLE).select("*").order("month", { ascending: false });
    if (month) q = q.eq("month", month);
    if (state) q = q.eq("state_abbrev", state);
    if (from) q = q.gte("month", from);
    if (to) q = q.lte("month", to);
    const { data, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(`${clause} ?${params.length}`);
  };
  if (month) add("month =", month);
  if (state) add("state_abbrev =", state);
  if (from) add("month >=", from);
  if (to) add("month <=", to);
  const sql = `SELECT * FROM ${TABLE}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY month DESC LIMIT 500`;
  const { results } = await withRetry(() => getD1().prepare(sql).bind(...params).all());
  return results ?? [];
}
