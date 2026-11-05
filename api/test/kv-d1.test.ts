import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setKvBucket } from "../../supabase/functions/make-server-283d8046/bindings.ts";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import { SPILL_BYTES, prefixUpperBound } from "../../supabase/functions/make-server-283d8046/kv-d1.ts";
import { type Harness, startHarness } from "./harness.ts";

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.mf.dispose(); });
beforeEach(async () => {
  await h.db.prepare("DELETE FROM kv").run();
  await h.db.prepare("DELETE FROM kv_tombstones").run();
  setKvBucket(h.bucket);
  h.vars.MAINTENANCE_READONLY = "";
});

/** A string value whose JSON form is exactly `bytes` long. */
const ofBytes = (bytes: number) => "x".repeat(bytes - 2);
const row = (key: string) => h.db.prepare("SELECT * FROM kv WHERE key = ?").bind(key).first();
const objectCount = async () => (await h.bucket.list()).objects.length;

describe("matches kv_store.tsx", () => {
  it("get returns undefined on a miss, but a stored null stays null", async () => {
    expect(await kv.get("missing")).toBeUndefined();
    await kv.set("nothing", null);
    expect(await kv.get("nothing")).toBeNull();
  });

  it("round-trips nested values", async () => {
    const value = { a: [1, { b: "é ✝" }], c: null, d: 1.5 };
    await kv.set("k", value);
    expect(await kv.get("k")).toEqual(value);
  });

  it("rejects a value that isn't JSON", async () => {
    await expect(kv.set("k", undefined)).rejects.toThrow();
  });

  it("mget keeps order and returns null for misses across 250 keys", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `m:${i}`);
    await kv.mset(keys.filter((_, i) => i % 2 === 0), keys.filter((_, i) => i % 2 === 0).map((k) => ({ k })));
    const got = await kv.mget(keys);
    expect(got).toHaveLength(250);
    got.forEach((v, i) => expect(v).toEqual(i % 2 === 0 ? { k: keys[i] } : null));
  });

  it("empty lists are safe", async () => {
    await kv.mset([], []);
    await kv.mdel([]);
    expect(await kv.mget([])).toEqual([]);
  });
});

describe("prefix scans", () => {
  it("computes the upper bound for prefixes ending in : and -", () => {
    expect(prefixUpperBound("suggestions:")).toBe("suggestions;");
    expect(prefixUpperBound("suggestions:TX-")).toBe("suggestions:TX.");
    expect(prefixUpperBound("")).toBeNull();
  });

  it("is exact: case-sensitive, _ is not a wildcard, neighbours excluded", async () => {
    await kv.mset(
      ["a_b:1", "axb:1", "A_B:1", "a_b;", "a_b:2", "a_b"],
      ["match1", "wildcard", "uppercase", "after", "match2", "shorter"],
    );
    expect(await kv.getByPrefix("a_b:")).toEqual(["match1", "match2"]);
  });

  it("pages past 500 rows, in key order", async () => {
    const keys = Array.from({ length: 1234 }, (_, i) => `p:${String(i).padStart(5, "0")}`);
    await kv.mset(keys, keys);
    expect(await kv.getByPrefix("p:")).toEqual(keys);
  });

  it("includes spilled values", async () => {
    const big = ofBytes(SPILL_BYTES + 10);
    await kv.mset(["s:1", "s:2", "s:3"], ["one", big, "three"]);
    expect(await kv.getByPrefix("s:")).toEqual(["one", big, "three"]);
  });
});

describe("spilling to R2", () => {
  it("keeps a value at the threshold in D1 and spills one byte over, counting UTF-8 bytes", async () => {
    await kv.set("at", ofBytes(SPILL_BYTES));
    expect((await row("at")).r2_key).toBeNull();

    await kv.set("over", ofBytes(SPILL_BYTES + 1));
    const over = await row("over");
    expect(over.value).toBeNull();
    expect(over.r2_key).toMatch(/^kv\/[0-9a-f]{40}\/.+/);
    expect(await kv.get("over")).toBe(ofBytes(SPILL_BYTES + 1));

    // Each é is 2 bytes, so this is under the limit in characters but over it in bytes.
    const multibyte = "é".repeat(Math.ceil(SPILL_BYTES / 2));
    await kv.set("multi", multibyte);
    expect((await row("multi")).r2_key).not.toBeNull();
    expect(await kv.get("multi")).toBe(multibyte);
  });

  it("handles a Texas-sized value", async () => {
    const churches = Array.from({ length: 17000 }, (_, i) => ({ id: `US-TX-${i}`, name: `Church ${i}`, city: "Dallas", notes: "n".repeat(240) }));
    await kv.set("churches:US:TX", churches);
    expect((await row("churches:US:TX")).size).toBeGreaterThan(4_000_000);
    expect(await kv.get("churches:US:TX")).toEqual(churches);
  });

  it("deletes the old object when replaced or removed", async () => {
    await h.flush();
    const start = await objectCount();
    await kv.set("big", ofBytes(SPILL_BYTES + 5));
    await kv.set("big", ofBytes(SPILL_BYTES + 6));
    await h.flush();
    expect(await objectCount()).toBe(start + 1);

    await kv.set("big", "small now");
    await h.flush();
    expect(await objectCount()).toBe(start);

    await kv.set("big", ofBytes(SPILL_BYTES + 7));
    await kv.del("big");
    await h.flush();
    expect(await objectCount()).toBe(start);
    expect(await kv.get("big")).toBeUndefined();
  });

  it("re-reads the row when the object was replaced mid-read", async () => {
    await kv.set("race", ofBytes(SPILL_BYTES + 5));
    let first = true;
    setKvBucket({
      get: async (key: string) => {
        if (!first) return h.bucket.get(key);
        first = false;
        setKvBucket(h.bucket);
        await kv.set("race", "newer value");
        await h.flush();
        return null;
      },
      put: (...a: any[]) => h.bucket.put(...a),
      delete: (k: any) => h.bucket.delete(k),
    } as never);
    expect(await kv.get("race")).toBe("newer value");
  });

  it("throws rather than returning nothing when a spilled value is really gone", async () => {
    await kv.set("gone", ofBytes(SPILL_BYTES + 5));
    await h.bucket.delete((await row("gone")).r2_key);
    await expect(kv.get("gone")).rejects.toThrow(/spilled value missing/);
  });
});

describe("tombstones", () => {
  it("records deletes, and clears them when the key comes back", async () => {
    const tombstone = (key: string) => h.db.prepare("SELECT * FROM kv_tombstones WHERE key = ?").bind(key).first();
    await kv.set("t", 1);
    await kv.del("t");
    expect(await tombstone("t")).not.toBeNull();
    await kv.set("t", 2);
    expect(await tombstone("t")).toBeNull();
  });
});

describe("freeze", () => {
  it("skips writes, keeps reads, and doesn't notify the publisher", async () => {
    await kv.set("f", "before");
    h.vars.MAINTENANCE_READONLY = "1";
    await kv.set("f", "during");
    await kv.mset(["f"], ["during"]);
    await kv.del("f");
    await kv.mdel(["f"]);
    expect(await kv.get("f")).toBe("before");
  });
});
