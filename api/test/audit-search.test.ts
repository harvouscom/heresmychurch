import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isoToMicros, queryAuditByChurch, queryAuditByState, queryAuditChangesSince, queryAuditRecent, recordChurchAudit,
} from "../../supabase/functions/make-server-283d8046/audit.ts";
import { queryMonthlyRows, upsertMonthlyRows } from "../../supabase/functions/make-server-283d8046/monthly.ts";
import {
  buildMatchQuery, minTokenMatches, normalizeSearchText, searchTable, setSearchTableReady, syncSearchRegion,
} from "../../supabase/functions/make-server-283d8046/search-table.ts";
import { type Harness, startHarness } from "./harness.ts";

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.mf.dispose(); });

describe("audit timestamps", () => {
  it("parses every cursor format exactly", () => {
    const base = Date.UTC(2026, 9, 14, 21, 8, 14) * 1000;
    expect(isoToMicros("2026-10-14T21:08:14.25057+00:00")).toBe(base + 250570);
    expect(isoToMicros("2026-10-14T21:08:14.250570+00:00")).toBe(base + 250570);
    expect(isoToMicros("2026-10-14T21:08:14.250Z")).toBe(base + 250000);
    expect(isoToMicros("2026-10-14T21:08:14Z")).toBe(base);
    expect(isoToMicros("2026-10-14T21:08:14+00:00")).toBe(base);
    expect(isoToMicros("2026-10-14T16:08:14.000001-05:00")).toBe(base + 1);
    expect(isoToMicros("2026-10-14T23:08:14+0200")).toBe(base);
    expect(() => isoToMicros("yesterday")).toThrow();
  });
});

describe("audit log", () => {
  beforeEach(async () => { await h.db.prepare("DELETE FROM church_audit_log").run(); });
  const entry = (i: number) => ({
    church_id: `US-TX-${i}`, state: "TX", action: "field_updated", field: "website",
    old_value: { v: i }, new_value: "new", source: "test",
  });

  it("50 inserts in one go get unique, increasing timestamps that round-trip", async () => {
    // A stopped clock, as inside one Worker request: only "last + 1" can keep these apart.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 15, 12));
    try {
      await Promise.all(Array.from({ length: 50 }, (_, i) => recordChurchAudit(entry(i))));
    } finally {
      clock.mockRestore();
    }
    const { results } = await h.db.prepare("SELECT created_at, created_us FROM church_audit_log ORDER BY id").all();
    expect(results).toHaveLength(50);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/);
      expect(isoToMicros(results[i].created_at)).toBe(results[i].created_us);
      if (i) expect(results[i].created_us).toBeGreaterThan(results[i - 1].created_us);
    }
  });

  it("stays increasing if the clock goes backwards", async () => {
    await recordChurchAudit(entry(1));
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2020, 0, 1));
    try {
      await recordChurchAudit(entry(2));
    } finally {
      clock.mockRestore();
    }
    const [newest, older] = await queryAuditRecent(2);
    expect(newest.church_id).toBe("US-TX-2");
    expect(isoToMicros(newest.created_at)).toBe(isoToMicros(older.created_at) + 1);
  });

  it("the change feed pages through every row exactly once using its own cursor", async () => {
    await Promise.all(Array.from({ length: 23 }, (_, i) => recordChurchAudit(entry(i))));
    const seen: string[] = [];
    let since = "2020-01-01T00:00:00.000Z";
    for (;;) {
      const rows = await queryAuditChangesSince(since, 5);
      if (!rows.length) break;
      seen.push(...rows.map((r) => r.church_id as string));
      since = rows[rows.length - 1].created_at;
    }
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
  });

  it("continues past a copied row with a trimmed Postgres timestamp, and old ties still sort", async () => {
    const copied = "2026-10-14T21:08:14.25057+00:00";
    const us = isoToMicros(copied);
    for (const id of [101, 102]) {
      await h.db.prepare(
        "INSERT INTO church_audit_log (id, church_id, state, action, source, created_at, created_us) VALUES (?, ?, 'TX', 'field_updated', 'copy', ?, ?)",
      ).bind(id, `US-TX-${id}`, copied, us).run();
    }
    await recordChurchAudit(entry(1));
    expect((await queryAuditChangesSince("2026-10-14T21:08:14.2505Z", 10)).map((r) => r.id)).toEqual([101, 102, expect.any(Number)]);
    const after = await queryAuditChangesSince(copied, 10);
    expect(after.map((r) => r.church_id)).toEqual(["US-TX-1"]);
    expect(after[0].id).toBeGreaterThan(102);
  });

  it("filters the feed and returns the same row shape as Postgres", async () => {
    await recordChurchAudit(entry(1));
    await recordChurchAudit({ state: "TX", action: "state_populated", source: "test" });
    await recordChurchAudit({ ...entry(2), action: "note_added" });
    await recordChurchAudit({ state: "TX", action: "field_updated", source: "no church id" });
    const rows = await queryAuditChangesSince("2020-01-01T00:00:00Z", 10);
    expect(rows.map((r) => r.church_id)).toEqual(["US-TX-1"]);
    expect(rows[0].old_value).toEqual({ v: 1 });
    expect(rows[0].new_value).toBe("new");
    expect(rows[0]).not.toHaveProperty("created_us");
  });

  it("recent, by state and by church are newest first", async () => {
    await recordChurchAudit(entry(1));
    await recordChurchAudit(entry(2));
    await recordChurchAudit({ ...entry(3), state: "CA" });
    expect((await queryAuditRecent(10)).map((r) => r.church_id)).toEqual(["US-TX-3", "US-TX-2", "US-TX-1"]);
    expect((await queryAuditByState("tx", 10)).map((r) => r.church_id)).toEqual(["US-TX-2", "US-TX-1"]);
    expect((await queryAuditByChurch("US-TX-2", 10)).map((r) => r.church_id)).toEqual(["US-TX-2"]);
  });

  it("writes nothing while frozen", async () => {
    h.vars.MAINTENANCE_READONLY = "1";
    await recordChurchAudit(entry(1));
    h.vars.MAINTENANCE_READONLY = "";
    expect(await queryAuditRecent(10)).toEqual([]);
  });
});

describe("monthly snapshots", () => {
  it("upserts on month and state, and filters", async () => {
    const row = { month: "2026-10-01", state_abbrev: "TX", total_churches: 1, total_needs_review: 0, pct_needs_review: 12.5, missing_address: 0, missing_service_times: 0, missing_denomination: 0, total_corrections: 0, churches_improved: 0, population: null, people_per_church: null, churches_per_10k: 1.2345 };
    await upsertMonthlyRows([row, { ...row, state_abbrev: "" }, { ...row, month: "2026-11-01" }]);
    await upsertMonthlyRows([{ ...row, total_churches: 9 }]);
    const tx = await queryMonthlyRows({ month: "2026-10-01", state: "TX" });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ total_churches: 9, pct_needs_review: 12.5, churches_per_10k: 1.2345, population: null });
    expect((await queryMonthlyRows({ from: "2026-11-01" })).map((r) => r.month)).toEqual(["2026-11-01"]);
    expect((await queryMonthlyRows({ to: "2026-10-01" }))).toHaveLength(2);
    expect((await queryMonthlyRows({}))[0].month).toBe("2026-11-01");
  });
});

describe("search", () => {
  const WORDS = ["first", "baptist", "church", "grace", "dallas", "hope", "chapel", "river", "community", "st", "john"];
  const idx = (id: string, n: string, c: string, a = 10) => ({ id, shortId: `s${id}`, n, c, d: "Baptist", ad: "1 Main St", a, la: 32.5, lo: -96.5 });
  const rowCount = async () => (await h.searchDb.prepare("SELECT count(*) AS n FROM church_search").first()).n;

  beforeEach(async () => {
    await h.searchDb.prepare("DELETE FROM church_search").run();
    await setSearchTableReady(true);
  });

  it("normalises like tokenizeSearchText", () => {
    expect(normalizeSearchText("St. John's  Café--Church!")).toBe("st john s caf church");
  });

  it("applies the token rule", () => {
    expect([1, 2, 3, 4, 5, 8].map(minTokenMatches)).toEqual([1, 2, 2, 3, 3, 5]);
    expect(buildMatchQuery(["a", "b", "c"], 2)).toBe('("a" AND "b") OR ("a" AND "c") OR ("b" AND "c")');
  });

  it("matches the 60% rule for 1 to 8 tokens against a brute-force check", async () => {
    // Deterministic pseudo-random church names.
    let seed = 42;
    const next = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const pick = () => WORDS[next(WORDS.length)];
    const churches = Array.from({ length: 400 }, (_, i) => ({ id: `c${i}`, shortId: `${i}`, n: `${pick()} ${pick()} ${pick()}`, c: pick(), d: pick(), ad: pick(), a: i, la: 0, lo: 0 }));
    expect(await syncSearchRegion("US", "TX", churches)).toBe(true);

    for (let size = 1; size <= 8; size++) {
      for (let round = 0; round < 6; round++) {
        const tokens = [...new Set(Array.from({ length: size }, pick))];
        const min = minTokenMatches(tokens.length);
        const expected = churches.filter((ch) => {
          const have = new Set(normalizeSearchText(`${ch.n} ${ch.c} ${ch.d} ${ch.ad}`).split(" "));
          return tokens.filter((t) => have.has(t)).length >= min;
        }).map((ch) => ch.id).sort();
        const found = ((await searchTable(tokens, ["TX"], 5000))?.get("TX") ?? []).map((r) => r.id).sort();
        expect(found, tokens.join(" ")).toEqual(expected);
      }
    }
  });

  it("ranks by match count, then attendance, and returns the KV index shape", async () => {
    await syncSearchRegion("US", "TX", [idx("low", "grace church", "dallas", 5), idx("high", "grace chapel", "dallas", 500), idx("all", "grace river chapel", "dallas", 1)]);
    const rows = (await searchTable(["grace", "river", "chapel"], null))!.get("TX")!;
    expect(rows.map((r) => r.id)).toEqual(["all", "high"]);
    expect(rows[1]).toEqual({ id: "high", shortId: "shigh", n: "grace chapel", c: "dallas", d: "Baptist", a: 500, ad: "1 Main St", la: 32.5, lo: -96.5 });
  });

  it("matches whole tokens only and honours the region filter and limit", async () => {
    await syncSearchRegion("US", "TX", [idx("a", "graceful church", "dallas")]);
    await syncSearchRegion("US", "OK", [idx("b", "grace church", "tulsa"), idx("c", "grace chapel", "tulsa")]);
    expect((await searchTable(["grace"], ["TX"]))!.size).toBe(0);
    expect((await searchTable(["grace"], ["OK"]))!.get("OK")).toHaveLength(2);
    expect((await searchTable(["grace"], ["OK"], 1))!.get("OK")).toHaveLength(1);
  });

  it("syncing a region writes only the rows that changed", async () => {
    await h.searchDb.prepare("CREATE TABLE IF NOT EXISTS write_log (n INTEGER)").run();
    await h.searchDb.prepare("DELETE FROM write_log").run();
    await h.searchDb.prepare("CREATE TRIGGER IF NOT EXISTS log_i AFTER INSERT ON church_search BEGIN INSERT INTO write_log VALUES (1); END;").run();
    await h.searchDb.prepare("CREATE TRIGGER IF NOT EXISTS log_u AFTER UPDATE ON church_search BEGIN INSERT INTO write_log VALUES (1); END;").run();
    await h.searchDb.prepare("CREATE TRIGGER IF NOT EXISTS log_d AFTER DELETE ON church_search BEGIN INSERT INTO write_log VALUES (1); END;").run();
    const writes = async () => {
      const n = (await h.searchDb.prepare("SELECT count(*) AS n FROM write_log").first()).n;
      await h.searchDb.prepare("DELETE FROM write_log").run();
      return n;
    };

    const churches = Array.from({ length: 2000 }, (_, i) => idx(`r${i}`, `church ${i}`, "dallas"));
    await syncSearchRegion("US", "TX", churches);
    expect(await writes()).toBe(2000);

    await syncSearchRegion("US", "TX", churches);
    expect(await writes()).toBe(0);

    const edited = churches.map((c) => (c.id === "r7" ? { ...c, n: "renamed fellowship" } : c)).filter((c) => c.id !== "r9");
    await syncSearchRegion("US", "TX", edited);
    expect(await writes()).toBe(2);
    expect(await rowCount()).toBe(1999);

    // The FTS index followed: the new name is found, the old and deleted rows aren't.
    expect((await searchTable(["renamed"], null))!.get("TX")!.map((r) => r.id)).toEqual(["r7"]);
    const found = (await searchTable(["church"], null, 5000))!.get("TX")!.map((r) => r.id);
    expect(found).not.toContain("r7");
    expect(found).not.toContain("r9");

    await h.searchDb.prepare("DROP TRIGGER log_i").run();
    await h.searchDb.prepare("DROP TRIGGER log_u").run();
    await h.searchDb.prepare("DROP TRIGGER log_d").run();
  });

  it("drops duplicate and blank ids, and an empty list clears the region", async () => {
    await syncSearchRegion("US", "TX", [idx("a", "one", "x"), idx("a", "two", "x"), idx("", "blank", "x")]);
    expect(await rowCount()).toBe(1);
    await syncSearchRegion("US", "TX", []);
    expect(await rowCount()).toBe(0);
  });

  it("returns null when the table isn't ready, so search falls back", async () => {
    await setSearchTableReady(false);
    expect(await searchTable(["grace"], null)).toBeNull();
  });
});
